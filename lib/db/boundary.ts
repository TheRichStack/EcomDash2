type TableSpec = {
  tableName: string
  orderBy: string
  dateColumn?: string
}

export const ECOMDASH2_TABLE_BOUNDARY = {
  configEntries: {
    tableName: "config_entries",
    orderBy: "setting_key ASC",
  },
  targetEntries: {
    tableName: "targets_entries",
    orderBy: "setting_key ASC",
  },
  budgetTargetsMeta: {
    tableName: "budget_targets_meta",
    orderBy: "updated_at DESC",
  },
  targetsCanonicalRanges: {
    tableName: "targets_canonical_ranges",
    orderBy: "priority ASC, start_date ASC",
  },
  targetsEffectiveDaily: {
    tableName: "targets_effective_daily",
    dateColumn: "date",
    orderBy: "date ASC",
  },
  targetsErrors: {
    tableName: "targets_errors",
    orderBy: "created_at DESC",
  },
  settingsTokensEncrypted: {
    tableName: "settings_tokens_encrypted",
    orderBy: "token_key ASC",
  },
  syncState: {
    tableName: "sync_state",
    orderBy: "source_key ASC, state_key ASC",
  },
  jobRuns: {
    tableName: "job_runs",
    orderBy: "started_at DESC",
  },
  backfillRuns: {
    tableName: "backfill_runs",
    orderBy: "started_at DESC",
  },
  costSettings: {
    tableName: "cost_settings",
    orderBy: "updated_at DESC",
  },
  skuCosts: {
    tableName: "sku_costs",
    orderBy: "product_title ASC, variant_title ASC, sku ASC, row_key ASC",
  },
  budgetPlanMonthly: {
    tableName: "budget_plan_monthly",
    orderBy: "month ASC, channel ASC",
  },
  contractDailyOverview: {
    tableName: "contract_daily_overview",
    dateColumn: "date",
    orderBy: "date ASC",
  },
  contractDailyChannelCampaign: {
    tableName: "contract_daily_channel_campaign",
    dateColumn: "date",
    orderBy: "date ASC, platform ASC, campaign_name ASC",
  },
  factAdsDaily: {
    tableName: "fact_ads_daily",
    dateColumn: "date",
    orderBy:
      "date ASC, platform ASC, campaign_name ASC, adset_name ASC, ad_name ASC",
  },
  contractCreativePerformance: {
    tableName: "contract_creative_performance",
    dateColumn: "date",
    orderBy: "date ASC, creative_id ASC",
  },
  dimCreative: {
    tableName: "dim_creative",
    orderBy: "last_seen DESC",
  },
  factOrderItems: {
    tableName: "fact_order_items",
    dateColumn: "order_date",
    orderBy: "order_date ASC",
  },
  factOrders: {
    tableName: "fact_orders",
    dateColumn: "order_date",
    orderBy: "order_date ASC",
  },
  rawShopifyAnalyticsDaily: {
    tableName: "raw_shopify_analytics_daily",
    dateColumn: "date",
    orderBy: "date ASC, metric ASC",
  },
  rawShopifyAnalyticsTotals: {
    tableName: "raw_shopify_analytics_totals",
    dateColumn: "end_date",
    orderBy: "start_date ASC, end_date ASC, metric ASC",
  },
  rawShopifyAnalyticsBreakdowns: {
    tableName: "raw_shopify_analytics_breakdowns",
    dateColumn: "end_date",
    orderBy:
      "end_date ASC, breakdown_id ASC, dimension ASC, dimension_value ASC, metric ASC",
  },
  rawGa4ProductFunnel: {
    tableName: "raw_ga4_product_funnel",
    dateColumn: "end_date",
    orderBy: "start_date ASC, end_date ASC, item_name ASC, item_id ASC",
  },
  rawShopifyInventoryLevels: {
    tableName: "raw_shopify_inventory_levels",
    dateColumn: "snapshot_date",
    orderBy: "snapshot_date ASC, product_title ASC, variant_title ASC",
  },
  rawShopifyLineItems: {
    tableName: "raw_shopify_line_items",
    orderBy: "line_item_id ASC",
  },
  rawShopifyOrders: {
    tableName: "raw_shopify_orders",
    orderBy: "created_at ASC, updated_at ASC",
  },
  reportKlaviyoCampaigns: {
    tableName: "report_klaviyo_campaigns",
    dateColumn: "send_date",
    orderBy: "send_date ASC",
  },
  reportKlaviyoFlows: {
    tableName: "report_klaviyo_flows",
    dateColumn: "send_date",
    orderBy: "send_date ASC",
  },
} as const satisfies Record<string, TableSpec>

export type EcomDash2TableKey = keyof typeof ECOMDASH2_TABLE_BOUNDARY

export const ECOMDASH2_SLICE_TABLES = {
  overview: [
    "contractDailyOverview",
    "contractDailyChannelCampaign",
    "reportKlaviyoCampaigns",
    "reportKlaviyoFlows",
    "contractCreativePerformance",
    "dimCreative",
    "factOrderItems",
    "skuCosts",
    "targetsEffectiveDaily",
    "budgetTargetsMeta",
    "costSettings",
    "configEntries",
    "targetEntries",
  ],
  settings: [
    "settingsTokensEncrypted",
    "syncState",
    "jobRuns",
    "backfillRuns",
    "configEntries",
    "targetEntries",
    "costSettings",
    "skuCosts",
    "budgetPlanMonthly",
    "budgetTargetsMeta",
    "targetsCanonicalRanges",
    "targetsEffectiveDaily",
    "targetsErrors",
    "rawShopifyInventoryLevels",
    "rawShopifyLineItems",
    "factOrderItems",
  ],
  shopifyProfit: [
    "contractDailyOverview",
    "factOrderItems",
    "costSettings",
    "skuCosts",
    "configEntries",
    "targetEntries",
  ],
  shopifyProducts: ["factOrderItems", "rawShopifyOrders", "configEntries"],
  shopifyFunnel: [
    "rawShopifyAnalyticsDaily",
    "rawShopifyAnalyticsTotals",
    "rawShopifyAnalyticsBreakdowns",
    "rawGa4ProductFunnel",
    "factOrderItems",
    "factOrders",
  ],
  shopifyInventory: ["rawShopifyInventoryLevels", "factOrderItems"],
  paidMedia: [
    "contractDailyOverview",
    "contractDailyChannelCampaign",
    "factAdsDaily",
    "factOrderItems",
    "costSettings",
    "skuCosts",
    "configEntries",
    "targetEntries",
  ],
  creative: [
    "contractCreativePerformance",
    "dimCreative",
    "configEntries",
    "targetEntries",
  ],
  email: ["reportKlaviyoCampaigns", "reportKlaviyoFlows"],
} as const
