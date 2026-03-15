export type EcomDashMetricId =
  | "shopify_net_revenue"
  | "total_sales"
  | "blended_ad_spend"
  | "platform_attributed_revenue"
  | "email_revenue"
  | "email_sends"
  | "email_open_rate"
  | "email_click_rate"
  | "email_revenue_per_recipient"
  | "email_placed_orders"
  | "sessions"
  | "add_to_cart_rate"
  | "checkout_rate"
  | "purchase_conversion_rate"
  | "orders_count"
  | "units_sold"
  | "units_refunded"
  | "refund_amount"
  | "return_rate"
  | "paid_purchases"
  | "paid_roas"
  | "paid_cpa"
  | "impressions"
  | "view_content"
  | "outbound_clicks"
  | "video_3s_views"
  | "video_15s_views"
  | "video_p25_viewed"
  | "video_p50_viewed"
  | "video_p75_viewed"
  | "video_p100_viewed"
  | "thumbstop_rate"
  | "hold_rate"
  | "cogs"
  | "allocated_overhead"
  | "aov"
  | "mer"
  | "gross_profit"
  | "net_profit_after_ads"
  | "contribution_margin"
  | "net_profit"
  | "product_net_profit_proxy"

export type MetricUnit = "currency" | "count" | "ratio" | "percent"

export type MetricDirection =
  | "higher_is_better"
  | "lower_is_better"
  | "neutral"

export type MetricFormulaToken =
  | {
      type: "metric"
      metricId: EcomDashMetricId
    }
  | {
      type: "operator"
      value: "+" | "-" | "*" | "/" | "(" | ")"
    }

export type MetricDefinition = {
  id: EcomDashMetricId
  label: string
  description: string
  unit: MetricUnit
  direction: MetricDirection
  formulaReadable: string
  formulaTokens: MetricFormulaToken[]
  dependencies: EcomDashMetricId[]
  sources: string[]
  isBase: boolean
  notes?: string
}

export type MetricPoolId =
  | "overview-kpi"
  | "overview-pacing"
  | "shopify-profit-kpi"
  | "creative-card"

export type MetricPool = {
  id: MetricPoolId
  label: string
  metricIds: readonly EcomDashMetricId[]
}

export type MetricCatalogUnit = MetricUnit | "unknown"

export type MetricCatalogDirection = MetricDirection | "unknown"

export type MetricCatalogImplementationStatus =
  | "implemented"
  | "placeholder"
  | "unknown"

export type MetricCatalogEntry = {
  id: string
  label: string
  description: string
  unit: MetricCatalogUnit
  direction: MetricCatalogDirection
  metricType: string
  formulaReadable: string
  dependencies: string[]
  sources: string[]
  aliases: string[]
  gotchas: string[]
  notes: string
  usedInDashboard: boolean
  isBase: boolean
  implementationStatus: MetricCatalogImplementationStatus
  displayOrder: number
  sourceFile: string
}

export type MetricCatalogSource = {
  status: "ready" | "unavailable"
  source:
    | "ecomdash2-definitions"
    | "unavailable"
  completeness:
    | "full-app-owned"
    | "none"
  entries: MetricCatalogEntry[]
  message?: string
}
