import "server-only"

import { formulaSignatureFromTokens } from "@/lib/metrics/formulas"
import type {
  EcomDashMetricId,
  MetricDefinition,
  MetricPool,
  MetricPoolId,
} from "@/types/metrics"

// First-slice runtime registry only. Settings should use loadMetricsCatalogSource
// for the full read-only catalog bootstrap.
const FIRST_SLICE_RUNTIME_METRIC_REGISTRY: ReadonlyArray<MetricDefinition> = [
  {
    id: "shopify_net_revenue",
    label: "Revenue",
    description: "Net revenue from Shopify orders for the selected period.",
    unit: "currency",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_daily_overview.total_revenue.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_daily_overview"],
    isBase: true,
  },
  {
    id: "total_sales",
    label: "Total Sales",
    description:
      "Top-line sales value used by the Shopify Profit slice for P and L reporting.",
    unit: "currency",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_daily_overview.total_revenue.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_daily_overview"],
    isBase: true,
    notes:
      "For the initial EcomDash2 slices, Total Sales and Revenue resolve from the same contract field.",
  },
  {
    id: "blended_ad_spend",
    label: "Ad Spend",
    description: "Blended paid-media spend across the selected period.",
    unit: "currency",
    direction: "lower_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_daily_overview.total_spend.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_daily_overview", "contract_daily_channel_campaign"],
    isBase: true,
  },
  {
    id: "platform_attributed_revenue",
    label: "Platform Attributed Revenue",
    description:
      "Revenue attributed by Meta, Google, and TikTok for the selected period.",
    unit: "currency",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_daily_overview meta/google/TikTok revenue, or contract_daily_channel_campaign.revenue when grouped for paid-media reporting.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_daily_overview", "contract_daily_channel_campaign"],
    isBase: true,
  },
  {
    id: "email_revenue",
    label: "Email Revenue",
    description:
      "Combined Klaviyo campaign and flow revenue for the selected period.",
    unit: "currency",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from report_klaviyo_campaigns.revenue and report_klaviyo_flows.revenue.",
    formulaTokens: [],
    dependencies: [],
    sources: ["report_klaviyo_campaigns", "report_klaviyo_flows"],
    isBase: true,
  },
  {
    id: "email_sends",
    label: "Sends",
    description:
      "Combined Klaviyo campaign and flow sends for the selected period.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from report_klaviyo_campaigns.sends and report_klaviyo_flows.sends.",
    formulaTokens: [],
    dependencies: [],
    sources: ["report_klaviyo_campaigns", "report_klaviyo_flows"],
    isBase: true,
  },
  {
    id: "email_open_rate",
    label: "Open Rate",
    description:
      "Weighted unique-open rate across Klaviyo campaign and flow deliveries.",
    unit: "percent",
    direction: "higher_is_better",
    formulaReadable:
      "email_open_rate = total unique opens / total delivered * 100 across report_klaviyo_campaigns and report_klaviyo_flows.",
    formulaTokens: [],
    dependencies: [],
    sources: ["report_klaviyo_campaigns", "report_klaviyo_flows"],
    isBase: false,
  },
  {
    id: "email_click_rate",
    label: "Click Rate",
    description:
      "Weighted unique-click rate across Klaviyo campaign and flow deliveries.",
    unit: "percent",
    direction: "higher_is_better",
    formulaReadable:
      "email_click_rate = total unique clicks / total delivered * 100 across report_klaviyo_campaigns and report_klaviyo_flows.",
    formulaTokens: [],
    dependencies: [],
    sources: ["report_klaviyo_campaigns", "report_klaviyo_flows"],
    isBase: false,
  },
  {
    id: "email_revenue_per_recipient",
    label: "Revenue / Recipient",
    description:
      "Combined email revenue divided by total delivered recipients for the selected period.",
    unit: "currency",
    direction: "higher_is_better",
    formulaReadable:
      "email_revenue_per_recipient = total email revenue / total delivered across report_klaviyo_campaigns and report_klaviyo_flows.",
    formulaTokens: [],
    dependencies: [],
    sources: ["report_klaviyo_campaigns", "report_klaviyo_flows"],
    isBase: false,
  },
  {
    id: "email_placed_orders",
    label: "Placed Orders",
    description:
      "Email-attributed placed orders when the Klaviyo report tables expose an orders field.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from optional placed-order fields on report_klaviyo_campaigns and report_klaviyo_flows.",
    formulaTokens: [],
    dependencies: [],
    sources: ["report_klaviyo_campaigns", "report_klaviyo_flows"],
    isBase: true,
    notes:
      "The current shared report-table schema may omit placed-order columns, so loaders must handle this metric as unavailable.",
  },
  {
    id: "sessions",
    label: "Sessions",
    description: "Store sessions captured for the selected funnel reporting period.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from raw_shopify_analytics_daily.sessions, with exact-range raw_shopify_analytics_totals rows used when available.",
    formulaTokens: [],
    dependencies: [],
    sources: ["raw_shopify_analytics_daily", "raw_shopify_analytics_totals"],
    isBase: true,
  },
  {
    id: "add_to_cart_rate",
    label: "Add to Cart Rate",
    description:
      "Add to cart stage count divided by sessions for the selected period.",
    unit: "percent",
    direction: "higher_is_better",
    formulaReadable: "add_to_cart_rate = add_to_carts / sessions * 100",
    formulaTokens: [{ type: "metric", metricId: "sessions" }],
    dependencies: ["sessions"],
    sources: ["raw_shopify_analytics_daily", "raw_shopify_analytics_totals"],
    isBase: false,
    notes:
      "The stage numerator comes from the Shopify funnel add_to_carts metric even though the count itself is page-owned in the funnel slice.",
  },
  {
    id: "checkout_rate",
    label: "Checkout Rate",
    description:
      "Checkout stage count divided by sessions for the selected period.",
    unit: "percent",
    direction: "higher_is_better",
    formulaReadable: "checkout_rate = checkouts / sessions * 100",
    formulaTokens: [{ type: "metric", metricId: "sessions" }],
    dependencies: ["sessions"],
    sources: ["raw_shopify_analytics_daily", "raw_shopify_analytics_totals"],
    isBase: false,
    notes:
      "The stage numerator comes from the Shopify funnel checkouts metric even though the count itself is page-owned in the funnel slice.",
  },
  {
    id: "purchase_conversion_rate",
    label: "Purchase Conversion Rate",
    description:
      "Purchase stage count divided by sessions for the selected period.",
    unit: "percent",
    direction: "higher_is_better",
    formulaReadable: "purchase_conversion_rate = purchases / sessions * 100",
    formulaTokens: [{ type: "metric", metricId: "sessions" }],
    dependencies: ["sessions"],
    sources: ["raw_shopify_analytics_daily", "raw_shopify_analytics_totals"],
    isBase: false,
    notes:
      "The purchase-stage numerator comes from Shopify analytics funnel purchases, while the separate Orders KPI can resolve from fact_orders.",
  },
  {
    id: "orders_count",
    label: "Orders",
    description: "Total Shopify orders in the selected period.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_daily_overview.total_orders.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_daily_overview"],
    isBase: true,
  },
  {
    id: "units_sold",
    label: "Units Sold",
    description: "Total units sold across Shopify line items in the selected period.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from fact_order_items.quantity aggregated for the selected period.",
    formulaTokens: [],
    dependencies: [],
    sources: ["fact_order_items"],
    isBase: true,
  },
  {
    id: "units_refunded",
    label: "Units Refunded",
    description:
      "Total refunded units across Shopify line items in the selected period.",
    unit: "count",
    direction: "lower_is_better",
    formulaReadable:
      "Source-reported/base metric from fact_order_items.qty_refunded, with loader fallback to quantity - net_quantity where needed.",
    formulaTokens: [],
    dependencies: [],
    sources: ["fact_order_items"],
    isBase: true,
  },
  {
    id: "refund_amount",
    label: "Refunds",
    description: "Total refunded value across Shopify line items in the selected period.",
    unit: "currency",
    direction: "lower_is_better",
    formulaReadable:
      "Source-reported/base metric from fact_order_items.refund_amount, with loader fallback to line_total - net_line_total where needed.",
    formulaTokens: [],
    dependencies: [],
    sources: ["fact_order_items"],
    isBase: true,
  },
  {
    id: "return_rate",
    label: "Return Rate",
    description:
      "Refunded units divided by units sold for the selected period.",
    unit: "percent",
    direction: "lower_is_better",
    formulaReadable: "return_rate = units_refunded / units_sold * 100",
    formulaTokens: [
      { type: "metric", metricId: "units_refunded" },
      { type: "operator", value: "/" },
      { type: "metric", metricId: "units_sold" },
    ],
    dependencies: ["units_refunded", "units_sold"],
    sources: ["fact_order_items"],
    isBase: false,
  },
  {
    id: "paid_purchases",
    label: "Purchases",
    description:
      "Attributed paid-media purchases or conversions in the selected period.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_daily_channel_campaign.purchases.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_daily_channel_campaign"],
    isBase: true,
  },
  {
    id: "paid_roas",
    label: "ROAS",
    description:
      "Return on ad spend based on platform attributed revenue divided by ad spend.",
    unit: "ratio",
    direction: "higher_is_better",
    formulaReadable:
      "paid_roas = platform_attributed_revenue / blended_ad_spend",
    formulaTokens: [
      { type: "metric", metricId: "platform_attributed_revenue" },
      { type: "operator", value: "/" },
      { type: "metric", metricId: "blended_ad_spend" },
    ],
    dependencies: ["platform_attributed_revenue", "blended_ad_spend"],
    sources: ["contract_daily_overview", "contract_daily_channel_campaign"],
    isBase: false,
  },
  {
    id: "paid_cpa",
    label: "CPA",
    description:
      "Cost per attributed purchase based on ad spend divided by paid purchases.",
    unit: "currency",
    direction: "lower_is_better",
    formulaReadable: "paid_cpa = blended_ad_spend / paid_purchases",
    formulaTokens: [
      { type: "metric", metricId: "blended_ad_spend" },
      { type: "operator", value: "/" },
      { type: "metric", metricId: "paid_purchases" },
    ],
    dependencies: ["blended_ad_spend", "paid_purchases"],
    sources: ["contract_daily_channel_campaign"],
    isBase: false,
  },
  {
    id: "impressions",
    label: "Impressions",
    description: "Creative-level impressions for the selected period.",
    unit: "count",
    direction: "neutral",
    formulaReadable:
      "Source-reported/base metric from contract_creative_performance.impressions.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_creative_performance"],
    isBase: true,
  },
  {
    id: "view_content",
    label: "View Content",
    description: "Creative-level content-view actions for the selected period.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_creative_performance.view_content.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_creative_performance"],
    isBase: true,
  },
  {
    id: "outbound_clicks",
    label: "Outbound Clicks",
    description: "Creative-level outbound clicks for the selected period.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_creative_performance.outbound_clicks.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_creative_performance"],
    isBase: true,
  },
  {
    id: "video_3s_views",
    label: "Video 3s Views",
    description:
      "Creative-level video views that reached 3 seconds in the selected period.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_creative_performance.video_3s_views.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_creative_performance"],
    isBase: true,
  },
  {
    id: "video_15s_views",
    label: "Video 15s Views",
    description:
      "Creative-level video views that reached 15 seconds in the selected period.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_creative_performance.video_15s_views.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_creative_performance"],
    isBase: true,
  },
  {
    id: "video_p25_viewed",
    label: "Video 25% Views",
    description:
      "Creative-level video views that reached 25% completion in the selected period.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_creative_performance.video_p25_viewed.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_creative_performance"],
    isBase: true,
  },
  {
    id: "video_p50_viewed",
    label: "Video 50% Views",
    description:
      "Creative-level video views that reached 50% completion in the selected period.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_creative_performance.video_p50_viewed.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_creative_performance"],
    isBase: true,
  },
  {
    id: "video_p75_viewed",
    label: "Video 75% Views",
    description:
      "Creative-level video views that reached 75% completion in the selected period.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_creative_performance.video_p75_viewed.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_creative_performance"],
    isBase: true,
  },
  {
    id: "video_p100_viewed",
    label: "Video 100% Views",
    description:
      "Creative-level video views that reached 100% completion in the selected period.",
    unit: "count",
    direction: "higher_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_creative_performance.video_p100_viewed.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_creative_performance"],
    isBase: true,
  },
  {
    id: "thumbstop_rate",
    label: "Thumbstop Rate",
    description:
      "Creative-level video 3-second views divided by impressions.",
    unit: "percent",
    direction: "higher_is_better",
    formulaReadable: "thumbstop_rate = video_3s_views / impressions * 100",
    formulaTokens: [
      { type: "metric", metricId: "video_3s_views" },
      { type: "operator", value: "/" },
      { type: "metric", metricId: "impressions" },
    ],
    dependencies: ["video_3s_views", "impressions"],
    sources: ["contract_creative_performance"],
    isBase: false,
  },
  {
    id: "hold_rate",
    label: "Hold Rate",
    description:
      "Creative-level video 15-second views divided by 3-second views.",
    unit: "percent",
    direction: "higher_is_better",
    formulaReadable: "hold_rate = video_15s_views / video_3s_views * 100",
    formulaTokens: [
      { type: "metric", metricId: "video_15s_views" },
      { type: "operator", value: "/" },
      { type: "metric", metricId: "video_3s_views" },
    ],
    dependencies: ["video_15s_views", "video_3s_views"],
    sources: ["contract_creative_performance"],
    isBase: false,
  },
  {
    id: "cogs",
    label: "COGS",
    description: "Cost of goods sold for the selected period.",
    unit: "currency",
    direction: "lower_is_better",
    formulaReadable:
      "Source-reported/base metric from contract_daily_overview.cogs.",
    formulaTokens: [],
    dependencies: [],
    sources: ["contract_daily_overview", "fact_order_items"],
    isBase: true,
  },
  {
    id: "allocated_overhead",
    label: "Allocated Overhead",
    description:
      "Daily overhead allocation derived from cost settings monthly overhead.",
    unit: "currency",
    direction: "lower_is_better",
    formulaReadable: "allocated_overhead = monthly_overhead / days_in_month(date)",
    formulaTokens: [],
    dependencies: [],
    sources: ["cost_settings"],
    isBase: true,
  },
  {
    id: "aov",
    label: "AOV",
    description: "Average order value based on Shopify net revenue and order count.",
    unit: "currency",
    direction: "higher_is_better",
    formulaReadable: "aov = shopify_net_revenue / orders_count",
    formulaTokens: [
      { type: "metric", metricId: "shopify_net_revenue" },
      { type: "operator", value: "/" },
      { type: "metric", metricId: "orders_count" },
    ],
    dependencies: ["shopify_net_revenue", "orders_count"],
    sources: ["contract_daily_overview"],
    isBase: false,
  },
  {
    id: "mer",
    label: "MER",
    description: "Marketing efficiency ratio based on revenue divided by ad spend.",
    unit: "ratio",
    direction: "higher_is_better",
    formulaReadable: "mer = shopify_net_revenue / blended_ad_spend",
    formulaTokens: [
      { type: "metric", metricId: "shopify_net_revenue" },
      { type: "operator", value: "/" },
      { type: "metric", metricId: "blended_ad_spend" },
    ],
    dependencies: ["shopify_net_revenue", "blended_ad_spend"],
    sources: ["contract_daily_overview"],
    isBase: false,
  },
  {
    id: "gross_profit",
    label: "Gross Profit",
    description: "Revenue after cost of goods sold.",
    unit: "currency",
    direction: "higher_is_better",
    formulaReadable: "gross_profit = shopify_net_revenue - cogs",
    formulaTokens: [
      { type: "metric", metricId: "shopify_net_revenue" },
      { type: "operator", value: "-" },
      { type: "metric", metricId: "cogs" },
    ],
    dependencies: ["shopify_net_revenue", "cogs"],
    sources: ["contract_daily_overview"],
    isBase: false,
  },
  {
    id: "net_profit_after_ads",
    label: "Net Profit After Ads",
    description:
      "Gross profit after paid-media costs and before allocated overhead.",
    unit: "currency",
    direction: "higher_is_better",
    formulaReadable: "net_profit_after_ads = gross_profit - blended_ad_spend",
    formulaTokens: [
      { type: "metric", metricId: "gross_profit" },
      { type: "operator", value: "-" },
      { type: "metric", metricId: "blended_ad_spend" },
    ],
    dependencies: ["gross_profit", "blended_ad_spend"],
    sources: ["contract_daily_overview"],
    isBase: false,
  },
  {
    id: "contribution_margin",
    label: "Contribution Margin",
    description:
      "Sales remaining after COGS and paid-media costs, before allocated overhead.",
    unit: "currency",
    direction: "higher_is_better",
    formulaReadable:
      "contribution_margin = total_sales - cogs - blended_ad_spend",
    formulaTokens: [
      { type: "metric", metricId: "total_sales" },
      { type: "operator", value: "-" },
      { type: "metric", metricId: "cogs" },
      { type: "operator", value: "-" },
      { type: "metric", metricId: "blended_ad_spend" },
    ],
    dependencies: ["total_sales", "cogs", "blended_ad_spend"],
    sources: ["contract_daily_overview"],
    isBase: false,
  },
  {
    id: "net_profit",
    label: "Net Profit",
    description:
      "Contribution margin after the daily allocated overhead rule used in Shopify Profit.",
    unit: "currency",
    direction: "higher_is_better",
    formulaReadable: "net_profit = contribution_margin - allocated_overhead",
    formulaTokens: [
      { type: "metric", metricId: "contribution_margin" },
      { type: "operator", value: "-" },
      { type: "metric", metricId: "allocated_overhead" },
    ],
    dependencies: ["contribution_margin", "allocated_overhead"],
    sources: ["contract_daily_overview", "cost_settings"],
    isBase: false,
  },
  {
    id: "product_net_profit_proxy",
    label: "Net Profit",
    description:
      "Refund-adjusted product profit proxy used by the Shopify Products slice.",
    unit: "currency",
    direction: "higher_is_better",
    formulaReadable: "product_net_profit_proxy = gross_profit - refund_amount",
    formulaTokens: [
      { type: "metric", metricId: "gross_profit" },
      { type: "operator", value: "-" },
      { type: "metric", metricId: "refund_amount" },
    ],
    dependencies: ["gross_profit", "refund_amount"],
    sources: ["fact_order_items"],
    isBase: false,
    notes:
      "This metric is scoped to Shopify Products because the slice does not allocate ad spend or overhead by product in v1.",
  },
]

const METRIC_POOL_MAP: Record<MetricPoolId, MetricPool> = {
  "overview-kpi": {
    id: "overview-kpi",
    label: "Overview KPI strip",
    metricIds: [
      "shopify_net_revenue",
      "blended_ad_spend",
      "mer",
      "orders_count",
      "aov",
      "net_profit",
    ],
  },
  "overview-pacing": {
    id: "overview-pacing",
    label: "Overview pacing board",
    metricIds: [
      "shopify_net_revenue",
      "net_profit",
      "mer",
      "orders_count",
      "blended_ad_spend",
      "aov",
      "gross_profit",
      "net_profit_after_ads",
      "contribution_margin",
    ],
  },
  "shopify-profit-kpi": {
    id: "shopify-profit-kpi",
    label: "Shopify Profit KPI strip",
    metricIds: [
      "total_sales",
      "blended_ad_spend",
      "cogs",
      "contribution_margin",
      "net_profit",
    ],
  },
  "creative-card": {
    id: "creative-card",
    label: "Creative card metrics",
    metricIds: [
      "blended_ad_spend",
      "paid_purchases",
      "paid_cpa",
      "paid_roas",
      "thumbstop_rate",
      "hold_rate",
      "platform_attributed_revenue",
      "impressions",
      "view_content",
      "outbound_clicks",
      "video_3s_views",
      "video_15s_views",
      "video_p25_viewed",
      "video_p50_viewed",
      "video_p75_viewed",
      "video_p100_viewed",
    ],
  },
}

function cloneMetric(metric: MetricDefinition): MetricDefinition {
  return {
    ...metric,
    formulaTokens: metric.formulaTokens.map((token) => ({ ...token })),
    dependencies: [...metric.dependencies],
    sources: [...metric.sources],
  }
}

export function listMetrics(): MetricDefinition[] {
  return FIRST_SLICE_RUNTIME_METRIC_REGISTRY.map(cloneMetric)
}

export function getMetric(metricId: EcomDashMetricId): MetricDefinition | null {
  return (
    FIRST_SLICE_RUNTIME_METRIC_REGISTRY.find((metric) => metric.id === metricId) ??
    null
  )
}

export function listMetricsForPool(poolId: MetricPoolId): MetricDefinition[] {
  const pool = METRIC_POOL_MAP[poolId]

  return pool.metricIds
    .map((metricId) => getMetric(metricId))
    .filter((metric): metric is MetricDefinition => metric !== null)
}

export function getMetricPool(poolId: MetricPoolId): MetricPool {
  return {
    ...METRIC_POOL_MAP[poolId],
    metricIds: [...METRIC_POOL_MAP[poolId].metricIds],
  }
}

export function isKnownMetricId(metricId: string): metricId is EcomDashMetricId {
  return FIRST_SLICE_RUNTIME_METRIC_REGISTRY.some(
    (metric) => metric.id === metricId
  )
}

export const METRIC_FORMULA_SIGNATURES: Record<EcomDashMetricId, string> =
  Object.fromEntries(
    FIRST_SLICE_RUNTIME_METRIC_REGISTRY.map((metric) => [
      metric.id,
      formulaSignatureFromTokens(metric.formulaTokens),
    ])
  ) as Record<EcomDashMetricId, string>
