# EcomDash2 Job Extraction Audit

Last updated: 2026-03-13

## Purpose

This doc audits the current V1 connector/job system and defines the recommended extraction path for making EcomDash2 operationally standalone.

It answers:

- what currently runs in V1
- which tables those jobs populate
- what EcomDash2 still depends on
- what should be copied, ported, rebuilt, deferred, or cut
- where the current job architecture can be improved during extraction

## Current reality

EcomDash2 is currently:

- runtime-isolated from `dashboard/**`
- able to read the shared Turso database
- able to read shared job metadata like `job_runs` and `sync_state`
- owning standalone runners and connectors under `scripts/jobs/**`, `lib/jobs/**`, and `lib/connectors/**`
- owning committed GitHub Actions workflows under `.github/workflows/ecomdash2-*.yml`
- owning the keep-boundary migration source under `lib/db/migrations/**`
- writing the allowed raw, fact, report, contract, and job-status tables from app-owned runtime code

EcomDash2 is **not** currently:

- owning a dedicated database
- owning diagnostics/change-event systems
- fully detached from the shared Turso infrastructure
- cut over to an EcomDash2-dedicated database yet

Today, EcomDash2 runs its own standalone job path against the shared Turso boundary instead of consuming only V1-era job outputs.

## V1 runner inventory

### Core runners

V1 currently has these operational runners:

- `jobs:sync:hourly`
  - script: `dashboard/scripts/runHourlySync.mjs`
  - purpose: incremental ingestion, contract refresh, diagnostics refresh
- `jobs:backfill`
  - script: `dashboard/scripts/runBackfill.mjs`
  - purpose: historical backfill by connector and date range
- `jobs:reconcile`
  - script: `dashboard/scripts/runDailyReconcile.mjs`
  - purpose: re-fetch known-stale windows
- `jobs:diagnostics:backfill`
  - script: `dashboard/scripts/runDiagnosticsBackfill.mjs`
  - purpose: rebuild diagnostics outputs from existing data
- contract-only rebuild
  - script: `dashboard/scripts/refreshContractsBackfill.mjs`
  - purpose: rebuild contract tables from existing raw/fact tables

### Supporting setup scripts

- `setup:github:hourly`
  - script: `dashboard/scripts/setupGitHubHourlySync.mjs`
  - purpose: pushes workflow YAML and secrets to GitHub via `gh`
- `setup:google:bridge`
  - script: `dashboard/scripts/setupGoogleAdsBridge.mjs`
  - purpose: configures the Google Ads bridge deployment/runtime
- `cleanup:google:bridge`
  - script: `dashboard/scripts/cleanupGoogleAdsBridge.mjs`

## Important scheduling finding

The current V1 scheduling model is not well-owned by the repo.

There is **no committed `.github/workflows` directory** under `dashboard/`.
Instead, V1 uses `setupGitHubHourlySync.mjs` to create or update the workflow remotely via the GitHub CLI.

EcomDash2 outcome:

- do **not** preserve this pattern as the long-term job ownership model
- keep scheduler/workflow definitions committed in the repo under `.github/workflows/ecomdash2-*.yml`
- treat the old remote setup script as migration/reference material only

## Connector inventory

### Shopify

Source:
- `dashboard/scripts/connectors/shopify.mjs`

Writes:
- `raw_shopify_orders`
- `raw_shopify_line_items`
- `raw_shopify_inventory_levels`
- `raw_shopify_markets`
- `fact_orders`
- `fact_order_items`

Required env/secrets:
- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_ACCESS_TOKEN`

Extraction recommendation:
- **port**

Reason:
- EcomDash2 depends heavily on Shopify facts and inventory
- this is core ingestion, not optional

### Meta

Source:
- `dashboard/scripts/connectors/meta/index.mjs`

Writes:
- `raw_meta_ads_daily`
- `raw_meta_ads_segments_daily`
- `raw_meta_creatives`
- `ads_entity_snapshot`
- `budget_history`
- `fact_ads_daily`
- `fact_ads_segments_daily`
- `dim_creative`

Required env/secrets:
- `META_ACCESS_TOKEN`
- `META_AD_ACCOUNT_ID`

Extraction recommendation:
- **port**

Reason:
- core dependency for Paid Media and Creative

### Google

Source:
- `dashboard/scripts/connectors/google.mjs`
- ingest route: `dashboard/app/api/ingest/google-ads/route.ts`

Writes/uses:
- `raw_google_ads_daily`
- `raw_google_ads_segments_daily`
- `raw_google_ads_entity_inventory`
- `ads_entity_snapshot`
- `budget_history`
- `fact_ads_daily`
- `fact_ads_segments_daily`

Current architecture note:
- V1 supports both direct API and bridge-assisted ingestion
- the bridge route is still active and tied to `DATA_API_KEY`

Extraction recommendation:
- **port, but simplify**

Recommended target model:
- prefer direct API support first if viable for the live environment
- keep bridge support as a compatibility mode, not the primary architecture

Reason:
- this is the connector with the most avoidable complexity
- EcomDash2 should own a clearer “direct first, bridge optional” story

### TikTok

Source:
- `dashboard/scripts/connectors/tiktok.mjs`

Writes:
- `raw_tiktok_ads_daily`
- `raw_tiktok_ads_segments_daily`
- `budget_history`
- `fact_ads_daily`
- `fact_ads_segments_daily`

Required env/secrets:
- `TIKTOK_ACCESS_TOKEN`
- `TIKTOK_ADVERTISER_ID`

Extraction recommendation:
- **port**

### Klaviyo

Source:
- `dashboard/scripts/connectors/klaviyo.mjs`

Writes:
- `raw_klaviyo_campaigns`
- `raw_klaviyo_flows`
- `report_klaviyo_campaigns`
- `report_klaviyo_flows`

Required env/secrets:
- `KLAVIYO_PRIVATE_API_KEY`

Extraction recommendation:
- **port**

Reason:
- Email depends directly on these report tables

### GA4

Source:
- `dashboard/scripts/connectors/ga4.mjs`

Writes:
- `raw_shopify_analytics_daily`
- `raw_shopify_analytics_breakdowns`
- `raw_shopify_analytics_catalog`
- `raw_shopify_analytics_dimensions_catalog`
- `raw_ga4_product_funnel`

Required env/secrets:
- `GA4_PROPERTY_ID`
- auth via service account or refresh-token flow

Extraction recommendation:
- **port**

Reason:
- Shopify Funnel depends on these tables

## Shared job plumbing worth preserving

### Settings/env hydration

Source:
- `dashboard/scripts/lib/settingsEnv.mjs`

Current job behavior:
- loads token/config overrides from DB before connector execution
- decrypts `settings_tokens_encrypted`
- allows per-workspace secrets/config to live in the DB

Extraction recommendation:
- **copy/port**

Reason:
- this is a good pattern
- it allows operational secrets to remain workspace-aware

### Connector common scaffold

Source:
- `dashboard/scripts/connectors/common.mjs`

Current behavior:
- connector enabled/strict logic
- retry/timeouts
- table-spec ingestion
- direct-connector scaffold

Extraction recommendation:
- **copy/port**

Reason:
- this is already close to good reusable job infrastructure

### Job metadata/status tables

Source:
- `dashboard/lib/db/queries/jobs.ts`
- `dashboard/app/api/jobs/status/route.ts`

Tables:
- `job_runs`
- `sync_state`
- `backfill_runs`

Extraction recommendation:
- **copy/port behavior**

Reason:
- EcomDash2 already surfaces freshness/status in the UI
- once EcomDash2 owns jobs, it should also own status writes

### Contract refresh pipeline

Source:
- `dashboard/scripts/lib/contracts/index.mjs`

Writes:
- `contract_daily_overview`
- `contract_daily_channel_campaign`
- `contract_creative_performance`
- `contract_product_daily`

Extraction recommendation:
- **copy/port**

Reason:
- these contract tables are central to EcomDash2
- rebuilding them independently is lower risk than redesigning them now

## What should not be first-wave extraction scope

These V1 systems exist, but should not be part of EcomDash2’s first standalone-job milestone:

- diagnostics detection/scoring/recommendation pipeline
- decision queue
- change-event / promo-plan / promo-episodes systems
- old brief / diagnose / investigate support systems

Reason:
- they fall outside the locked EcomDash2 product shape
- they add operational complexity without helping the first standalone cutover

Recommendation:
- **defer or cut entirely for EcomDash2 jobs**

## Recommended extraction strategy

Do not rewrite the whole ingestion stack from scratch now.

Recommended order:

### Phase 1. Repo-standalone, still shared-data

Goal:
- move EcomDash2 into its own repo/runtime
- still point at the shared database and shared job outputs

Needed:
- app-owned CI/CD
- app-owned workflow ownership
- documentation

### Phase 2. Job ownership without schema redesign

Goal:
- run the existing ingestion/refresh model from EcomDash2-owned code
- still write to the same allowed keep-boundary tables

Copy/port first:
- settings env hydration
- connector common scaffold
- hourly runner
- backfill runner
- reconcile runner
- contract refresh pipeline
- Shopify connector
- Meta connector
- TikTok connector
- Klaviyo connector
- GA4 connector
- Google connector, but with direct API as preferred path

Do not port yet:
- diagnostics pipeline
- decision queue
- legacy change-event systems

### Phase 3. Dedicated database

Goal:
- point EcomDash2-owned jobs at an EcomDash2-owned Turso database

Needed:
- EcomDash2-owned migrations for the keep-boundary schema
- data copy/bootstrap strategy
- credentials/secrets setup

### Phase 4. Operational hardening

Goal:
- make the extracted jobs reliable and maintainable

Needed:
- committed workflow files
- smoke checks
- clearer job health/freshness checks
- documented backfill/resume/recovery runbooks

## Opportunities to improve during extraction

### 1. Commit workflows into the repo

Improve:
- replace remote-only workflow creation with committed `.github/workflows/*`

Why:
- easier to audit
- easier to version
- easier to claim EcomDash2 truly owns scheduling

### 2. Split ingestion and contract rebuild more explicitly

Current state:
- hourly sync always runs connector steps and contract refresh together

Improve:
- make contract rebuild a first-class independent runner in EcomDash2

Why:
- easier recovery
- easier targeted rebuilds
- lower-cost reruns

### 3. Simplify Google strategy

Current state:
- direct API + bridge dual model

Improve:
- direct API first
- bridge optional, documented fallback only

Why:
- lower operational complexity
- fewer moving pieces

### 4. Move script logic toward app-owned job modules

Improve:
- use app-owned modules under something like `lib/jobs/**` and thinner runner scripts

Why:
- cleaner testing
- cleaner reuse
- easier eventual API-triggered or scheduled entrypoints

### 5. Add explicit smoke checks

Useful checks:
- connector auth/config status
- raw-table writes in expected windows
- contract refresh row counts
- `job_runs` health
- per-workspace freshness status

## Concrete recommendation

Near-term recommendation:

- keep using the current database(s)
- do **not** rewrite schema/jobs from scratch first
- extract job ownership by porting the proven V1 runners and connectors into EcomDash2-owned code
- deliberately leave diagnostics/change-event systems behind
- move scheduler ownership into committed EcomDash2 workflows

This gets EcomDash2 to:
- operationally independent
- much faster
- with much lower risk

without forcing a simultaneous database redesign.

## Suggested first extraction worker sequence

1. Job/runtime inventory implementation plan
   - define destination folders in EcomDash2
   - decide script/module split
2. Core runner port
   - hourly
   - backfill
   - reconcile
   - contract refresh
3. Connector port batch 1
   - Shopify
   - Meta
   - TikTok
   - Klaviyo
   - GA4
4. Google connector strategy pass
   - direct API first
   - bridge compatibility second
5. Scheduler + operations pass
   - committed workflows
   - runbooks
   - health/freshness verification
