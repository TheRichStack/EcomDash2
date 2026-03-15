import {
  calculateAov,
  calculateBlendedRoas,
  calculateContributionMargin,
  calculateMer,
  calculatePlatformAttributedRevenue,
} from "@/lib/metrics/formulas"
import type {
  AppConfigEntry,
  AppTargetEntry,
  BackfillRun,
  BudgetPlanMonthly,
  BudgetTargetsMeta,
  CostSettings,
  CreativeDimension,
  CreativePerformance,
  DailyChannelCampaignRow,
  DailyOverviewRow,
  FactAdsDailyRow,
  FactOrder,
  FactOrderItem,
  JobRun,
  KlaviyoCampaign,
  KlaviyoFlow,
  RawGa4ProductFunnel,
  RawShopifyAnalyticsBreakdown,
  RawShopifyAnalyticsDaily,
  RawShopifyAnalyticsTotals,
  RawShopifyOrder,
  RawShopifyInventoryLevel,
  SkuCost,
  SyncState,
  TargetsCanonicalRange,
  TargetsEffectiveDaily,
  TargetsError,
  TokenStatus,
} from "@/types/backend"

type SqlRow = Record<string, unknown>

function readString(value: unknown, options?: { trim?: boolean }) {
  const raw = String(value ?? "")
  return options?.trim === false ? raw : raw.trim()
}

function readNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function readNullableNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function splitTagList(value: unknown) {
  return readString(value, { trim: false })
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

const DAILY_CHANNEL_CAMPAIGN_BASE_COLUMNS = new Set([
  "workspace_id",
  "date",
  "platform",
  "campaign_id",
  "campaign_name",
  "spend",
  "daily_budget",
  "impressions",
  "clicks",
  "purchases",
  "revenue",
  "updated_at",
])

const FACT_ADS_DAILY_BASE_COLUMNS = new Set([
  "workspace_id",
  "date",
  "platform",
  "account_id",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "daily_budget",
  "impressions",
  "clicks",
  "purchases",
  "revenue",
  "cpa",
  "roas",
  "campaign_status",
  "adset_status",
  "ad_status",
  "updated_at",
])

const KLAVIYO_CAMPAIGN_BASE_COLUMNS = new Set([
  "workspace_id",
  "campaign_id",
  "campaign_name",
  "send_date",
  "sends",
  "delivered",
  "opens",
  "unique_opens",
  "clicks",
  "unique_clicks",
  "bounces",
  "unsubscribes",
  "revenue",
  "open_rate",
  "click_rate",
  "ctr",
  "bounce_rate",
])

const KLAVIYO_FLOW_BASE_COLUMNS = new Set([
  "workspace_id",
  "flow_id",
  "flow_name",
  "send_date",
  "sends",
  "delivered",
  "opens",
  "unique_opens",
  "clicks",
  "unique_clicks",
  "bounces",
  "unsubscribes",
  "revenue",
  "open_rate",
  "click_rate",
  "ctr",
  "bounce_rate",
  "message_id",
  "message_name",
  "step_index",
])

function normalizeMetricToken(rawKey: string) {
  return String(rawKey ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function parseExtraNumericMetrics(
  row: SqlRow,
  baseColumns: Set<string>
) {
  const extraMetrics: Record<string, number> = {}

  for (const [key, value] of Object.entries(row)) {
    const token = normalizeMetricToken(key)

    if (!token || baseColumns.has(token)) {
      continue
    }

    const numericValue = readNumber(value)

    if (!Number.isFinite(numericValue) || numericValue === 0) {
      continue
    }

    extraMetrics[token] = numericValue
  }

  return extraMetrics
}

export function parseConfigEntry(row: SqlRow): AppConfigEntry {
  return {
    workspaceId: readString(row.workspace_id),
    settingKey: readString(row.setting_key),
    settingValue: readString(row.setting_value, { trim: false }),
    description: readString(row.description, { trim: false }),
    updatedAt: readString(row.updated_at),
  }
}

export function parseTargetEntry(row: SqlRow): AppTargetEntry {
  return {
    workspaceId: readString(row.workspace_id),
    settingKey: readString(row.setting_key),
    settingValue: readString(row.setting_value, { trim: false }),
    description: readString(row.description, { trim: false }),
    updatedAt: readString(row.updated_at),
  }
}

export function parseBudgetTargetsMeta(row: SqlRow): BudgetTargetsMeta {
  return {
    workspaceId: readString(row.workspace_id),
    validationStatus: readString(row.validation_status),
    lastAppliedAt: readString(row.last_applied_at),
    lastRunAt: readString(row.last_run_at),
    lastRunResult: readString(row.last_run_result),
    message: readString(row.message, { trim: false }),
    updatedAt: readString(row.updated_at),
  }
}

export function parseTargetsCanonicalRange(row: SqlRow): TargetsCanonicalRange {
  return {
    workspaceId: readString(row.workspace_id),
    rangeId: readString(row.range_id),
    rangeType: readString(row.range_type),
    priority: readNumber(row.priority),
    startDate: readString(row.start_date),
    endDate: readString(row.end_date),
    currency: readString(row.currency),
    revenueTarget: readNumber(row.revenue_target),
    adBudget: readNumber(row.ad_budget),
    profitTarget: readNumber(row.profit_target),
    targetMer: readNumber(row.target_mer),
    targetAdCostPct: readNumber(row.target_ad_cost_pct),
    notes: readString(row.notes, { trim: false }),
    sourceSheet: readString(row.source_sheet),
    sourceRow: readNumber(row.source_row),
    updatedAt: readString(row.updated_at),
  }
}

export function parseTargetsEffectiveDaily(row: SqlRow): TargetsEffectiveDaily {
  return {
    workspaceId: readString(row.workspace_id),
    date: readString(row.date),
    currency: readString(row.currency),
    revenueTarget: readNumber(row.revenue_target),
    adBudget: readNumber(row.ad_budget),
    profitTarget: readNumber(row.profit_target),
    targetMer: readNumber(row.target_mer),
    targetAdCostPct: readNumber(row.target_ad_cost_pct),
    appliedRangeIds: readString(row.applied_range_ids, { trim: false }),
    modeRevenue: readString(row.mode_revenue),
    modeAdBudget: readString(row.mode_ad_budget),
    modeProfit: readString(row.mode_profit),
    updatedAt: readString(row.updated_at),
  }
}

export function parseTargetsError(row: SqlRow): TargetsError {
  return {
    workspaceId: readString(row.workspace_id),
    sheetName: readString(row.sheet_name),
    sourceRow: readNumber(row.source_row),
    field: readString(row.field),
    message: readString(row.message, { trim: false }),
    value: readString(row.value, { trim: false }),
    createdAt: readString(row.created_at),
  }
}

export function parseTokenStatus(row: SqlRow): TokenStatus {
  return {
    workspaceId: readString(row.workspace_id),
    tokenKey: readString(row.token_key),
    hasValue: Boolean(readString(row.ciphertext)),
    updatedAt: readString(row.updated_at),
  }
}

export function parseSyncState(row: SqlRow): SyncState {
  return {
    workspaceId: readString(row.workspace_id),
    sourceKey: readString(row.source_key),
    stateKey: readString(row.state_key),
    stateValue: readString(row.state_value, { trim: false }),
    updatedAt: readString(row.updated_at),
  }
}

export function parseJobRun(row: SqlRow): JobRun {
  return {
    runId: readString(row.run_id),
    workspaceId: readString(row.workspace_id),
    jobName: readString(row.job_name),
    status: readString(row.status),
    startedAt: readString(row.started_at),
    finishedAt: readString(row.finished_at),
    message: readString(row.message, { trim: false }),
    detailsJson: readString(row.details_json, { trim: false }),
  }
}

export function parseBackfillRun(row: SqlRow): BackfillRun {
  return {
    runId: readString(row.run_id),
    workspaceId: readString(row.workspace_id),
    status: readString(row.status),
    startedAt: readString(row.started_at),
    finishedAt: readString(row.finished_at),
    cursorDate: readString(row.cursor_date),
    sourceKey: readString(row.source_key),
    message: readString(row.message, { trim: false }),
    detailsJson: readString(row.details_json, { trim: false }),
  }
}

export function parseCostSettings(row: SqlRow): CostSettings {
  return {
    workspaceId: readString(row.workspace_id),
    defaultMarginPct: readNumber(row.default_margin_pct),
    paymentFeePct: readNumber(row.payment_fee_pct),
    shippingPct: readNumber(row.shipping_pct),
    returnsAllowancePct: readNumber(row.returns_allowance_pct),
    monthlyOverhead: readNumber(row.monthly_overhead),
    updatedAt: readString(row.updated_at),
  }
}

export function parseSkuCost(row: SqlRow): SkuCost {
  return {
    workspaceId: readString(row.workspace_id),
    rowKey: readString(row.row_key),
    shopifyVariantId: readString(row.shopify_variant_id),
    sku: readString(row.sku),
    productTitle: readString(row.product_title, { trim: false }),
    variantTitle: readString(row.variant_title, { trim: false }),
    price: readNullableNumber(row.price),
    shopifyCost: readNullableNumber(row.shopify_cost),
    overrideUnitCost: readNullableNumber(row.override_unit_cost),
    updatedAt: readString(row.updated_at),
  }
}

export function parseBudgetPlanMonthly(row: SqlRow): BudgetPlanMonthly {
  return {
    workspaceId: readString(row.workspace_id),
    month: readString(row.month),
    channel: readString(row.channel),
    budget: readNumber(row.budget),
    notes: readString(row.notes, { trim: false }),
  }
}

export function parseDailyOverviewRow(row: SqlRow): DailyOverviewRow {
  const totalRevenue = readNumber(row.total_revenue)
  const totalOrders = readNumber(row.total_orders)
  const totalSpend = readNumber(row.total_spend)
  const cogs = readNumber(row.cogs)
  const grossProfit = readNumber(row.gross_profit)
  const netProfitAfterAds = readNumber(row.net_profit_after_ads)
  const metaRevenue = readNumber(row.meta_revenue)
  const googleRevenue = readNumber(row.google_revenue)
  const tiktokRevenue = readNumber(row.tiktok_revenue)
  const platformAttributedRevenue = calculatePlatformAttributedRevenue(
    metaRevenue,
    googleRevenue,
    tiktokRevenue
  )

  return {
    date: readString(row.date),
    totalRevenue,
    totalOrders,
    aov: readNumber(row.aov) || calculateAov(totalRevenue, totalOrders),
    totalSpend,
    mer: readNumber(row.mer) || calculateMer(totalRevenue, totalSpend),
    blendedRoas:
      readNumber(row.blended_roas) ||
      calculateBlendedRoas(platformAttributedRevenue, totalSpend),
    newCustomers: readNumber(row.new_customers),
    returningCustomers: readNumber(row.returning_customers),
    cogs,
    grossProfit,
    netProfitAfterAds,
    allocatedOverhead: 0,
    contributionMargin: calculateContributionMargin(
      totalRevenue,
      cogs,
      totalSpend
    ),
    netProfit: netProfitAfterAds,
    orderRevenue: readNumber(row.order_revenue),
    totalRefunded: readNumber(row.total_refunded),
    metaSpend: readNumber(row.meta_spend),
    metaRevenue,
    googleSpend: readNumber(row.google_spend),
    googleRevenue,
    tiktokSpend: readNumber(row.tiktok_spend),
    tiktokRevenue,
    shippingCost: readNumber(row.shipping_cost),
    paymentFees: readNumber(row.payment_fees),
    shippingDataPoints: readNumber(row.shipping_data_points),
    paymentFeeDataPoints: readNumber(row.payment_fee_data_points),
    platformAttributedRevenue,
  }
}

export function parseDailyChannelCampaignRow(
  row: SqlRow
): DailyChannelCampaignRow {
  return {
    date: readString(row.date),
    platform: readString(row.platform),
    campaignId: readString(row.campaign_id),
    campaignName: readString(row.campaign_name, { trim: false }),
    spend: readNumber(row.spend),
    dailyBudget: readNumber(row.daily_budget),
    impressions: readNumber(row.impressions),
    clicks: readNumber(row.clicks),
    purchases: readNumber(row.purchases),
    revenue: readNumber(row.revenue),
    extraMetrics: parseExtraNumericMetrics(
      row,
      DAILY_CHANNEL_CAMPAIGN_BASE_COLUMNS
    ),
    updatedAt: readString(row.updated_at),
  }
}

export function parseFactAdsDailyRow(row: SqlRow): FactAdsDailyRow {
  return {
    date: readString(row.date),
    platform: readString(row.platform),
    accountId: readString(row.account_id),
    campaignId: readString(row.campaign_id),
    campaignName: readString(row.campaign_name, { trim: false }),
    adsetId: readString(row.adset_id),
    adsetName: readString(row.adset_name, { trim: false }),
    adId: readString(row.ad_id),
    adName: readString(row.ad_name, { trim: false }),
    spend: readNumber(row.spend),
    dailyBudget: readNumber(row.daily_budget),
    impressions: readNumber(row.impressions),
    clicks: readNumber(row.clicks),
    purchases: readNumber(row.purchases),
    revenue: readNumber(row.revenue),
    campaignStatus: readString(row.campaign_status),
    adsetStatus: readString(row.adset_status),
    adStatus: readString(row.ad_status),
    extraMetrics: parseExtraNumericMetrics(row, FACT_ADS_DAILY_BASE_COLUMNS),
    updatedAt: readString(row.updated_at),
  }
}

export function parseCreativeDimension(row: SqlRow): CreativeDimension {
  return {
    creativeId: readString(row.creative_id),
    adId: readString(row.ad_id),
    platform: readString(row.platform),
    thumbnailUrl: readString(row.thumbnail_url, { trim: false }),
    imageUrl: readString(row.image_url, { trim: false }),
    videoUrl: readString(row.video_url, { trim: false }),
    headline: readString(row.headline, { trim: false }),
    primaryText: readString(row.primary_text, { trim: false }),
    format: readString(row.format),
    landingPage: readString(row.landing_page, { trim: false }),
    firstSeen: readString(row.first_seen),
    lastSeen: readString(row.last_seen),
  }
}

export function parseCreativePerformance(row: SqlRow): CreativePerformance {
  return {
    date: readString(row.date),
    creativeId: readString(row.creative_id),
    thumbnailUrl: readString(row.thumbnail_url, { trim: false }),
    imageUrl: readString(row.image_url, { trim: false }),
    videoUrl: readString(row.video_url, { trim: false }),
    format: readString(row.format),
    headline: readString(row.headline, { trim: false }),
    adName: readString(row.ad_name, { trim: false }),
    platform: readString(row.platform),
    totalSpend: readNumber(row.total_spend),
    totalPurchases: readNumber(row.total_purchases),
    revenue: readNumber(row.revenue),
    impressions: readNumber(row.impressions),
    viewContent: readNumber(row.view_content),
    outboundClicks: readNumber(row.outbound_clicks),
    video3sViews: readNumber(row.video_3s_views),
    video15sViews: readNumber(row.video_15s_views),
    videoP25Viewed: readNumber(row.video_p25_viewed),
    videoP50Viewed: readNumber(row.video_p50_viewed),
    videoP75Viewed: readNumber(row.video_p75_viewed),
    videoP100Viewed: readNumber(row.video_p100_viewed),
    updatedAt: readString(row.updated_at),
  }
}

export function parseFactOrderItem(row: SqlRow): FactOrderItem {
  const quantity = readNumber(row.quantity)
  const lineTotal = readNumber(row.line_total)

  return {
    lineItemId: readString(row.line_item_id),
    orderId: readString(row.order_id),
    orderDate: readString(row.order_date),
    productId: readString(row.product_id),
    variantId: readString(row.variant_id),
    sku: readString(row.sku),
    productName: readString(row.product_name, { trim: false }),
    variantName: readString(row.variant_name, { trim: false }),
    quantity,
    unitPrice: readNumber(row.unit_price),
    lineTotal,
    discount: readNumber(row.discount),
    unitCost: readNumber(row.unit_cost),
    lineCost: readNumber(row.line_cost),
    grossProfit: readNumber(row.gross_profit),
    marginPct: readNumber(row.margin_pct),
    quantityRefunded: readNumber(row.qty_refunded),
    refundAmount: readNumber(row.refund_amount),
    netQuantity: readNumber(row.net_quantity) || quantity,
    netLineTotal: readNumber(row.net_line_total) || lineTotal,
  }
}

export function parseFactOrder(row: SqlRow): FactOrder {
  return {
    orderId: readString(row.order_id),
    orderDate: readString(row.order_date),
    orderDateLocal: readString(row.order_date_local),
    customerId: readString(row.customer_id),
    totalRevenue: readNumber(row.total_revenue),
    subtotal: readNumber(row.subtotal),
    tax: readNumber(row.tax),
    discounts: readNumber(row.discounts),
    totalRefunded: readNumber(row.total_refunded),
    netRevenue: readNumber(row.net_revenue),
    itemCount: readNumber(row.item_count),
    source: readString(row.source),
    utmSource: readString(row.utm_source, { trim: false }),
    utmMedium: readString(row.utm_medium, { trim: false }),
    utmCampaign: readString(row.utm_campaign, { trim: false }),
    country: readString(row.country, { trim: false }),
    isFirstOrder: readNumber(row.is_first_order) > 0,
    shippingCost: readNumber(row.shipping_cost),
    paymentFees: readNumber(row.payment_fees),
  }
}

export function parseRawShopifyAnalyticsDaily(
  row: SqlRow
): RawShopifyAnalyticsDaily {
  return {
    syncedAt: readString(row._synced_at, { trim: false }),
    dataset: readString(row.dataset),
    date: readString(row.date),
    metric: readString(row.metric),
    value: readString(row.value, { trim: false }),
    valueNum: readNumber(row.value_num),
    dataType: readString(row.data_type),
    displayName: readString(row.display_name, { trim: false }),
    query: readString(row.query, { trim: false }),
  }
}

export function parseRawShopifyAnalyticsTotals(
  row: SqlRow
): RawShopifyAnalyticsTotals {
  return {
    syncedAt: readString(row._synced_at, { trim: false }),
    dataset: readString(row.dataset),
    startDate: readString(row.start_date),
    endDate: readString(row.end_date),
    metric: readString(row.metric),
    value: readString(row.value, { trim: false }),
    valueNum: readNumber(row.value_num),
    dataType: readString(row.data_type),
    displayName: readString(row.display_name, { trim: false }),
    query: readString(row.query, { trim: false }),
  }
}

export function parseRawShopifyAnalyticsBreakdown(
  row: SqlRow
): RawShopifyAnalyticsBreakdown {
  return {
    syncedAt: readString(row._synced_at, { trim: false }),
    dataset: readString(row.dataset),
    startDate: readString(row.start_date),
    endDate: readString(row.end_date),
    breakdownId: readString(row.breakdown_id),
    dimension: readString(row.dimension),
    dimensionValue: readString(row.dimension_value, { trim: false }),
    metric: readString(row.metric),
    value: readString(row.value, { trim: false }),
    valueNum: readNumber(row.value_num),
    dataType: readString(row.data_type),
    displayName: readString(row.display_name, { trim: false }),
    query: readString(row.query, { trim: false }),
  }
}

export function parseRawGa4ProductFunnel(row: SqlRow): RawGa4ProductFunnel {
  return {
    syncedAt: readString(row._synced_at, { trim: false }),
    startDate: readString(row.start_date),
    endDate: readString(row.end_date),
    itemId: readString(row.item_id, { trim: false }),
    itemName: readString(row.item_name, { trim: false }),
    views: readNumber(row.views),
    addToCarts: readNumber(row.add_to_carts),
    checkouts: readNumber(row.checkouts),
    purchases: readNumber(row.purchases),
    revenue: readNumber(row.revenue),
    viewToAtcRate: readNumber(row.view_to_atc_rate),
    atcToCheckoutRate: readNumber(row.atc_to_checkout_rate),
    checkoutToPurchaseRate: readNumber(row.checkout_to_purchase_rate),
    viewToPurchaseRate: readNumber(row.view_to_purchase_rate),
    query: readString(row.query, { trim: false }),
  }
}

export function parseRawShopifyInventoryLevel(
  row: SqlRow
): RawShopifyInventoryLevel {
  return {
    syncedAt: readString(row._synced_at, { trim: false }),
    snapshotDate: readString(row.snapshot_date),
    productId: readString(row.product_id),
    productTitle: readString(row.product_title, { trim: false }),
    productStatus: readString(row.product_status),
    productType: readString(row.product_type, { trim: false }),
    vendor: readString(row.vendor, { trim: false }),
    handle: readString(row.handle),
    variantId: readString(row.variant_id),
    variantTitle: readString(row.variant_title, { trim: false }),
    sku: readString(row.sku, { trim: false }),
    barcode: readString(row.barcode, { trim: false }),
    inventoryItemId: readString(row.inventory_item_id),
    tracked: readString(row.tracked),
    inventoryPolicy: readString(row.inventory_policy),
    price: readNumber(row.price),
    compareAtPrice: readNumber(row.compare_at_price),
    availableQuantity: readNullableNumber(row.available_quantity),
    locationCount: readNumber(row.location_count),
    locationsJson: readString(row.locations_json, { trim: false }),
    productPublishedAt: readString(row.product_published_at, { trim: false }),
    productCreatedAt: readString(row.product_created_at, { trim: false }),
    productUpdatedAt: readString(row.product_updated_at, { trim: false }),
  }
}

export function parseRawShopifyOrder(row: SqlRow): RawShopifyOrder {
  return {
    orderId: readString(row.order_id),
    createdAt: readString(row.created_at, { trim: false }),
    updatedAt: readString(row.updated_at, { trim: false }),
    syncedAt: readString(row._synced_at, { trim: false }),
    tags: splitTagList(row.tags),
  }
}

export function parseKlaviyoCampaign(row: SqlRow): KlaviyoCampaign {
  return {
    campaignId: readString(row.campaign_id),
    campaignName: readString(row.campaign_name, { trim: false }),
    sendDate: readString(row.send_date),
    sends: readNumber(row.sends),
    delivered: readNumber(row.delivered),
    opens: readNumber(row.opens),
    uniqueOpens: readNumber(row.unique_opens),
    clicks: readNumber(row.clicks),
    uniqueClicks: readNumber(row.unique_clicks),
    bounces: readNumber(row.bounces),
    unsubscribes: readNumber(row.unsubscribes),
    revenue: readNumber(row.revenue),
    openRate: readNumber(row.open_rate),
    clickRate: readNumber(row.click_rate),
    ctr: readNumber(row.ctr),
    bounceRate: readNumber(row.bounce_rate),
    extraMetrics: parseExtraNumericMetrics(row, KLAVIYO_CAMPAIGN_BASE_COLUMNS),
  }
}

export function parseKlaviyoFlow(row: SqlRow): KlaviyoFlow {
  return {
    flowId: readString(row.flow_id),
    flowName: readString(row.flow_name, { trim: false }),
    sendDate: readString(row.send_date),
    sends: readNumber(row.sends),
    delivered: readNumber(row.delivered),
    opens: readNumber(row.opens),
    uniqueOpens: readNumber(row.unique_opens),
    clicks: readNumber(row.clicks),
    uniqueClicks: readNumber(row.unique_clicks),
    bounces: readNumber(row.bounces),
    unsubscribes: readNumber(row.unsubscribes),
    revenue: readNumber(row.revenue),
    openRate: readNumber(row.open_rate),
    clickRate: readNumber(row.click_rate),
    ctr: readNumber(row.ctr),
    bounceRate: readNumber(row.bounce_rate),
    messageId: readString(row.message_id ?? row.messageId),
    messageName: readString(row.message_name ?? row.messageName, {
      trim: false,
    }),
    stepIndex: readNullableNumber(row.step_index ?? row.stepIndex),
    extraMetrics: parseExtraNumericMetrics(row, KLAVIYO_FLOW_BASE_COLUMNS),
  }
}
