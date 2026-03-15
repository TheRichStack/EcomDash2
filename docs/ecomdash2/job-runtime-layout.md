# EcomDash2 Job Runtime Layout

Last updated: 2026-03-14

## Purpose

This doc locks the filesystem layout and runtime conventions for the EcomDash2-owned standalone job runtime.

The runner, connector, and scheduler ownership passes all build on this same layout. This document stays focused on runtime structure and boundaries rather than product behavior.

## Decision summary

Chosen direction: Option A.

- keep thin CLI entry scripts under `scripts/jobs/**`
- keep reusable job modules under `lib/jobs/**`
- keep reusable connector modules under `lib/connectors/**`
- keep the job runtime app-owned and modular instead of leaving the whole system in `scripts/**`

Language strategy:

- use TypeScript modules for both thin runners and reusable job code
- keep the scripts thin enough that they are only CLI wrappers over `lib/jobs/**`
- once runnable entrypoints land, execute them through a small TypeScript runner dependency such as `tsx`

Current runtime implication:

- the first runnable core-runner pass adds `tsx`
- invoke the thin entrypoints directly from package scripts, for example:
  - `tsx scripts/jobs/hourly.ts`
  - `tsx scripts/jobs/backfill.ts`
  - `tsx scripts/jobs/reconcile.ts`
  - `tsx scripts/jobs/contracts-refresh.ts`

This keeps the implementation app-owned and typed without inventing a parallel JS-only runtime.

## Filesystem layout

```txt
scripts/
  jobs/
    README.md
    hourly.ts
    backfill.ts
    reconcile.ts
    contracts-refresh.ts

lib/
  jobs/
    README.md
    runtime/
      README.md
      env.ts
      settings-env.ts
      db.ts
      cli.ts
    status/
      README.md
      index.ts
    contracts/
      README.md
      index.ts
    runners/
      hourly.ts
      backfill.ts
      reconcile.ts
      contracts-refresh.ts

  connectors/
    README.md
    common/
      README.md
      index.ts
    shopify/
    meta/
    google/
    tiktok/
    klaviyo/
    ga4/
```

Rules:

- `scripts/jobs/**` is for executable entrypoints only.
- `lib/jobs/**` is for reusable runtime code owned by EcomDash2.
- `lib/connectors/**` is for connector-specific API clients, transforms, and ingest scaffolding.
- no V1 imports are allowed anywhere in this tree.

## Entrypoint conventions

Each entrypoint file under `scripts/jobs/**` should do only four things:

1. parse CLI args
2. resolve the job runtime context
3. call one exported runner from `lib/jobs/runners/**`
4. print a compact summary and set `process.exitCode` on failure

Entry scripts must not:

- embed connector transforms
- own SQL for job status writes
- own contract refresh SQL
- create workflow files
- read sibling `dashboard/**` code or files

Canonical first-wave entrypoints:

- `scripts/jobs/hourly.ts`
- `scripts/jobs/backfill.ts`
- `scripts/jobs/reconcile.ts`
- `scripts/jobs/contracts-refresh.ts`

Canonical first-wave job names for status writes:

- `jobs:sync:hourly`
- `jobs:backfill`
- `jobs:reconcile`
- `jobs:contracts:refresh`

## Module boundaries

### `lib/jobs/runtime/**`

Owns job-only runtime concerns:

- CLI argument parsing helpers
- date-window helpers
- workspace resolution
- shared DB client access for jobs
- env hydration from process env plus settings-backed overrides

This layer may reuse app-owned primitives such as `lib/env.ts` and `lib/db/client.ts` where that is clean, but job-specific runtime behavior belongs here, not in route code.

### `lib/jobs/runners/**`

Owns orchestration for each job type:

- hourly sync
- backfill
- reconcile
- contract refresh

Runner modules coordinate connectors, contract refresh, and status helpers. They should be the only place that decides job order.

### `lib/jobs/status/**`

Owns writes to shared job metadata tables:

- `job_runs`
- `backfill_runs`
- `sync_state`

Connectors should return structured results such as `processed`, `cursor`, `tableCounts`, and `metadata`.
Runner/status helpers should persist those results. Connector modules should not write lifecycle rows directly.

### `lib/jobs/contracts/**`

Owns the contract rebuild pipeline used by standalone jobs.

First-wave contract scope:

- `contract_daily_overview`
- `contract_daily_channel_campaign`
- `contract_creative_performance`

Deferred from first-wave contract scope:

- `contract_product_daily`

Reason:

- EcomDash2 does not currently require `contract_product_daily` for the locked reporting pages
- the first standalone-job milestone should stay aligned with the existing keep/defer boundary

### `lib/connectors/common/**`

Owns reusable connector infrastructure:

- connector interface/contracts
- enabled/strict gating
- retry and timeout behavior
- payload validation
- table-ingest helpers for shared write patterns

### `lib/connectors/<connector>/**`

Owns connector-specific behavior only:

- source API clients
- request/response transforms
- connector-local pagination or cursor handling
- mapping source payloads into the shared table payload contract

Each connector folder should stay self-contained and import only the shared connector runtime from `lib/connectors/common/**` plus job runtime helpers from `lib/jobs/**`.

## Env and settings hydration

The first standalone milestone keeps the current shared-secret model.

Base env source:

- process env from the shell or deployment
- existing EcomDash2 env parsing where applicable

Job-specific hydration layer:

- `lib/jobs/runtime/settings-env.ts` should load workspace-scoped overrides from:
  - `config_entries`
  - `settings_tokens_encrypted`
- token rows should be decrypted with `DATA_ENCRYPTION_KEY`

Precedence:

- default mode: deployment env wins, settings-backed values fill blanks
- compatibility mode: `SETTINGS_ENV_MODE=prefer` allows settings-backed values to override env

This keeps the proven workspace-aware secret loading pattern without forcing connector credentials into product-page code.

Important boundary:

- keep the existing connector env key names in the first port wave to reduce migration risk
- do not redesign the credential model in the same pass as the runner extraction
- do not move job credential storage into UI-only config systems

## Job status writes

The first standalone milestone continues to use the shared status tables that EcomDash2 already reads today.

Write ownership:

- `job_runs` for hourly, reconcile, and contract-refresh lifecycle rows
- `backfill_runs` for chunked and resumable backfill execution
- `sync_state` for:
  - the top-level hourly cursor
  - per-connector cursors
  - `last_success_at` markers

Status-write rules:

- status helpers live under `lib/jobs/status/**`
- runners call status helpers before and after each major step
- connector modules return results; they do not write status rows themselves
- EcomDash2 UI keeps reading the same shared tables through app-owned query code

This avoids a new metadata model while the database is still shared.

## Google strategy

Locked strategy: direct API first, bridge fallback second.

Rules:

- the primary Google connector path should call Google directly from `lib/connectors/google/**`
- the old bridge pattern is allowed only as an explicit compatibility fallback
- if a bridge fallback is needed, isolate it behind a connector-local transport module such as `lib/connectors/google/bridge.ts`
- do not port `dashboard/app/api/ingest/google-ads/route.ts` as the primary runtime architecture

Boundary implication:

- the first-wave Google port should target the keep-boundary tables EcomDash2 actually uses
- do not make `raw_google_ads_entity_inventory` or other bridge-era side tables a required dependency for the EcomDash2-owned runner layout

Reason:

- direct-first is simpler to operate
- bridge fallback remains available for hostile auth/runtime environments
- this removes avoidable complexity without forcing a risky connector rewrite later

## Shared DB posture for the first standalone milestone

This layout assumes EcomDash2-owned jobs will run before EcomDash2 gets its own database.

Still shared in the first standalone milestone:

- the Turso database
- the allowed keep-boundary raw, fact, report, and contract tables
- `job_runs`, `backfill_runs`, and `sync_state`
- workspace-scoped settings and encrypted tokens

Shared-only support-table writes are now compatibility-only:

- default mode leaves `CONNECTOR_SUPPORT_TABLES` unset and does not write:
  - `raw_shopify_markets`
  - `raw_shopify_analytics_catalog`
  - `raw_shopify_analytics_dimensions_catalog`
  - `ads_entity_snapshot`
- explicit shared-db compatibility mode uses `CONNECTOR_SUPPORT_TABLES=shared`

Not part of this pass:

- DB schema changes
- migrations
- dedicated EcomDash2 database work
- rewriting the ingestion model around a new storage design

The job runtime should become EcomDash2-owned before the database does.

## Standalone ownership scope

Delivered on top of this layout:

- hourly sync runner
- backfill runner
- daily reconcile runner
- contract refresh runner
- env and settings hydration
- shared connector runtime/common scaffold
- job status writes
- connector ports for:
  - Shopify
  - Meta
  - TikTok
  - Klaviyo
  - GA4
  - Google with direct-first strategy
- committed scheduler/workflow files under `.github/workflows/`

Still intentionally outside this standalone runtime scope:

- diagnostics detection, scoring, and recommendations
- decision queue
- change-event, promo-plan, and promo-episode systems
- V1 brief, diagnose, and investigate support systems
- dedicated-DB work
- dashboard UI work
- settings UI redesign

## Scheduler ownership

EcomDash2 now owns committed workflow files under `.github/workflows/*`:

- `ecomdash2-hourly-sync.yml`
- `ecomdash2-daily-reconcile.yml`
- `ecomdash2-backfill.yml`
- `ecomdash2-contract-refresh.yml`

These workflows call the thin EcomDash2 entrypoints under `scripts/jobs/**`.

Rejected as the operating model:

- remote-only workflow creation through the V1 GitHub CLI setup script

Committed YAML is the source of truth for EcomDash2 scheduling.

## What this runtime still does not do

This standalone runtime still does not:

- introduce dedicated-DB work
- change product routes or dashboard UI
- bring diagnostics/change-event systems into scope
