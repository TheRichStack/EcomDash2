import type { DashboardRequestContext } from "@/types/dashboard"
import type {
  EcomDashMetricId,
  MetricCatalogSource,
  MetricDefinition,
} from "@/types/metrics"

export type LoaderRange = {
  from: string
  to: string
}

export type AppConfigEntry = {
  workspaceId: string
  settingKey: string
  settingValue: string
  description: string
  updatedAt: string
}

export type AppTargetEntry = {
  workspaceId: string
  settingKey: string
  settingValue: string
  description: string
  updatedAt: string
}

export type BudgetTargetsMeta = {
  workspaceId: string
  validationStatus: string
  lastAppliedAt: string
  lastRunAt: string
  lastRunResult: string
  message: string
  updatedAt: string
}

export type TargetsCanonicalRange = {
  workspaceId: string
  rangeId: string
  rangeType: string
  priority: number
  startDate: string
  endDate: string
  currency: string
  revenueTarget: number
  adBudget: number
  profitTarget: number
  targetMer: number
  targetAdCostPct: number
  notes: string
  sourceSheet: string
  sourceRow: number
  updatedAt: string
}

export type TargetsEffectiveDaily = {
  workspaceId: string
  date: string
  currency: string
  revenueTarget: number
  adBudget: number
  profitTarget: number
  targetMer: number
  targetAdCostPct: number
  appliedRangeIds: string
  modeRevenue: string
  modeAdBudget: string
  modeProfit: string
  updatedAt: string
}

export type TargetsError = {
  workspaceId: string
  sheetName: string
  sourceRow: number
  field: string
  message: string
  value: string
  createdAt: string
}

export type TokenStatus = {
  workspaceId: string
  tokenKey: string
  hasValue: boolean
  updatedAt: string
}

export type SyncState = {
  workspaceId: string
  sourceKey: string
  stateKey: string
  stateValue: string
  updatedAt: string
}

export type JobRun = {
  runId: string
  workspaceId: string
  jobName: string
  status: string
  startedAt: string
  finishedAt: string
  message: string
  detailsJson: string
}

export type BackfillRun = {
  runId: string
  workspaceId: string
  status: string
  startedAt: string
  finishedAt: string
  cursorDate: string
  sourceKey: string
  message: string
  detailsJson: string
}

export type DashboardRefreshStatusSource = "job_runs" | "sync_state" | "unknown"

export type DashboardRefreshStatusData = {
  workspaceId: string
  lastSuccessfulHourlySyncAt: string | null
  lastSuccessfulHourlySyncSource: DashboardRefreshStatusSource
  hourlyCursorUpdatedAt: string | null
}

export type CostSettings = {
  workspaceId: string
  defaultMarginPct: number
  paymentFeePct: number
  shippingPct: number
  returnsAllowancePct: number
  monthlyOverhead: number
  updatedAt: string
}

export type SkuCost = {
  workspaceId: string
  rowKey: string
  shopifyVariantId: string
  sku: string
  productTitle: string
  variantTitle: string
  price: number | null
  shopifyCost: number | null
  overrideUnitCost: number | null
  updatedAt: string
}

export type BudgetPlanMonthly = {
  workspaceId: string
  month: string
  channel: string
  budget: number
  notes: string
}

export type DailyOverviewRow = {
  date: string
  totalRevenue: number
  totalOrders: number
  aov: number
  totalSpend: number
  mer: number
  blendedRoas: number
  newCustomers: number
  returningCustomers: number
  cogs: number
  grossProfit: number
  netProfitAfterAds: number
  allocatedOverhead: number
  contributionMargin: number
  netProfit: number
  orderRevenue: number
  totalRefunded: number
  metaSpend: number
  metaRevenue: number
  googleSpend: number
  googleRevenue: number
  tiktokSpend: number
  tiktokRevenue: number
  shippingCost: number
  paymentFees: number
  shippingDataPoints: number
  paymentFeeDataPoints: number
  platformAttributedRevenue: number
}

export type DailyChannelCampaignRow = {
  date: string
  platform: string
  campaignId: string
  campaignName: string
  spend: number
  dailyBudget: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
  extraMetrics: Record<string, number>
  updatedAt: string
}

export type FactAdsDailyRow = {
  date: string
  platform: string
  accountId: string
  campaignId: string
  campaignName: string
  adsetId: string
  adsetName: string
  adId: string
  adName: string
  spend: number
  dailyBudget: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
  campaignStatus: string
  adsetStatus: string
  adStatus: string
  extraMetrics: Record<string, number>
  updatedAt: string
}

export type CreativeDimension = {
  creativeId: string
  adId: string
  platform: string
  thumbnailUrl: string
  imageUrl: string
  videoUrl: string
  headline: string
  primaryText: string
  format: string
  landingPage: string
  firstSeen: string
  lastSeen: string
}

export type CreativePerformance = {
  date: string
  creativeId: string
  thumbnailUrl: string
  imageUrl: string
  videoUrl: string
  format: string
  headline: string
  adName: string
  platform: string
  totalSpend: number
  totalPurchases: number
  revenue: number
  impressions: number
  viewContent: number
  outboundClicks: number
  video3sViews: number
  video15sViews: number
  videoP25Viewed: number
  videoP50Viewed: number
  videoP75Viewed: number
  videoP100Viewed: number
  updatedAt: string
}

export type CreativeMediaType = "image" | "video" | "carousel" | "mixed" | "unknown"

export type CreativePerformanceRow = {
  id: string
  creativeId: string
  adId: string
  adName: string
  platform: string
  headline: string
  primaryText: string
  format: string
  mediaType: CreativeMediaType
  landingPage: string
  thumbnailUrl: string
  imageUrl: string
  videoUrl: string
  firstSeen: string
  lastSeen: string
  spend: number
  purchases: number
  revenue: number
  cpa: number
  roas: number
  impressions: number
  viewContent: number
  outboundClicks: number
  video3sViews: number
  video15sViews: number
  videoP25Viewed: number
  videoP50Viewed: number
  videoP75Viewed: number
  videoP100Viewed: number
  thumbstopRate: number
  holdRate: number
}

export type CreativeTotals = {
  spend: number
  purchases: number
  revenue: number
  cpa: number
  roas: number
  impressions: number
  viewContent: number
  outboundClicks: number
  video3sViews: number
  video15sViews: number
  videoP25Viewed: number
  videoP50Viewed: number
  videoP75Viewed: number
  videoP100Viewed: number
  thumbstopRate: number
  holdRate: number
}

export type FactOrderItem = {
  lineItemId: string
  orderId: string
  orderDate: string
  productId: string
  variantId: string
  sku: string
  productName: string
  variantName: string
  quantity: number
  unitPrice: number
  lineTotal: number
  discount: number
  unitCost: number
  lineCost: number
  grossProfit: number
  marginPct: number
  quantityRefunded: number
  refundAmount: number
  netQuantity: number
  netLineTotal: number
}

export type FactOrder = {
  orderId: string
  orderDate: string
  orderDateLocal: string
  customerId: string
  totalRevenue: number
  subtotal: number
  tax: number
  discounts: number
  totalRefunded: number
  netRevenue: number
  itemCount: number
  source: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
  country: string
  isFirstOrder: boolean
  shippingCost: number
  paymentFees: number
}

export type RawShopifyAnalyticsDaily = {
  syncedAt: string
  dataset: string
  date: string
  metric: string
  value: string
  valueNum: number
  dataType: string
  displayName: string
  query: string
}

export type RawShopifyAnalyticsTotals = {
  syncedAt: string
  dataset: string
  startDate: string
  endDate: string
  metric: string
  value: string
  valueNum: number
  dataType: string
  displayName: string
  query: string
}

export type RawShopifyAnalyticsBreakdown = {
  syncedAt: string
  dataset: string
  startDate: string
  endDate: string
  breakdownId: string
  dimension: string
  dimensionValue: string
  metric: string
  value: string
  valueNum: number
  dataType: string
  displayName: string
  query: string
}

export type RawGa4ProductFunnel = {
  syncedAt: string
  startDate: string
  endDate: string
  itemId: string
  itemName: string
  views: number
  addToCarts: number
  checkouts: number
  purchases: number
  revenue: number
  viewToAtcRate: number
  atcToCheckoutRate: number
  checkoutToPurchaseRate: number
  viewToPurchaseRate: number
  query: string
}

export type RawShopifyInventoryLevel = {
  syncedAt: string
  snapshotDate: string
  productId: string
  productTitle: string
  productStatus: string
  productType: string
  vendor: string
  handle: string
  variantId: string
  variantTitle: string
  sku: string
  barcode: string
  inventoryItemId: string
  tracked: string
  inventoryPolicy: string
  price: number
  compareAtPrice: number
  availableQuantity: number | null
  locationCount: number
  locationsJson: string
  productPublishedAt: string
  productCreatedAt: string
  productUpdatedAt: string
}

export type RawShopifyOrder = {
  orderId: string
  createdAt: string
  updatedAt: string
  syncedAt: string
  tags: string[]
}

export type KlaviyoCampaign = {
  campaignId: string
  campaignName: string
  sendDate: string
  sends: number
  delivered: number
  opens: number
  uniqueOpens: number
  clicks: number
  uniqueClicks: number
  bounces: number
  unsubscribes: number
  revenue: number
  openRate: number
  clickRate: number
  ctr: number
  bounceRate: number
  extraMetrics: Record<string, number>
}

export type KlaviyoFlow = {
  flowId: string
  flowName: string
  sendDate: string
  sends: number
  delivered: number
  opens: number
  uniqueOpens: number
  clicks: number
  uniqueClicks: number
  bounces: number
  unsubscribes: number
  revenue: number
  openRate: number
  clickRate: number
  ctr: number
  bounceRate: number
  messageId: string
  messageName: string
  stepIndex: number | null
  extraMetrics: Record<string, number>
}

export type EmailKpiTotals = {
  revenue: number
  sends: number
  openRate: number
  clickRate: number
  revenuePerRecipient: number
  placedOrders: number | null
}

export type EmailPerformanceSummary = {
  sends: number
  delivered: number
  opens: number
  uniqueOpens: number
  clicks: number
  uniqueClicks: number
  bounces: number
  unsubscribes: number
  revenue: number
  deliveryRate: number
  openRate: number
  clickRate: number
  ctr: number
  bounceRate: number
  revenuePerRecipient: number
  placedOrders: number | null
}

export type EmailCampaignRow = EmailPerformanceSummary & {
  campaignId: string
  campaignName: string
  latestSendDate: string
  activeDays: number
}

export type EmailFlowSequenceStep = EmailPerformanceSummary & {
  key: string
  stepIndex: number | null
  messageId: string
  messageName: string
}

export type EmailFlowRow = EmailPerformanceSummary & {
  flowId: string
  flowName: string
  latestSendDate: string
  activeDays: number
  sequenceSteps: EmailFlowSequenceStep[]
}

export type EmailSliceData = {
  context: DashboardRequestContext
  currentRange: {
    range: LoaderRange
    kpis: EmailKpiTotals
    campaigns: EmailCampaignRow[]
    flows: EmailFlowRow[]
  }
  comparison: {
    range: LoaderRange
    kpis: EmailKpiTotals
  } | null
  settings: {
    currency: string
    kpiMetricIds: EcomDashMetricId[]
    flowSequence: {
      available: boolean
      reason: string
    }
  }
}

export type SliceMetricSelection = {
  allowedMetricIds: EcomDashMetricId[]
  defaultMetricIds: EcomDashMetricId[]
  selectedMetricIds: EcomDashMetricId[]
}

export type EcomDash2SettingsSnapshot = {
  currency: string
  configEntries: AppConfigEntry[]
  targetEntries: AppTargetEntry[]
  configMap: Record<string, string>
  targetMap: Record<string, string>
  overviewKpis: SliceMetricSelection
  overviewPacing: SliceMetricSelection
  shopifyProfitKpis: SliceMetricSelection
}

export type OverviewMetricTotals = {
  revenue: number
  orders: number
  adSpend: number
  aov: number
  mer: number
  blendedRoas: number
  cogs: number
  grossProfit: number
  netProfitAfterAds: number
  allocatedOverhead: number
  contributionMargin: number
  netProfit: number
  platformAttributedRevenue: number
}

export type OverviewChannelSummary = {
  platform: string
  spend: number
  revenue: number
  purchases: number
  impressions: number
  clicks: number
}

export type OverviewTopProduct = {
  productId: string
  productName: string
  variantName: string
  sku: string
  quantity: number
  revenue: number
  cogs: number
  grossProfit: number
}

export type OverviewCreativeSnapshot = {
  creativeId: string
  platform: string
  adName: string
  headline: string
  format: string
  thumbnailUrl: string
  imageUrl: string
  videoUrl: string
  spend: number
  purchases: number
  revenue: number
}

export type OverviewPacingRow = {
  metricId: EcomDashMetricId
  actualToDate: number
  expectedToDate: number
  deltaToDate: number
  projectedPeriodEnd: number
  expectedPeriodEnd: number
  source: "target" | "baseline"
  sourceLabel: string
  supportText: string
}

export type OverviewSnapshotRow = {
  id: "today" | "yesterday" | "last_7_days" | "last_month"
  label: string
  range: LoaderRange
  comparisonRange: LoaderRange | null
  revenue: number
  netProfit: number
  mer: number
  comparisonRevenue: number | null
  comparisonDeltaPct: number | null
}

export type OverviewEmailSnapshot = {
  campaignRevenue: number
  flowRevenue: number
  totalRevenue: number
  campaignSends: number
  flowSends: number
}

export type OverviewSliceData = {
  context: DashboardRequestContext
  selectedRange: {
    range: LoaderRange
    overviewRows: DailyOverviewRow[]
    comparisonRange: LoaderRange | null
    comparisonRows: DailyOverviewRow[]
    channelCampaignRows: DailyChannelCampaignRow[]
    channelSummary: OverviewChannelSummary[]
    topProducts: OverviewTopProduct[]
    topCreatives: OverviewCreativeSnapshot[]
    emailCampaigns: KlaviyoCampaign[]
    emailFlows: KlaviyoFlow[]
    emailSnapshot: OverviewEmailSnapshot
    totals: OverviewMetricTotals
    comparisonTotals: OverviewMetricTotals | null
  }
  monthToDate: {
    range: LoaderRange
    overviewRows: DailyOverviewRow[]
    targetRows: TargetsEffectiveDaily[]
    totals: OverviewMetricTotals
    targetMeta: BudgetTargetsMeta | null
    pacingRows: OverviewPacingRow[]
  }
  snapshotRows: OverviewSnapshotRow[]
  settings: EcomDash2SettingsSnapshot
  costSettings: CostSettings | null
}

export type ProfitSeriesRow = {
  date: string
  totalSales: number
  marketingCosts: number
  cogs: number
  contributionMargin: number
  allocatedOverhead: number
  netProfit: number
}

export type ProfitTotals = {
  totalSales: number
  marketingCosts: number
  cogs: number
  contributionMargin: number
  allocatedOverhead: number
  netProfit: number
}

export type ShopifyProfitSliceData = {
  context: DashboardRequestContext
  currentRange: {
    range: LoaderRange
    daily: ProfitSeriesRow[]
    totals: ProfitTotals
  }
  comparison: {
    range: LoaderRange
    daily: ProfitSeriesRow[]
    totals: ProfitTotals
  } | null
  settings: {
    currency: string
    configEntries: AppConfigEntry[]
    targetEntries: AppTargetEntry[]
    kpis: SliceMetricSelection
  }
  costSettings: CostSettings | null
}

export type ShopifyFunnelStageId =
  | "sessions"
  | "add_to_cart"
  | "checkout"
  | "purchase"

export type ShopifyFunnelStageSource =
  | "shopify_totals"
  | "shopify_daily"
  | "mixed"
  | "unavailable"

export type ShopifyFunnelBreakdownDimension =
  | "channel"
  | "device"
  | "customer_type"
  | "country"

export type ShopifyFunnelProductBreakdownGroup = "product" | "sku"

export type ShopifyFunnelProductBreakdownSourceMode =
  | "exact"
  | "fallback"
  | "unavailable"

export type ShopifyFunnelKpiTotals = {
  sessions: number
  addToCartRate: number
  checkoutRate: number
  purchaseConversionRate: number
  orders: number
  revenue: number
}

export type ShopifyFunnelStageSummary = {
  id: ShopifyFunnelStageId
  label: string
  count: number
  overallRate: number
  stepRate: number | null
  dropOffCount: number | null
}

export type ShopifyFunnelDailyPoint = {
  date: string
  sessions: number
  addToCart: number
  checkout: number
  purchase: number
  addToCartRate: number
  checkoutRate: number
  purchaseRate: number
}

export type ShopifyFunnelBreakdownRow = {
  key: string
  label: string
  sessions: number
  addToCart: number
  checkout: number
  purchase: number
  addToCartRate: number
  checkoutRate: number
  purchaseRate: number
  checkoutToPurchaseRate: number
  sessionShare: number
}

export type ShopifyFunnelProductBreakdownRow = {
  key: string
  product: string
  sku: string
  skuList: string[]
  views: number
  addToCart: number
  checkout: number
  purchase: number
  addToCartRate: number
  checkoutRate: number
  purchaseRate: number
}

export type ShopifyFunnelProductBreakdown = {
  rowsByGroup: Record<
    ShopifyFunnelProductBreakdownGroup,
    ShopifyFunnelProductBreakdownRow[]
  >
  sourceRange: LoaderRange | null
  sourceMode: ShopifyFunnelProductBreakdownSourceMode
}

export type ShopifyFunnelSliceData = {
  context: DashboardRequestContext
  currentRange: {
    range: LoaderRange
    kpis: ShopifyFunnelKpiTotals
    stages: ShopifyFunnelStageSummary[]
    daily: ShopifyFunnelDailyPoint[]
    breakdowns: Partial<
      Record<ShopifyFunnelBreakdownDimension, ShopifyFunnelBreakdownRow[]>
    >
    productBreakdown: ShopifyFunnelProductBreakdown
    availableBreakdownDimensions: ShopifyFunnelBreakdownDimension[]
    latestAvailableDate: string | null
    stageCountSource: ShopifyFunnelStageSource
  }
  comparison: {
    range: LoaderRange
    kpis: ShopifyFunnelKpiTotals
    stages: ShopifyFunnelStageSummary[]
    daily: ShopifyFunnelDailyPoint[]
    latestAvailableDate: string | null
    stageCountSource: ShopifyFunnelStageSource
  } | null
  settings: {
    currency: string
    kpiMetricIds: EcomDashMetricId[]
  }
}

export type ShopifyProductsBreakdown = "product" | "sku" | "variant"

export type ShopifyProductsKpiTotals = {
  totalSales: number
  unitsSold: number
  grossProfit: number
  netProfit: number
  refundAmount: number
  returnRate: number
}

export type ShopifyProductsTableRow = {
  key: string
  product: string
  sku: string
  variant: string
  totalSales: number
  orders: number
  qtySold: number
  qtyRefunded: number
  refundAmount: number
  productCosts: number
  grossProfit: number
  netProfit: number
  marginPct: number
  priceReductionPct: number
  salesVelocity7d: number
  salesVelocity30d: number
  tags: string[]
}

export type ShopifyProductsSliceData = {
  context: DashboardRequestContext
  currentRange: {
    range: LoaderRange
    kpis: ShopifyProductsKpiTotals
    breakdowns: Record<ShopifyProductsBreakdown, ShopifyProductsTableRow[]>
    availableTags: string[]
  }
  settings: {
    currency: string
    configEntries: AppConfigEntry[]
  }
  velocityWindows: {
    last7DaysFrom: string
    last30DaysFrom: string
  }
}

export type ShopifyInventoryStatus =
  | "healthy"
  | "at_risk"
  | "out_of_stock"
  | "untracked"

export type ShopifyInventoryVelocityWindow = 7 | 14 | 30 | 60 | 90

export type ShopifyInventoryVelocityMetrics = {
  sold: number
  ratePerDay: number | null
  daysLeft: number | null
  estimatedStockout: string | null
}

export type ShopifyInventoryKpiTotals = {
  trackedVariants: number
  totalUnitsInStock: number
  atRiskVariants: number
  outOfStockVariants: number
}

export type ShopifyInventoryTableRow = {
  key: string
  product: string
  variant: string
  sku: string
  tracked: boolean
  available: number | null
  status: ShopifyInventoryStatus
  velocity: Record<ShopifyInventoryVelocityWindow, ShopifyInventoryVelocityMetrics>
}

export type ShopifyInventorySliceData = {
  context: DashboardRequestContext
  selectedRange: {
    range: LoaderRange
    latestSnapshotDate: string | null
    usedRangeFallback: boolean
  }
  velocity: {
    anchorDate: string | null
    defaultWindow: ShopifyInventoryVelocityWindow
    windows: ShopifyInventoryVelocityWindow[]
  }
  kpis: ShopifyInventoryKpiTotals
  rows: ShopifyInventoryTableRow[]
}

export type PaidMediaProfitProxyConfidence = "high" | "medium" | "low"

export type PaidMediaPlatformId = "meta" | "google" | "tiktok"

export type PaidMediaEntityLevel = "campaign" | "adset" | "ad"

export type PaidMediaProfitProxyState =
  | "profit"
  | "breakeven"
  | "loss"
  | "unavailable"

export type PaidMediaProfitProxyModel = {
  baselineRange: LoaderRange
  contributionMarginPct: number | null
  alignmentFactor: number
  effectiveMarginPct: number | null
  confidence: PaidMediaProfitProxyConfidence
  notes: string[]
}

export type PaidMediaProfitProxyValue = {
  value: number | null
  band: number
  confidence: PaidMediaProfitProxyConfidence
  state: PaidMediaProfitProxyState
}

export type PaidMediaTargetFormattingConfig = {
  roasTarget: number | null
  cpaTarget: number | null
  inRangePct: number
  farOutPct: number
  source: "ecomdash2" | "legacy" | "none"
}

export type PaidMediaCampaignRow = {
  platform: string
  accountId: string
  campaignId: string
  campaignName: string
  latestDate: string
  spend: number
  budget: number
  impressions: number
  clicks: number
  purchases: number
  attributedRevenue: number
  roas: number
  cpa: number
  cpm: number
  ctr: number
  extraMetrics: Record<string, number>
  daily: PaidMediaPlatformDailyPoint[]
  estimatedProfitProxy: PaidMediaProfitProxyValue
}

export type PaidMediaPlatformDailyPoint = {
  date: string
  spend: number
  budget: number
  impressions: number
  clicks: number
  purchases: number
  attributedRevenue: number
  extraMetrics: Record<string, number>
}

export type PaidMediaManagerContext = {
  defaultAccountId: string
  defaultBusinessId: string
}

type PaidMediaPlatformHierarchyBaseRow = {
  id: string
  name: string
  status: string
  accountId: string
  latestDate: string
  spend: number
  budget: number
  impressions: number
  clicks: number
  purchases: number
  attributedRevenue: number
  roas: number
  cpa: number
  cpm: number
  ctr: number
  extraMetrics: Record<string, number>
  daily: PaidMediaPlatformDailyPoint[]
  estimatedProfitProxy: PaidMediaProfitProxyValue
}

export type PaidMediaPlatformAdNode = PaidMediaPlatformHierarchyBaseRow & {
  entityLevel: "ad"
  imageUrl: string
  thumbnailUrl: string
}

export type PaidMediaPlatformAdsetNode = PaidMediaPlatformHierarchyBaseRow & {
  entityLevel: "adset"
  adCount: number
  ads: PaidMediaPlatformAdNode[]
}

export type PaidMediaPlatformCampaignNode = PaidMediaPlatformHierarchyBaseRow & {
  entityLevel: "campaign"
  adsetCount: number
  adCount: number
  adsets: PaidMediaPlatformAdsetNode[]
}

export type PaidMediaChannelSummaryRow = {
  platform: string
  campaignCount: number
  spend: number
  budget: number
  purchases: number
  attributedRevenue: number
  roas: number
  cpa: number
  estimatedProfitProxy: PaidMediaProfitProxyValue
}

export type PaidMediaTrendPoint = {
  date: string
  spend: number
  attributedRevenue: number
  roas: number
  comparisonSpend: number | null
  comparisonAttributedRevenue: number | null
  comparisonRoas: number | null
}

export type PaidMediaTotals = {
  spend: number
  budget: number
  purchases: number
  attributedRevenue: number
  impressions: number
  clicks: number
  shopifyRevenue: number
  mer: number
  roas: number
  cpa: number
  cpm: number
  ctr: number
  extraMetrics: Record<string, number>
  estimatedProfitProxy: PaidMediaProfitProxyValue
}

export type PaidMediaSliceData = {
  context: DashboardRequestContext
  currentRange: {
    range: LoaderRange
    totals: PaidMediaTotals
    trend: PaidMediaTrendPoint[]
    channelSummary: PaidMediaChannelSummaryRow[]
    campaignRows: PaidMediaCampaignRow[]
  }
  comparison: {
    range: LoaderRange
    totals: PaidMediaTotals
  } | null
  targetFormatting: PaidMediaTargetFormattingConfig
  profitProxyModel: PaidMediaProfitProxyModel
  settings: {
    currency: string
    kpiMetricIds: EcomDashMetricId[]
  }
}

export type PaidMediaPlatformSliceData = {
  platform: PaidMediaPlatformId
  context: DashboardRequestContext
  managerContext: PaidMediaManagerContext
  currentRange: {
    range: LoaderRange
    totals: PaidMediaTotals
    trend: PaidMediaTrendPoint[]
    campaignRows: PaidMediaCampaignRow[]
    hierarchy: PaidMediaPlatformCampaignNode[]
  }
  comparison: {
    range: LoaderRange
    totals: PaidMediaTotals
  } | null
  targetFormatting: PaidMediaTargetFormattingConfig
  profitProxyModel: PaidMediaProfitProxyModel
  settings: {
    currency: string
    kpiMetricIds: EcomDashMetricId[]
  }
}

export type CreativeSliceData = {
  context: DashboardRequestContext
  currentRange: {
    range: LoaderRange
    totals: CreativeTotals
    rows: CreativePerformanceRow[]
  }
  comparison: {
    range: LoaderRange
    totals: CreativeTotals
  } | null
  settings: {
    currency: string
    kpiMetricIds: EcomDashMetricId[]
    defaultCardMetricIds: EcomDashMetricId[]
    allowedCardMetricIds: EcomDashMetricId[]
  }
}

export type SettingsSliceData = {
  context: DashboardRequestContext
  workspace: {
    configEntries: AppConfigEntry[]
    tokens: TokenStatus[]
    syncState: SyncState[]
    recentJobRuns: JobRun[]
    recentBackfillRuns: BackfillRun[]
  }
  dashboard: {
    settings: EcomDash2SettingsSnapshot
  }
  inputs: {
    costSettings: CostSettings | null
    skuCosts: SkuCost[]
    budgetPlanMonthly: BudgetPlanMonthly[]
    budgetTargetsMeta: BudgetTargetsMeta | null
    targetEntries: AppTargetEntry[]
    targetCanonicalRanges: TargetsCanonicalRange[]
    targetEffectiveDaily: TargetsEffectiveDaily[]
    targetErrors: TargetsError[]
  }
  metrics: {
    runtimeRegistry: MetricDefinition[]
    catalogSource: MetricCatalogSource
  }
  syncs: {
    syncState: SyncState[]
    recentJobRuns: JobRun[]
    recentBackfillRuns: BackfillRun[]
  }
}
