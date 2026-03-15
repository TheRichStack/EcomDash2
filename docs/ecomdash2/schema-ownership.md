# EcomDash2 Schema Ownership

Last updated: 2026-03-14

## Purpose

This pass makes EcomDash2 the owner of its schema subset without provisioning a dedicated database yet.

After this change:

- `lib/db/migrations/**` is the app-owned schema source of truth for the keep-boundary subset
- the initial migration set is a baseline snapshot split by table family
- the live database is still shared for now

## Owned In A Future Dedicated DB

These tables are in the EcomDash2-owned schema and are represented by the new migration set.

### Config, targets, and encrypted settings

- `config_entries`
- `targets_entries`
- `budget_targets_meta`
- `targets_canonical_ranges`
- `targets_effective_daily`
- `targets_errors`
- `settings_tokens_encrypted`

### Job and sync metadata

- `sync_state`
- `job_runs`
- `backfill_runs`

### Costs, budgets, and business inputs

- `cost_settings`
- `sku_costs`
- `budget_plan_monthly`

### Raw ingest and connector support

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

### Facts, dimensions, reports, and contracts

- `fact_ads_daily`
- `fact_ads_segments_daily`
- `fact_orders`
- `fact_order_items`
- `dim_creative`
- `report_klaviyo_campaigns`
- `report_klaviyo_flows`
- `contract_daily_overview`
- `contract_daily_channel_campaign`
- `contract_creative_performance`

## Shared For Now

All tables above are still physically shared in the current repo phase.

That means:

- EcomDash2 owns the migration definition for them
- EcomDash2 does not yet own the live Turso database that stores them
- the current app and job runtime still read and write the shared database

## Deferred Or Not In The Owned Baseline

These tables are intentionally not created by the EcomDash2 migration set:

- `contract_product_daily`
- `metric_definition_overrides`
- `settings_audit_log`
- `map_audience_rules`
- `map_brand_rules`
- `raw_shopify_analytics_catalog`
- `raw_shopify_analytics_dimensions_catalog`
- `raw_shopify_markets`

Important note:

- app-owned shared-db connector specs still mention `raw_shopify_analytics_catalog`, `raw_shopify_analytics_dimensions_catalog`, and `raw_shopify_markets`
- those are not part of the future owned schema
- runtime now defaults those writes off
- `CONNECTOR_SUPPORT_TABLES=shared` is the explicit shared-db compatibility mode if those writes still need to be re-enabled temporarily

## Not Owned And Explicitly Excluded

These legacy families stay out of the owned migration tree and out of a future dedicated EcomDash2 database:

- `ads_entity_snapshot`
- `change_event`
- `event_impact`
- `raw_google_ads_entity_inventory`
- `diagnostic_event`
- `diagnostic_impact`
- `diagnostic_recommendation`
- `promo_plan`
- `promo_episode`

Additional note:

- current shared-db connector specs still mention `ads_entity_snapshot`
- it is intentionally excluded from the owned schema
- runtime now defaults that write off
- `CONNECTOR_SUPPORT_TABLES=shared` is the explicit shared-db compatibility mode if that write still needs to be re-enabled temporarily

## Initial Migration Set

Current owned migration set:

- `lib/db/migrations/0001_owned_system_and_inputs.sql`
- `lib/db/migrations/0002_owned_shopify_and_analytics.sql`
- `lib/db/migrations/0003_owned_marketing_raw.sql`
- `lib/db/migrations/0004_owned_facts_reports_contracts.sql`
- `lib/db/migrations/0005_owned_indexes.sql`

Migration type:

- baseline snapshot, not a replay of every V1 migration

Port provenance:

- baseline structure from V1 `0001_initial.sql`
- merged keep-boundary changes from V1 `0003`, `0004`, `0008`, `0009`, `0010`, `0013`, `0014`, and `0015`
- the V1 `budget_history` seed from `ads_entity_snapshot` is intentionally omitted because that table is excluded

## Dedicated DB Bootstrap Plan

The next standalone-data step should be:

1. Provision an empty Turso/libSQL database for EcomDash2.
2. Apply `lib/db/migrations/*.sql` in filename order.
3. Copy the owned shared-now tables from the current shared database.
4. Run bounded contract refresh and smoke checks.
5. Cut runtime env vars over only after validation passes.

Bootstrap planning artifacts for that pass now live in:

- `docs/ecomdash2/dedicated-db-bootstrap.md`
- `scripts/db/apply-migrations.ts`
- `scripts/db/copy-seed-plan.ts`

This pass does not make EcomDash2 fully standalone yet. It gives EcomDash2 ownership of the schema subset and a clean starting point for the later dedicated-database cutover.
