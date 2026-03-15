export type DedicatedDbCopyGroup = {
  copyStrategy: string
  key: string
  purpose: string
  tables: readonly string[]
}

export type DedicatedDbSupportTableAction = {
  currentWriter: string
  requiredBeforeCutover: string
  table: string
  targetAction: string
}

export const DEDICATED_DB_COPY_GROUPS: readonly DedicatedDbCopyGroup[] = [
  {
    key: "bootstrap_system_settings",
    purpose:
      "Bootstrap-first workspace settings, dashboard config, targets config, and encrypted credentials.",
    copyStrategy:
      "Copy all rows for the target workspace before any validation or job smoke runs.",
    tables: [
      "config_entries",
      "targets_entries",
      "settings_tokens_encrypted",
    ],
  },
  {
    key: "business_inputs",
    purpose:
      "Preserve business-truth inputs and target state before rebuilding any derived reporting surfaces.",
    copyStrategy:
      "Copy the full retained workspace history immediately after bootstrap settings.",
    tables: [
      "budget_targets_meta",
      "targets_canonical_ranges",
      "targets_effective_daily",
      "targets_errors",
      "cost_settings",
      "sku_costs",
      "budget_plan_monthly",
    ],
  },
  {
    key: "raw_ingest",
    purpose:
      "Seed the raw connector history that downstream facts, reports, and contracts depend on.",
    copyStrategy:
      "Copy the full retained workspace history before any fact or contract validation.",
    tables: [
      "raw_shopify_orders",
      "raw_shopify_line_items",
      "raw_shopify_inventory_levels",
      "raw_shopify_analytics_daily",
      "raw_shopify_analytics_totals",
      "raw_shopify_analytics_breakdowns",
      "raw_ga4_product_funnel",
      "raw_meta_ads_daily",
      "raw_meta_ads_segments_daily",
      "raw_meta_creatives",
      "raw_google_ads_daily",
      "raw_google_ads_segments_daily",
      "raw_tiktok_ads_daily",
      "raw_tiktok_ads_segments_daily",
      "raw_klaviyo_campaigns",
      "raw_klaviyo_flows",
      "budget_history",
    ],
  },
  {
    key: "facts_reports_dimensions",
    purpose:
      "Carry the app-facing materialized reporting layer that pages and jobs currently read directly.",
    copyStrategy:
      "Copy after raw tables so row-count and freshness checks can be compared against their sources.",
    tables: [
      "fact_ads_daily",
      "fact_ads_segments_daily",
      "fact_orders",
      "fact_order_items",
      "dim_creative",
      "report_klaviyo_campaigns",
      "report_klaviyo_flows",
    ],
  },
  {
    key: "contracts",
    purpose:
      "Seed contract tables for immediate dashboard comparison, then re-derive them on the target DB.",
    copyStrategy:
      "Copy current rows last in the reporting layer, then run a bounded contracts refresh against the dedicated DB before cutover.",
    tables: [
      "contract_daily_overview",
      "contract_daily_channel_campaign",
      "contract_creative_performance",
    ],
  },
  {
    key: "job_status",
    purpose:
      "Preserve sync cursors and operator-visible job history without letting stale status mask target validation.",
    copyStrategy:
      "Copy after all data tables, then append target-native smoke-run rows before any secret cutover.",
    tables: ["sync_state", "job_runs", "backfill_runs"],
  },
] as const

export const DEDICATED_DB_SUPPORT_TABLE_ACTIONS: readonly DedicatedDbSupportTableAction[] =
  [
    {
      table: "raw_shopify_markets",
      currentWriter: "Shopify connector",
      targetAction:
        "Do not create or seed this table in the dedicated DB baseline.",
      requiredBeforeCutover:
        "Gate or remove the Shopify support-table write path before jobs target the dedicated DB.",
    },
    {
      table: "raw_shopify_analytics_catalog",
      currentWriter: "GA4 connector",
      targetAction:
        "Do not create or seed this table in the dedicated DB baseline.",
      requiredBeforeCutover:
        "Gate or remove the GA4 analytics-catalog write path before jobs target the dedicated DB.",
    },
    {
      table: "raw_shopify_analytics_dimensions_catalog",
      currentWriter: "GA4 connector",
      targetAction:
        "Do not create or seed this table in the dedicated DB baseline.",
      requiredBeforeCutover:
        "Gate or remove the GA4 dimensions-catalog write path before jobs target the dedicated DB.",
    },
    {
      table: "ads_entity_snapshot",
      currentWriter: "Meta connector and Google compatibility path",
      targetAction:
        "Do not create or seed this table in the dedicated DB baseline.",
      requiredBeforeCutover:
        "Gate or remove the snapshot write path before jobs target the dedicated DB.",
    },
  ] as const

export const DEDICATED_DB_VALIDATION_STEPS = [
  "Confirm the migration set applied to an empty target DB in lexical filename order.",
  "Compare per-table row counts for the copied workspace between the shared source DB and the dedicated target DB.",
  "Run `npm run jobs:contracts:refresh` against the target DB for a short bounded range and confirm fresh rows in the three owned contract tables.",
  "Run one bounded target smoke run for `jobs:hourly` or `jobs:reconcile` only after support-table write paths are gated.",
  "Open the highest-value dashboard routes against the target DB and compare freshness, KPI totals, and table counts against the shared DB for the same range.",
  "Only after those checks pass, update workflow and runtime secrets from shared DB credentials to dedicated DB credentials.",
] as const
