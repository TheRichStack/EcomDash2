# EcomDash2 Dedicated DB Bootstrap

Last updated: 2026-03-14

## Purpose

This doc turns the future dedicated-database move into an app-owned, reviewable plan.

It does not provision the dedicated DB and it does not switch production traffic yet.

What this pass adds:

- app-owned migration-apply scaffolding under `scripts/db/apply-migrations.ts`
- app-owned copy/seed planning scaffolding under `scripts/db/copy-seed-plan.ts`
- one explicit cutover checklist and rollback path

## Required env vars for the bootstrap pass

### Source DB

These point at the current shared Turso/libSQL database.

- preferred:
  - `ECOMDASH2_SOURCE_TURSO_URL`
  - `ECOMDASH2_SOURCE_TURSO_AUTH_TOKEN`
- fallback accepted by the bootstrap tooling:
  - `ECOMDASH2_TURSO_URL`
  - `ECOMDASH2_TURSO_AUTH_TOKEN`
  - `TURSO_DATABASE_URL`
  - `TURSO_AUTH_TOKEN`

### Target DB

These point at the new dedicated EcomDash2 database.

- `ECOMDASH2_TARGET_TURSO_URL`
- `ECOMDASH2_TARGET_TURSO_AUTH_TOKEN`

### Shared bootstrap context

- `ECOMDASH2_DEFAULT_WORKSPACE_ID`
  - default workspace for copy-plan generation and smoke runs
- `DATA_ENCRYPTION_KEY`
  - still required for encrypted token rows and any target-side job smoke run that hydrates settings-backed secrets

Important runtime note:

- the live app and workflows still use `ECOMDASH2_TURSO_URL` and `ECOMDASH2_TURSO_AUTH_TOKEN` today
- do not replace those runtime secrets until the dedicated target passes bootstrap validation

## Migration apply order

Run from `EcomDash2/TRS_Starter_Core`.

Recommended dry run:

```bash
npm run db:migrate:apply -- --dry-run
```

Real apply:

```bash
npm run db:migrate:apply
```

Current baseline order:

1. `lib/db/migrations/0001_owned_system_and_inputs.sql`
2. `lib/db/migrations/0002_owned_shopify_and_analytics.sql`
3. `lib/db/migrations/0003_owned_marketing_raw.sql`
4. `lib/db/migrations/0004_owned_facts_reports_contracts.sql`
5. `lib/db/migrations/0005_owned_indexes.sql`

Rules:

1. Apply files in lexical filename order.
2. Treat the current set as the fresh-database baseline.
3. Use the script against an empty target DB by default.
4. Do not create `Defer` or `Cut` tables in the target DB during bootstrap.

## Copy and seed order

The initial dedicated bootstrap should remain workspace-scoped and explicit.

Use the plan script to print the ordered manifest:

```bash
npm run db:copy:plan -- --workspace=default
```

Or emit JSON for operator review:

```bash
npm run db:copy:plan -- --workspace=default --format=json
```

Recommended order:

### 1. Bootstrap-first system and settings tables

- `config_entries`
- `targets_entries`
- `settings_tokens_encrypted`

Why first:

- target-side job smoke runs and dashboard settings reads depend on these rows immediately

### 2. Business-input tables

- `budget_targets_meta`
- `targets_canonical_ranges`
- `targets_effective_daily`
- `targets_errors`
- `cost_settings`
- `sku_costs`
- `budget_plan_monthly`

Why second:

- these are shared business truth and should exist before validating any reporting output

### 3. Raw ingest tables

- `raw_shopify_orders`
- `raw_shopify_line_items`
- `raw_shopify_inventory_levels`
- `raw_shopify_analytics_daily`
- `raw_shopify_analytics_totals`
- `raw_shopify_analytics_breakdowns`
- `raw_ga4_product_funnel`
- `raw_meta_ads_daily`
- `raw_meta_ads_segments_daily`
- `raw_meta_creatives`
- `raw_google_ads_daily`
- `raw_google_ads_segments_daily`
- `raw_tiktok_ads_daily`
- `raw_tiktok_ads_segments_daily`
- `raw_klaviyo_campaigns`
- `raw_klaviyo_flows`
- `budget_history`

Why third:

- facts, reports, and contracts depend on this layer

### 4. Fact, report, and dimension tables

- `fact_ads_daily`
- `fact_ads_segments_daily`
- `fact_orders`
- `fact_order_items`
- `dim_creative`
- `report_klaviyo_campaigns`
- `report_klaviyo_flows`

Why fourth:

- these are app-facing read models and should be validated against their raw sources after copy

### 5. Contract tables

- `contract_daily_overview`
- `contract_daily_channel_campaign`
- `contract_creative_performance`

Why fifth:

- these are derived tables
- copy them for quick parity checks, then rebuild them on the target DB using `npm run jobs:contracts:refresh`

### 6. Job and status tables

- `sync_state`
- `job_runs`
- `backfill_runs`

Why last:

- status metadata should not appear valid before the target data copy and contract refresh have completed

## Not-owned support tables that must be handled before cutover

These tables are still written on the shared DB today but are intentionally not in the owned baseline.

They must not be created or copied into the dedicated EcomDash2 database.

Current runtime default:

- these writes are now disabled by default
- `CONNECTOR_SUPPORT_TABLES=shared` is the explicit shared-db compatibility mode that re-enables them temporarily while still on the shared DB
- keep that flag unset when validating or cutting over to a dedicated DB

| Table | Current writer | Required cutover action |
| --- | --- | --- |
| `raw_shopify_markets` | Shopify connector | Drop from the dedicated target and gate or remove the write path before jobs point at the target DB |
| `raw_shopify_analytics_catalog` | GA4 connector | Drop from the dedicated target and gate or remove the write path before jobs point at the target DB |
| `raw_shopify_analytics_dimensions_catalog` | GA4 connector | Drop from the dedicated target and gate or remove the write path before jobs point at the target DB |
| `ads_entity_snapshot` | Meta connector | Drop from the dedicated target and keep the write path disabled before jobs point at the target DB |

This schema/runtime mismatch is now compatibility-gated, but the dedicated cutover must still keep the flag unset and avoid creating these tables on the target DB. Google direct and bridge paths already stay on keep-boundary tables and do not write `ads_entity_snapshot` in the current EcomDash2 runtime.

## Validation after bootstrap

Minimum target validation sequence:

1. Confirm migrations applied to an empty target DB without creating non-owned tables.
2. Compare row counts for every copied owned table between source and target for the chosen workspace.
3. Run `npm run jobs:contracts:refresh -- --workspace=<workspace> --from=YYYY-MM-DD --to=YYYY-MM-DD` against the target DB for a short recent range.
4. Verify fresh rows in:
   - `contract_daily_overview`
   - `contract_daily_channel_campaign`
   - `contract_creative_performance`
5. After support-table write paths are gated, run one bounded target smoke job:
   - `npm run jobs:hourly`
   - or `npm run jobs:reconcile`
6. Open the main dashboard routes against the target DB and compare:
   - KPI totals
   - freshness labels
   - row counts in the highest-value tables
7. Only after those checks pass, update runtime and workflow secrets to the target DB values.

## Cutover checklist

1. Provision a fresh dedicated Turso/libSQL database for EcomDash2.
2. Set `ECOMDASH2_TARGET_TURSO_URL` and `ECOMDASH2_TARGET_TURSO_AUTH_TOKEN`.
3. Run `npm run db:migrate:apply`.
4. Generate and review the copy plan with `npm run db:copy:plan`.
5. Copy the owned table groups in the documented order.
6. Do not create or seed the four not-owned support tables.
7. Confirm `CONNECTOR_SUPPORT_TABLES` is unset or `owned` before any target-side connector smoke run.
8. Run target-side contract refresh and bounded job smoke runs.
9. Validate the dashboard against the target DB on the highest-value pages.
10. Update GitHub workflow secrets and runtime env from shared DB credentials to dedicated DB credentials.
11. Re-run smoke checks after the secret change.
12. Keep the shared DB credentials available until the target run is stable.

## Rollback strategy

If dedicated-DB cutover fails:

1. Restore `ECOMDASH2_TURSO_URL` and `ECOMDASH2_TURSO_AUTH_TOKEN` in local env and GitHub secrets to the shared DB values.
2. Re-run one bounded shared-DB contract refresh or hourly smoke run if the failure happened after partial target-side job execution and operator confidence needs to be restored.
3. Leave the dedicated target DB intact for forensic comparison; do not destroy it during rollback.
4. Record which validation step failed and whether the failure came from:
   - migration apply
   - data copy mismatch
   - support-table write leakage
   - job smoke failure
   - dashboard parity failure

## What still remains before the final cutover

- provision the dedicated DB for real
- execute the actual data copy
- keep `CONNECTOR_SUPPORT_TABLES` unset or `owned` so writes remain disabled for:
  - `raw_shopify_markets`
  - `raw_shopify_analytics_catalog`
  - `raw_shopify_analytics_dimensions_catalog`
  - `ads_entity_snapshot`
- run target-side smoke jobs against the dedicated DB
- update runtime and GitHub secrets from shared DB values to dedicated DB values
- validate dashboard parity against the dedicated DB before declaring cutover complete

After this planning pass, the remaining standalone-data milestone is execution: dedicated database provisioning, data copy, validation, and final cutover.
