# EcomDash2 Backend Boundary

## Goal

Define the database and data-layer boundary for EcomDash2 before implementation starts, so the rebuild can reuse the current live data safely without dragging legacy V1 workflow tables and config patterns into the new app.

## Database strategy

Recommended approach:

- reuse the current live Turso database during the rebuild
- keep using demo data during development
- define a strict EcomDash2 schema boundary now
- only move to a dedicated EcomDash2 database after the app is stable enough to extract cleanly

This avoids rebuilding connector jobs and backfill flow too early while still preventing schema drift.

## Core rule

EcomDash2 may temporarily share the old database.

EcomDash2 must not behave like it depends on the whole old database.

The new app should be written as if it owns only the table subset listed in `Keep`, ignores `Defer`, and never touches `Cut`.

## Isolation rules

- all EcomDash2 DB access should go through new app-owned server loaders or query adapters
- no long-term imports from sibling `dashboard/` query modules after the first bootstrap pass
- no reads from legacy diagnostics, change-log, or exception-workflow tables
- no writes to legacy V1-only UI config keys
- EcomDash2-specific UI config keys in `config_entries` and `targets_entries` should be namespaced, for example `ecomdash2.*`
- shared business-input tables can stay shared across apps where the underlying business truth is the same
- a future dedicated EcomDash2 database should be created from the `Keep` set only

## Table-level keep / defer / cut

### Keep

These tables are allowed as part of the EcomDash2 dependency boundary.

#### System and settings

- `config_entries`
  Notes: allowed, but EcomDash2-specific keys must be namespaced
- `targets_entries`
  Notes: allowed, but EcomDash2-specific keys must be namespaced
- `budget_targets_meta`
- `targets_canonical_ranges`
- `targets_effective_daily`
- `targets_errors`
- `settings_tokens_encrypted`
- `sync_state`
- `job_runs`
- `backfill_runs`
- `cost_settings`
- `sku_costs`
- `budget_plan_monthly`

#### Raw ingest and connector support

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
  Notes: required by the current channel-contract pipeline for historical budget coverage

#### Facts, dimensions, reports, contracts

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

### Defer

These tables may remain in the shared database, but EcomDash2 should not depend on them in v1 unless a later build proves they are necessary.

- `contract_product_daily`
  Reason: useful future optimization, but current Products page still reads from `fact_order_items`
- `metric_definition_overrides`
  Reason: metrics are read-only in v1
- `settings_audit_log`
  Reason: useful operationally, but not required for v1 product behavior
- `map_audience_rules`
  Reason: not a v1 app dependency
- `map_brand_rules`
  Reason: not a v1 app dependency
- `raw_shopify_analytics_catalog`
  Reason: connector and analytics metadata, not a v1 page dependency
- `raw_shopify_analytics_dimensions_catalog`
  Reason: connector and analytics metadata, not a v1 page dependency
- `raw_shopify_markets`
  Reason: not a locked v1 page dependency

### Cut

These tables are legacy V1 workflow or diagnostics surfaces and should not be depended on by EcomDash2.

- `ads_entity_snapshot`
- `change_event`
- `event_impact`
- `raw_google_ads_entity_inventory`
- `diagnostic_event`
- `diagnostic_impact`
- `diagnostic_recommendation`
- `promo_plan`
- `promo_episode`

If EcomDash2 eventually gets its own dedicated database, these tables should be omitted unless the product scope changes.

## Shared business truth vs app-specific config

### Shared business-truth tables

These should remain shared if both apps point at the same workspace because they describe the business, not the UI:

- `cost_settings`
- `sku_costs`
- `budget_plan_monthly`
- `targets_canonical_ranges`
- `targets_effective_daily`
- `budget_targets_meta`
- `settings_tokens_encrypted`
- `sync_state`
- `job_runs`
- `backfill_runs`

### App-specific config

These can be shared physically, but EcomDash2 must namespace its keys:

- `config_entries`
- `targets_entries`

Rules:

- do not write V1-specific `V2_*` style config keys from EcomDash2
- store EcomDash2-only layout and KPI config under `ecomdash2.*`
- if a setting is genuinely shared business logic, document it explicitly rather than assuming it is safe to share

## Page and route dependency map

This is the intended read or write boundary for EcomDash2 pages.

### `/dashboard`

Reads:

- `contract_daily_overview`
- `contract_daily_channel_campaign`
- `report_klaviyo_campaigns`
- `report_klaviyo_flows`
- `contract_creative_performance`
- `dim_creative`
- `fact_order_items` for top-products style modules until or unless `contract_product_daily` is adopted
- `targets_effective_daily`
- `budget_targets_meta`
- `cost_settings`
- namespaced `config_entries` for KPI strip and page config

Writes:

- none

### `/dashboard/paid-media`
### `/dashboard/paid-media/meta`
### `/dashboard/paid-media/google`
### `/dashboard/paid-media/tiktok`

Reads:

- `fact_ads_daily`
- `fact_ads_segments_daily`
- `contract_daily_channel_campaign`
- namespaced `config_entries` and `targets_entries` where target-aware formatting or workspace config is needed

Pipeline support behind those reads:

- `budget_history`

Writes:

- none from reporting pages

### `/dashboard/paid-media/creative`

Reads:

- `contract_creative_performance`
- `dim_creative`
- `fact_ads_daily`
- `raw_meta_ads_daily` for raw-payload-backed extra Meta creative metrics

Writes:

- none

### `/dashboard/shopify/profit`

Reads:

- `contract_daily_overview`
- `cost_settings`
- namespaced `config_entries`
- namespaced `targets_entries`

Writes:

- none from the reporting page

### `/dashboard/shopify/products`

Reads:

- `fact_order_items`
- `raw_shopify_orders`
- namespaced `config_entries`
- namespaced `targets_entries` only if page-level shared thresholds remain needed

Future optional optimization:

- `contract_product_daily`

Writes:

- none

### `/dashboard/shopify/inventory`

Reads:

- `raw_shopify_inventory_levels`
- `fact_order_items` for velocity fallback and sales-rate logic

Writes:

- none

### `/dashboard/shopify/funnel`

Reads:

- `raw_shopify_analytics_daily`
- `raw_shopify_analytics_totals`
- `raw_shopify_analytics_breakdowns`
- `raw_ga4_product_funnel`
- `fact_order_items`
- `fact_orders`

Writes:

- none

### `/dashboard/email`

Reads:

- `report_klaviyo_campaigns`
- `report_klaviyo_flows`

Writes:

- none

### `/dashboard/settings/workspace`

Reads:

- `settings_tokens_encrypted`
- `sync_state`
- `job_runs`
- `backfill_runs`
- namespaced `config_entries`

Writes:

- `settings_tokens_encrypted`
- namespaced `config_entries`

### `/dashboard/settings/dashboard`

Reads:

- namespaced `config_entries`
- namespaced `targets_entries` only if needed for shared pacing or KPI config

Writes:

- namespaced `config_entries`
- namespaced `targets_entries` if used

### `/dashboard/settings/inputs/costs`

Reads:

- `cost_settings`
- `sku_costs`
- `raw_shopify_inventory_levels`
- `raw_shopify_line_items`
- `fact_order_items`

Writes:

- `cost_settings`
- `sku_costs`

### `/dashboard/settings/inputs/budgets`

Reads:

- `budget_plan_monthly`
- `budget_targets_meta`

Writes:

- `budget_plan_monthly`
- `budget_targets_meta`

### `/dashboard/settings/inputs/targets`

Reads:

- `targets_canonical_ranges`
- `targets_effective_daily`
- `targets_errors`
- `budget_targets_meta`
- namespaced `config_entries`
- namespaced `targets_entries`

Writes:

- `targets_canonical_ranges`
- `targets_effective_daily`
- `targets_errors`
- `budget_targets_meta`
- namespaced `config_entries`
- namespaced `targets_entries`

### `/dashboard/settings/metrics`

Reads:

- metric registry files or registry-backed read model
- `metric_definition_overrides` only if we later choose to expose override state

Writes:

- none in v1

### `/dashboard/settings/syncs`

Reads:

- `sync_state`
- `job_runs`
- `backfill_runs`

Writes:

- none from the UI

## What removing V1 tabs does and does not remove

Dropping a V1 page does not automatically justify dropping its underlying shared tables.

Examples:

- dropping `Shopify Lifecycle` does not remove the need for `fact_orders`
- dropping `Brief / Diagnose / Investigate` does not remove the need for core contract tables
- dropping diagnostics and change-log UI does justify cutting the diagnostics and change-event table families from the EcomDash2 boundary

## Extraction rule for a future standalone EcomDash2 database

If and when EcomDash2 moves to its own live database:

1. start from the `Keep` set only
2. add `Defer` tables only if implementation proves they are needed
3. do not port `Cut` tables
4. port or rewrite the connector and contract scripts only for the `Keep` path
5. keep EcomDash2-specific config keys namespaced from day one so cutover is mechanical rather than forensic
