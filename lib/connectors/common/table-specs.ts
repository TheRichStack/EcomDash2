type TableSpec = {
  dateField?: string
  dbTable: string
  keyColumns: string[]
  tableKey: string
}

const TABLE_SPECS: TableSpec[] = [
  {
    tableKey: "RAW_SHOPIFY_ORDERS",
    dbTable: "raw_shopify_orders",
    keyColumns: ["order_id"],
    dateField: "created_at",
  },
  {
    tableKey: "RAW_SHOPIFY_LINE_ITEMS",
    dbTable: "raw_shopify_line_items",
    keyColumns: ["line_item_id"],
  },
  {
    tableKey: "RAW_SHOPIFY_INVENTORY_LEVELS",
    dbTable: "raw_shopify_inventory_levels",
    keyColumns: ["snapshot_date", "variant_id"],
    dateField: "snapshot_date",
  },
  {
    tableKey: "RAW_SHOPIFY_ANALYTICS_DAILY",
    dbTable: "raw_shopify_analytics_daily",
    keyColumns: ["dataset", "date", "metric"],
    dateField: "date",
  },
  {
    tableKey: "RAW_SHOPIFY_ANALYTICS_TOTALS",
    dbTable: "raw_shopify_analytics_totals",
    keyColumns: ["dataset", "start_date", "end_date", "metric"],
    dateField: "end_date",
  },
  {
    tableKey: "RAW_SHOPIFY_ANALYTICS_CATALOG",
    dbTable: "raw_shopify_analytics_catalog",
    keyColumns: ["dataset", "metric"],
  },
  {
    tableKey: "RAW_SHOPIFY_ANALYTICS_BREAKDOWNS",
    dbTable: "raw_shopify_analytics_breakdowns",
    keyColumns: [
      "dataset",
      "start_date",
      "end_date",
      "breakdown_id",
      "dimension",
      "dimension_value",
      "metric",
    ],
    dateField: "end_date",
  },
  {
    tableKey: "RAW_SHOPIFY_ANALYTICS_DIMENSIONS_CATALOG",
    dbTable: "raw_shopify_analytics_dimensions_catalog",
    keyColumns: ["dataset", "dimension"],
  },
  {
    tableKey: "RAW_SHOPIFY_MARKETS",
    dbTable: "raw_shopify_markets",
    keyColumns: ["market_id"],
  },
  {
    tableKey: "RAW_GA4_PRODUCT_FUNNEL",
    dbTable: "raw_ga4_product_funnel",
    keyColumns: ["start_date", "end_date", "item_id"],
  },
  {
    tableKey: "RAW_META_ADS_DAILY",
    dbTable: "raw_meta_ads_daily",
    keyColumns: ["date", "account_id", "ad_id"],
    dateField: "date",
  },
  {
    tableKey: "RAW_META_ADS_SEGMENTS_DAILY",
    dbTable: "raw_meta_ads_segments_daily",
    keyColumns: ["date", "account_id", "ad_id", "country", "device"],
    dateField: "date",
  },
  {
    tableKey: "RAW_META_CREATIVES",
    dbTable: "raw_meta_creatives",
    keyColumns: ["creative_id"],
  },
  {
    tableKey: "ADS_ENTITY_SNAPSHOT",
    dbTable: "ads_entity_snapshot",
    keyColumns: ["channel", "level", "entity_id", "synced_at"],
    dateField: "synced_at",
  },
  {
    tableKey: "BUDGET_HISTORY",
    dbTable: "budget_history",
    keyColumns: ["platform", "campaign_id", "effective_date"],
    dateField: "effective_date",
  },
  {
    tableKey: "RAW_GOOGLE_ADS_DAILY",
    dbTable: "raw_google_ads_daily",
    keyColumns: ["date", "customer_id", "ad_id"],
    dateField: "date",
  },
  {
    tableKey: "RAW_GOOGLE_ADS_SEGMENTS_DAILY",
    dbTable: "raw_google_ads_segments_daily",
    keyColumns: ["date", "customer_id", "ad_id", "country", "device"],
    dateField: "date",
  },
  {
    tableKey: "RAW_TIKTOK_ADS_DAILY",
    dbTable: "raw_tiktok_ads_daily",
    keyColumns: ["date", "advertiser_id", "ad_id"],
    dateField: "date",
  },
  {
    tableKey: "RAW_TIKTOK_ADS_SEGMENTS_DAILY",
    dbTable: "raw_tiktok_ads_segments_daily",
    keyColumns: ["date", "advertiser_id", "ad_id", "country", "device"],
    dateField: "date",
  },
  {
    tableKey: "RAW_KLAVIYO_CAMPAIGNS",
    dbTable: "raw_klaviyo_campaigns",
    keyColumns: ["campaign_id", "send_date"],
    dateField: "send_date",
  },
  {
    tableKey: "RAW_KLAVIYO_FLOWS",
    dbTable: "raw_klaviyo_flows",
    keyColumns: ["flow_id", "send_date"],
    dateField: "send_date",
  },
  {
    tableKey: "FACT_ADS_DAILY",
    dbTable: "fact_ads_daily",
    keyColumns: ["date", "platform", "account_id", "ad_id"],
    dateField: "date",
  },
  {
    tableKey: "FACT_ADS_SEGMENTS_DAILY",
    dbTable: "fact_ads_segments_daily",
    keyColumns: ["date", "platform", "account_id", "ad_id", "country", "device"],
    dateField: "date",
  },
  {
    tableKey: "FACT_ORDERS",
    dbTable: "fact_orders",
    keyColumns: ["order_id"],
    dateField: "order_date",
  },
  {
    tableKey: "FACT_ORDER_ITEMS",
    dbTable: "fact_order_items",
    keyColumns: ["line_item_id"],
    dateField: "order_date",
  },
  {
    tableKey: "DIM_CREATIVE",
    dbTable: "dim_creative",
    keyColumns: ["creative_id"],
  },
  {
    tableKey: "REPORT_KLAVIYO_CAMPAIGNS",
    dbTable: "report_klaviyo_campaigns",
    keyColumns: ["campaign_id", "send_date"],
    dateField: "send_date",
  },
  {
    tableKey: "REPORT_KLAVIYO_FLOWS",
    dbTable: "report_klaviyo_flows",
    keyColumns: ["flow_id", "send_date"],
    dateField: "send_date",
  },
]

export const TABLE_SPEC_BY_KEY = Object.fromEntries(
  TABLE_SPECS.flatMap((spec) => [
    [spec.tableKey, spec],
    [spec.dbTable, spec],
    [spec.tableKey.toLowerCase(), spec],
  ])
) as Record<string, TableSpec>

export function resolveTableSpec(tableKey: string) {
  const normalized = String(tableKey ?? "").trim()

  return (
    TABLE_SPEC_BY_KEY[normalized] ??
    TABLE_SPEC_BY_KEY[normalized.toUpperCase()] ??
    TABLE_SPEC_BY_KEY[normalized.toLowerCase()] ??
    null
  )
}
