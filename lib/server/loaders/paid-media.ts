import "server-only"

import { safeDivide } from "@/lib/metrics/formulas"
import { selectRowsFromTable } from "@/lib/db/query"
import {
  parseConfigEntry,
  parseCreativeDimension,
  parseCreativePerformance,
  parseCostSettings,
  parseDailyChannelCampaignRow,
  parseDailyOverviewRow,
  parseFactAdsDailyRow,
  parseFactOrderItem,
  parseSkuCost,
  parseTargetEntry,
} from "@/lib/db/record-parsers"
import { getComparisonRange } from "@/lib/server/date-ranges"
import { buildEcomDash2SettingsSnapshot } from "@/lib/server/dashboard-settings"
import {
  applyDailyCostSummaryToOverviewRows,
  buildDailyOrderItemCostSummary,
  summarizeOrderItemCostCoverage,
  type OrderItemCostCoverageSummary,
} from "@/lib/server/reporting-costs"
import type {
  AppConfigEntry,
  AppTargetEntry,
  CostSettings,
  CreativeDimension,
  CreativeMediaType,
  CreativePerformance,
  CreativePerformanceRow,
  CreativeSliceData,
  CreativeTotals,
  DailyChannelCampaignRow,
  DailyOverviewRow,
  FactAdsDailyRow,
  LoaderRange,
  PaidMediaCampaignRow,
  PaidMediaChannelSummaryRow,
  PaidMediaManagerContext,
  PaidMediaPlatformAdNode,
  PaidMediaPlatformAdsetNode,
  PaidMediaPlatformCampaignNode,
  PaidMediaPlatformDailyPoint,
  PaidMediaPlatformId,
  PaidMediaPlatformSliceData,
  PaidMediaProfitProxyModel,
  PaidMediaProfitProxyValue,
  PaidMediaSliceData,
  PaidMediaTargetFormattingConfig,
  PaidMediaTotals,
  PaidMediaTrendPoint,
} from "@/types/backend"
import type { DashboardRequestContext } from "@/types/dashboard"
import type { EcomDashMetricId } from "@/types/metrics"

const PAID_MEDIA_KPI_METRIC_IDS = [
  "blended_ad_spend",
  "platform_attributed_revenue",
  "mer",
  "paid_cpa",
  "paid_roas",
  "paid_purchases",
] as const satisfies readonly EcomDashMetricId[]

const CREATIVE_KPI_METRIC_IDS = [
  "blended_ad_spend",
  "paid_purchases",
  "paid_cpa",
  "paid_roas",
  "thumbstop_rate",
  "hold_rate",
] as const satisfies readonly EcomDashMetricId[]

const CREATIVE_ALLOWED_CARD_METRIC_IDS = [
  ...CREATIVE_KPI_METRIC_IDS,
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
] as const satisfies readonly EcomDashMetricId[]

const CREATIVE_SUPPORTED_PLATFORMS = new Set<PaidMediaPlatformId>([
  "meta",
  "tiktok",
])

const PAID_MEDIA_TARGET_KEYS = {
  roasMin: "ecomdash2.targets.paid_media.blended_roas_min",
  cpaMax: "ecomdash2.targets.paid_media.blended_cpa_max",
  rangePct: "ecomdash2.targets.paid_media.conditional_range_pct",
  farPct: "ecomdash2.targets.paid_media.conditional_far_pct",
} as const

const LEGACY_PAID_MEDIA_TARGET_KEYS = {
  roasMin: "target_blended_roas_min",
  cpaMax: "target_blended_cpa_max",
  rangePct: "target_conditional_range_pct",
  farPct: "target_conditional_far_pct",
} as const

const PAID_MEDIA_MANAGER_ACCOUNT_KEYS: Record<PaidMediaPlatformId, string> = {
  meta: "meta_ad_account_id",
  google: "google_ads_customer_id",
  tiktok: "tiktok_advertiser_id",
}

const META_BUSINESS_ID_KEY = "meta_business_id"

const PAID_MEDIA_PROFIT_PROXY_LOOKBACK_DAYS = 28

type PaidMediaAggregateSourceRow = {
  date: string
  platform: string
  accountId?: string
  campaignId: string
  campaignName: string
  spend: number
  dailyBudget: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
  extraMetrics: Record<string, number>
}

type PaidMediaTrendSourceRow = Pick<
  PaidMediaAggregateSourceRow,
  "date" | "spend" | "revenue"
>

type MutableDailyPoint = {
  date: string
  spend: number
  budget: number
  impressions: number
  clicks: number
  purchases: number
  attributedRevenue: number
  extraMetrics: Record<string, number>
}

type MutableHierarchyBaseRow = {
  id: string
  name: string
  status: string
  accountId: string
  latestDate: string
  budgetDate: string
  spend: number
  budget: number
  impressions: number
  clicks: number
  purchases: number
  attributedRevenue: number
  extraMetrics: Record<string, number>
  daily: Map<string, MutableDailyPoint>
}

type MutableAdNode = MutableHierarchyBaseRow & {
  imageUrl: string
  thumbnailUrl: string
}

type MutableAdsetNode = MutableHierarchyBaseRow & {
  ads: Map<string, MutableAdNode>
}

type MutableCampaignNode = MutableHierarchyBaseRow & {
  adsets: Map<string, MutableAdsetNode>
}

type PaidMediaFoundation = {
  comparisonRange: LoaderRange | null
  currentOverviewRows: DailyOverviewRow[]
  comparisonOverviewRows: DailyOverviewRow[]
  currentChannelRows: DailyChannelCampaignRow[]
  comparisonChannelRows: DailyChannelCampaignRow[]
  currentFactRows: FactAdsDailyRow[]
  comparisonFactRows: FactAdsDailyRow[]
  creativeDimensions: CreativeDimension[]
  targetFormatting: PaidMediaTargetFormattingConfig
  profitProxyModel: PaidMediaProfitProxyModel
  managerContextByPlatform: Record<PaidMediaPlatformId, PaidMediaManagerContext>
  settings: {
    currency: string
    kpiMetricIds: EcomDashMetricId[]
  }
}

function parseIsoDate(isoDate: string) {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO date "${isoDate}"`)
  }

  return parsed
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(isoDate: string, days: number) {
  const next = parseIsoDate(isoDate)
  next.setUTCDate(next.getUTCDate() + days)
  return toIsoDate(next)
}

function diffUtcDays(from: string, to: string) {
  const fromDate = parseIsoDate(from)
  const toDate = parseIsoDate(to)
  const millisecondsPerDay = 24 * 60 * 60 * 1000

  return Math.round((toDate.getTime() - fromDate.getTime()) / millisecondsPerDay)
}

function toPercentRatio(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }

  return value > 1 ? value / 100 : value
}

function parsePositiveSetting(value: string | undefined) {
  const parsed = Number(String(value ?? "").trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parsePercentRatioSetting(
  value: string | undefined,
  fallback: number
) {
  const parsed = Number(String(value ?? "").trim().replace("%", ""))

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed > 1 ? parsed / 100 : parsed
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

function sumExtraMetrics(
  target: Record<string, number>,
  source: Record<string, number>
) {
  for (const [key, value] of Object.entries(source)) {
    if (!Number.isFinite(value) || value === 0) {
      continue
    }

    target[key] = Number(target[key] ?? 0) + value
  }
}

function getTrailingRange(to: string, days: number): LoaderRange {
  return {
    from: addUtcDays(to, -(Math.max(1, Math.floor(days)) - 1)),
    to,
  }
}

function buildSettingsLookup(
  configEntries: AppConfigEntry[],
  targetEntries: AppTargetEntry[]
) {
  const lookup = new Map<string, string>()

  for (const entry of [...configEntries, ...targetEntries]) {
    const key = String(entry.settingKey ?? "").trim().toLowerCase()

    if (!key) {
      continue
    }

    lookup.set(key, String(entry.settingValue ?? "").trim())
  }

  return lookup
}

function buildPaidMediaManagerContextByPlatform(
  configEntries: AppConfigEntry[],
  targetEntries: AppTargetEntry[]
): Record<PaidMediaPlatformId, PaidMediaManagerContext> {
  const lookup = buildSettingsLookup(configEntries, targetEntries)

  return {
    meta: {
      defaultAccountId: lookup.get(PAID_MEDIA_MANAGER_ACCOUNT_KEYS.meta) ?? "",
      defaultBusinessId: lookup.get(META_BUSINESS_ID_KEY) ?? "",
    },
    google: {
      defaultAccountId: lookup.get(PAID_MEDIA_MANAGER_ACCOUNT_KEYS.google) ?? "",
      defaultBusinessId: "",
    },
    tiktok: {
      defaultAccountId: lookup.get(PAID_MEDIA_MANAGER_ACCOUNT_KEYS.tiktok) ?? "",
      defaultBusinessId: "",
    },
  }
}

function buildPaidMediaTargetFormatting(
  configEntries: AppConfigEntry[],
  targetEntries: AppTargetEntry[]
): PaidMediaTargetFormattingConfig {
  const lookup = buildSettingsLookup(configEntries, targetEntries)
  const namespacedRoas = parsePositiveSetting(
    lookup.get(PAID_MEDIA_TARGET_KEYS.roasMin)
  )
  const namespacedCpa = parsePositiveSetting(
    lookup.get(PAID_MEDIA_TARGET_KEYS.cpaMax)
  )
  const legacyRoas = parsePositiveSetting(
    lookup.get(LEGACY_PAID_MEDIA_TARGET_KEYS.roasMin)
  )
  const legacyCpa = parsePositiveSetting(
    lookup.get(LEGACY_PAID_MEDIA_TARGET_KEYS.cpaMax)
  )
  const hasNamespacedTarget =
    namespacedRoas !== null ||
    namespacedCpa !== null ||
    lookup.has(PAID_MEDIA_TARGET_KEYS.rangePct) ||
    lookup.has(PAID_MEDIA_TARGET_KEYS.farPct)
  const hasLegacyTarget =
    legacyRoas !== null ||
    legacyCpa !== null ||
    lookup.has(LEGACY_PAID_MEDIA_TARGET_KEYS.rangePct) ||
    lookup.has(LEGACY_PAID_MEDIA_TARGET_KEYS.farPct)
  const source = hasNamespacedTarget
    ? "ecomdash2"
    : hasLegacyTarget
      ? "legacy"
      : "none"
  const roasTarget =
    source === "ecomdash2"
      ? namespacedRoas
      : source === "legacy"
        ? legacyRoas
        : null
  const cpaTarget =
    source === "ecomdash2"
      ? namespacedCpa
      : source === "legacy"
        ? legacyCpa
        : null
  const inRangePct = parsePercentRatioSetting(
    lookup.get(
      source === "ecomdash2"
        ? PAID_MEDIA_TARGET_KEYS.rangePct
        : LEGACY_PAID_MEDIA_TARGET_KEYS.rangePct
    ),
    0.1
  )
  const farOutPct = Math.max(
    parsePercentRatioSetting(
      lookup.get(
        source === "ecomdash2"
          ? PAID_MEDIA_TARGET_KEYS.farPct
          : LEGACY_PAID_MEDIA_TARGET_KEYS.farPct
      ),
      0.25
    ),
    inRangePct
  )

  return {
    roasTarget,
    cpaTarget,
    inRangePct,
    farOutPct,
    source,
  }
}

function buildPaidMediaProfitProxyModel(input: {
  baselineRange: LoaderRange
  overviewRows: DailyOverviewRow[]
  costSettings: CostSettings | null
  costCoverage: OrderItemCostCoverageSummary | null
}): PaidMediaProfitProxyModel {
  const defaultMarginPct = toPercentRatio(
    input.costSettings?.defaultMarginPct ?? 0
  )
  const shippingPct = toPercentRatio(input.costSettings?.shippingPct ?? 0)
  const paymentFeePct = toPercentRatio(input.costSettings?.paymentFeePct ?? 0)
  const returnsAllowancePct = toPercentRatio(
    input.costSettings?.returnsAllowancePct ?? 0
  )
  const rows = input.overviewRows.filter(
    (row) =>
      row.date >= input.baselineRange.from && row.date <= input.baselineRange.to
  )
  const costCoverage = input.costCoverage
  const hasItemLevelCoverage = costCoverage !== null
  const hasCogsData = hasItemLevelCoverage
    ? costCoverage.exactRevenue > 0 || costCoverage.fallbackRevenue > 0
    : rows.some((row) => row.cogs > 0)
  const hasShippingData = rows.some((row) => row.shippingDataPoints > 0)
  const hasPaymentFeeData = rows.some((row) => row.paymentFeeDataPoints > 0)
  const hasRefundData = rows.some((row) => row.totalRefunded > 0)
  let shopifyRevenue = 0
  let contributionBeforeAds = 0
  let platformAttributedRevenue = 0

  for (const row of rows) {
    const revenue = row.totalRevenue
    const cogs = hasItemLevelCoverage
      ? row.cogs
      : row.cogs > 0
        ? row.cogs
        : defaultMarginPct > 0
          ? revenue * (1 - defaultMarginPct)
          : 0
    const shipping =
      row.shippingDataPoints > 0
        ? row.shippingCost
        : shippingPct > 0
          ? revenue * shippingPct
          : 0
    const paymentFees =
      row.paymentFeeDataPoints > 0
        ? row.paymentFees
        : paymentFeePct > 0
          ? revenue * paymentFeePct
          : 0
    const returns =
      row.totalRefunded > 0
        ? row.totalRefunded
        : returnsAllowancePct > 0
          ? revenue * returnsAllowancePct
          : 0

    shopifyRevenue += revenue
    contributionBeforeAds += revenue - cogs - shipping - paymentFees - returns
    platformAttributedRevenue += row.platformAttributedRevenue
  }

  const contributionMarginPct =
    shopifyRevenue > 0 ? contributionBeforeAds / shopifyRevenue : null
  const alignmentFactor = clamp(
    platformAttributedRevenue > 0
      ? shopifyRevenue / platformAttributedRevenue
      : 1,
    0.75,
    1.25
  )
  const effectiveMarginPct =
    contributionMarginPct === null
      ? null
      : contributionMarginPct * alignmentFactor
  const notes: string[] = []
  const usingCogsFallback = hasItemLevelCoverage
    ? costCoverage.fallbackRevenue > 0
    : !hasCogsData && defaultMarginPct > 0
  const usingShippingFallback = !hasShippingData && shippingPct > 0
  const usingPaymentFallback = !hasPaymentFeeData && paymentFeePct > 0
  const usingReturnsFallback = !hasRefundData && returnsAllowancePct > 0
  const missingCogs = hasItemLevelCoverage
    ? costCoverage.missingRevenue > 0
    : !hasCogsData && defaultMarginPct <= 0
  const missingShipping = !hasShippingData && shippingPct <= 0
  const missingPayment = !hasPaymentFeeData && paymentFeePct <= 0

  if (usingCogsFallback) {
    const fallbackRevenue = costCoverage?.fallbackRevenue ?? 0
    const costCoverageRevenue =
      (costCoverage?.exactRevenue ?? 0) +
      fallbackRevenue +
      (costCoverage?.missingRevenue ?? 0)
    const fallbackSharePct =
      costCoverageRevenue > 0
        ? (fallbackRevenue / costCoverageRevenue) * 100
        : 100

    notes.push(
      `COGS fallback uses default margin ${(defaultMarginPct * 100).toFixed(1)}% for ${fallbackSharePct.toFixed(1)}% of revenue.`
    )
  }

  if (usingShippingFallback) {
    notes.push(
      `Shipping fallback uses ${(shippingPct * 100).toFixed(1)}% of revenue.`
    )
  }

  if (usingPaymentFallback) {
    notes.push(
      `Payment fee fallback uses ${(paymentFeePct * 100).toFixed(1)}% of revenue.`
    )
  }

  if (usingReturnsFallback) {
    notes.push(
      `Returns fallback uses ${(returnsAllowancePct * 100).toFixed(1)}% of revenue.`
    )
  }

  if (missingCogs) {
    notes.push("Missing exact COGS for some order items and no default margin fallback.")
  }

  if (missingShipping) {
    notes.push("Missing shipping costs and shipping fallback.")
  }

  if (missingPayment) {
    notes.push("Missing payment fees and payment fallback.")
  }

  if (platformAttributedRevenue <= 0) {
    notes.push(
      "No platform-attributed revenue in the baseline window; alignment defaults to 1.00."
    )
  }

  let confidence: PaidMediaProfitProxyModel["confidence"] = "high"

  if (
    contributionMarginPct === null ||
    shopifyRevenue <= 0 ||
    missingCogs ||
    missingShipping ||
    missingPayment
  ) {
    confidence = "low"
  } else if (
    usingCogsFallback ||
    usingShippingFallback ||
    usingPaymentFallback ||
    usingReturnsFallback
  ) {
    confidence = "medium"
  }

  return {
    baselineRange: input.baselineRange,
    contributionMarginPct,
    alignmentFactor,
    effectiveMarginPct,
    confidence,
    notes,
  }
}

function calculatePaidMediaProfitProxyValue(
  model: PaidMediaProfitProxyModel,
  attributedRevenue: number,
  spend: number
): PaidMediaProfitProxyValue {
  const band = Math.max(10, spend * 0.03)

  if (model.effectiveMarginPct === null) {
    return {
      value: null,
      band,
      confidence: model.confidence,
      state: "unavailable",
    }
  }

  const value = attributedRevenue * model.effectiveMarginPct - spend
  const state =
    value > band ? "profit" : value < -band ? "loss" : "breakeven"

  return {
    value,
    band,
    confidence: model.confidence,
    state,
  }
}

function normalizePaidMediaPlatform(
  value: string | null | undefined
): PaidMediaPlatformId | null {
  const normalized = String(value ?? "").trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (normalized.includes("meta") || normalized.includes("facebook")) {
    return "meta"
  }

  if (normalized.includes("google")) {
    return "google"
  }

  if (normalized.includes("tiktok") || normalized.includes("tik tok")) {
    return "tiktok"
  }

  return null
}

function filterRowsForPlatform<T extends { platform: string }>(
  rows: T[],
  platform: PaidMediaPlatformId
) {
  return rows.filter((row) => normalizePaidMediaPlatform(row.platform) === platform)
}

function buildCreativeDimensionByAdId(dimensions: CreativeDimension[]) {
  const byPlatformAndAdId = new Map<string, CreativeDimension>()
  const byAdId = new Map<string, CreativeDimension>()

  for (const dimension of dimensions) {
    const adId = String(dimension.adId ?? "").trim()
    const platform = normalizePaidMediaPlatform(dimension.platform)

    if (!adId) {
      continue
    }

    if (platform) {
      byPlatformAndAdId.set(`${platform}::${adId}`, dimension)
    }

    if (!byAdId.has(adId)) {
      byAdId.set(adId, dimension)
    }
  }

  return {
    byPlatformAndAdId,
    byAdId,
  }
}

function aggregateCampaignRows(
  rows: PaidMediaAggregateSourceRow[],
  profitProxyModel: PaidMediaProfitProxyModel
): PaidMediaCampaignRow[] {
  const byCampaign = new Map<
    string,
    Omit<
      PaidMediaCampaignRow,
      "roas" | "cpa" | "cpm" | "ctr" | "daily" | "estimatedProfitProxy"
    > & {
      budgetDate: string
      daily: Map<string, MutableDailyPoint>
    }
  >()

  for (const row of rows) {
    const stableCampaignId = row.campaignId || row.campaignName || "unknown_campaign"
    const key = `${row.platform}::${stableCampaignId}`
    const existing = byCampaign.get(key) ?? {
      platform: row.platform || "Unknown",
      accountId: row.accountId || "",
      campaignId: stableCampaignId,
      campaignName: row.campaignName || stableCampaignId,
      latestDate: row.date,
      spend: 0,
      budget: 0,
      budgetDate: "",
      impressions: 0,
      clicks: 0,
      purchases: 0,
      attributedRevenue: 0,
      extraMetrics: {},
      daily: new Map<string, MutableDailyPoint>(),
    }

    existing.spend += row.spend
    existing.impressions += row.impressions
    existing.clicks += row.clicks
    existing.purchases += row.purchases
    existing.attributedRevenue += row.revenue

    if (row.dailyBudget > 0 && row.date >= existing.budgetDate) {
      existing.budget = row.dailyBudget
      existing.budgetDate = row.date
    }

    if (row.date >= existing.latestDate) {
      existing.latestDate = row.date

      existing.campaignName = row.campaignName
        ? row.campaignName
        : existing.campaignName
      existing.accountId = row.accountId || existing.accountId
    }

    sumExtraMetrics(existing.extraMetrics, row.extraMetrics)
    const dailyPoint =
      existing.daily.get(row.date) ?? createMutableDailyPoint(row.date)
    dailyPoint.spend += row.spend
    dailyPoint.budget = Math.max(dailyPoint.budget, row.dailyBudget)
    dailyPoint.impressions += row.impressions
    dailyPoint.clicks += row.clicks
    dailyPoint.purchases += row.purchases
    dailyPoint.attributedRevenue += row.revenue
    sumExtraMetrics(dailyPoint.extraMetrics, row.extraMetrics)
    existing.daily.set(row.date, dailyPoint)
    byCampaign.set(key, existing)
  }

  return Array.from(byCampaign.values())
    .map((row) => ({
      platform: row.platform,
      accountId: row.accountId,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      latestDate: row.latestDate,
      spend: row.spend,
      budget: row.budget,
      impressions: row.impressions,
      clicks: row.clicks,
      purchases: row.purchases,
      attributedRevenue: row.attributedRevenue,
      roas: safeDivide(row.attributedRevenue, row.spend),
      cpa: safeDivide(row.spend, row.purchases),
      cpm: safeDivide(row.spend * 1000, row.impressions),
      ctr: safeDivide(row.clicks, row.impressions) * 100,
      extraMetrics: row.extraMetrics,
      daily: finalizeDailyPoints(row.daily),
      estimatedProfitProxy: calculatePaidMediaProfitProxyValue(
        profitProxyModel,
        row.attributedRevenue,
        row.spend
      ),
    }))
    .sort((left, right) => {
      if (right.spend !== left.spend) {
        return right.spend - left.spend
      }

      if (right.attributedRevenue !== left.attributedRevenue) {
        return right.attributedRevenue - left.attributedRevenue
      }

      return `${left.platform} ${left.campaignName}`.localeCompare(
        `${right.platform} ${right.campaignName}`
      )
    })
}

function aggregateChannelSummary(
  campaignRows: PaidMediaCampaignRow[],
  profitProxyModel: PaidMediaProfitProxyModel
): PaidMediaChannelSummaryRow[] {
  const byPlatform = new Map<string, PaidMediaChannelSummaryRow>()

  for (const row of campaignRows) {
    const existing = byPlatform.get(row.platform) ?? {
      platform: row.platform || "Unknown",
      campaignCount: 0,
      spend: 0,
      budget: 0,
      purchases: 0,
      attributedRevenue: 0,
      roas: 0,
      cpa: 0,
      estimatedProfitProxy: calculatePaidMediaProfitProxyValue(
        profitProxyModel,
        0,
        0
      ),
    }

    existing.campaignCount += 1
    existing.spend += row.spend
    existing.budget += row.budget
    existing.purchases += row.purchases
    existing.attributedRevenue += row.attributedRevenue
    byPlatform.set(row.platform, existing)
  }

  return Array.from(byPlatform.values())
    .map((row) => ({
      ...row,
      roas: safeDivide(row.attributedRevenue, row.spend),
      cpa: safeDivide(row.spend, row.purchases),
      estimatedProfitProxy: calculatePaidMediaProfitProxyValue(
        profitProxyModel,
        row.attributedRevenue,
        row.spend
      ),
    }))
    .sort((left, right) => {
      if (right.attributedRevenue !== left.attributedRevenue) {
        return right.attributedRevenue - left.attributedRevenue
      }

      return left.platform.localeCompare(right.platform)
    })
}

function buildPaidMediaTotals(input: {
  campaignRows: PaidMediaCampaignRow[]
  overviewRows: DailyOverviewRow[]
  profitProxyModel: PaidMediaProfitProxyModel
}): PaidMediaTotals {
  const totals = input.campaignRows.reduce(
    (accumulator, row) => {
      accumulator.spend += row.spend
      accumulator.budget += row.budget
      accumulator.purchases += row.purchases
      accumulator.attributedRevenue += row.attributedRevenue
      accumulator.impressions += row.impressions
      accumulator.clicks += row.clicks
      sumExtraMetrics(accumulator.extraMetrics, row.extraMetrics)
      return accumulator
    },
    {
      spend: 0,
      budget: 0,
      purchases: 0,
      attributedRevenue: 0,
      impressions: 0,
      clicks: 0,
      shopifyRevenue: input.overviewRows.reduce(
        (total, row) => total + row.totalRevenue,
        0
      ),
      mer: 0,
      roas: 0,
      cpa: 0,
      cpm: 0,
      ctr: 0,
      extraMetrics: {},
      estimatedProfitProxy: calculatePaidMediaProfitProxyValue(
        input.profitProxyModel,
        0,
        0
      ),
    } satisfies PaidMediaTotals
  )

  totals.mer = safeDivide(totals.shopifyRevenue, totals.spend)
  totals.roas = safeDivide(totals.attributedRevenue, totals.spend)
  totals.cpa = safeDivide(totals.spend, totals.purchases)
  totals.cpm = safeDivide(totals.spend * 1000, totals.impressions)
  totals.ctr = safeDivide(totals.clicks, totals.impressions) * 100
  totals.estimatedProfitProxy = calculatePaidMediaProfitProxyValue(
    input.profitProxyModel,
    totals.attributedRevenue,
    totals.spend
  )

  return totals
}

function buildTrend(input: {
  currentRange: LoaderRange
  comparisonRange: LoaderRange | null
  currentRows: PaidMediaTrendSourceRow[]
  comparisonRows: PaidMediaTrendSourceRow[]
}): PaidMediaTrendPoint[] {
  const currentByDate = new Map<
    string,
    {
      spend: number
      attributedRevenue: number
    }
  >()
  const comparisonByDate = new Map<
    string,
    {
      spend: number
      attributedRevenue: number
    }
  >()

  for (const row of input.currentRows) {
    const existing = currentByDate.get(row.date) ?? {
      spend: 0,
      attributedRevenue: 0,
    }

    existing.spend += row.spend
    existing.attributedRevenue += row.revenue
    currentByDate.set(row.date, existing)
  }

  for (const row of input.comparisonRows) {
    const existing = comparisonByDate.get(row.date) ?? {
      spend: 0,
      attributedRevenue: 0,
    }

    existing.spend += row.spend
    existing.attributedRevenue += row.revenue
    comparisonByDate.set(row.date, existing)
  }

  const currentSeries = Array.from(currentByDate.entries())
    .map(([date, metrics]) => ({
      date,
      spend: metrics.spend,
      attributedRevenue: metrics.attributedRevenue,
      roas: safeDivide(metrics.attributedRevenue, metrics.spend),
    }))
    .sort((left, right) => left.date.localeCompare(right.date))
  const comparisonByOffset = new Map<
    number,
    {
      spend: number
      attributedRevenue: number
      roas: number
    }
  >()

  if (input.comparisonRange) {
    for (const [date, metrics] of comparisonByDate.entries()) {
      comparisonByOffset.set(diffUtcDays(input.comparisonRange.from, date), {
        spend: metrics.spend,
        attributedRevenue: metrics.attributedRevenue,
        roas: safeDivide(metrics.attributedRevenue, metrics.spend),
      })
    }
  }

  return currentSeries.map((point) => {
    const comparisonPoint = input.comparisonRange
      ? comparisonByOffset.get(diffUtcDays(input.currentRange.from, point.date))
      : null

    return {
      date: point.date,
      spend: point.spend,
      attributedRevenue: point.attributedRevenue,
      roas: point.roas,
      comparisonSpend: comparisonPoint?.spend ?? null,
      comparisonAttributedRevenue: comparisonPoint?.attributedRevenue ?? null,
      comparisonRoas: comparisonPoint?.roas ?? null,
    }
  })
}

function createMutableHierarchyBase(
  id: string,
  name: string,
  status: string,
  date: string,
  accountId = ""
): MutableHierarchyBaseRow {
  return {
    id,
    name: name || id,
    status,
    accountId,
    latestDate: date,
    budgetDate: "",
    spend: 0,
    budget: 0,
    impressions: 0,
    clicks: 0,
    purchases: 0,
    attributedRevenue: 0,
    extraMetrics: {},
    daily: new Map<string, MutableDailyPoint>(),
  }
}

function createMutableDailyPoint(date: string): MutableDailyPoint {
  return {
    date,
    spend: 0,
    budget: 0,
    impressions: 0,
    clicks: 0,
    purchases: 0,
    attributedRevenue: 0,
    extraMetrics: {},
  }
}

function accumulateDailyPoint(
  daily: Map<string, MutableDailyPoint>,
  row: FactAdsDailyRow
) {
  const point = daily.get(row.date) ?? createMutableDailyPoint(row.date)
  point.spend += row.spend
  point.budget = Math.max(point.budget, row.dailyBudget)
  point.impressions += row.impressions
  point.clicks += row.clicks
  point.purchases += row.purchases
  point.attributedRevenue += row.revenue
  sumExtraMetrics(point.extraMetrics, row.extraMetrics)
  daily.set(row.date, point)
}

function finalizeDailyPoints(
  daily: Map<string, MutableDailyPoint>
): PaidMediaPlatformDailyPoint[] {
  return Array.from(daily.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((point) => ({
      date: point.date,
      spend: point.spend,
      budget: point.budget,
      impressions: point.impressions,
      clicks: point.clicks,
      purchases: point.purchases,
      attributedRevenue: point.attributedRevenue,
      extraMetrics: point.extraMetrics,
    }))
}

function applyHierarchyMetrics(
  target: MutableHierarchyBaseRow,
  row: FactAdsDailyRow,
  name: string,
  status: string
) {
  target.spend += row.spend
  target.impressions += row.impressions
  target.clicks += row.clicks
  target.purchases += row.purchases
  target.attributedRevenue += row.revenue
  accumulateDailyPoint(target.daily, row)

  if (row.dailyBudget > 0 && row.date >= target.budgetDate) {
    target.budget = row.dailyBudget
    target.budgetDate = row.date
  }

  if (row.accountId && (!target.accountId || row.date >= target.latestDate)) {
    target.accountId = row.accountId
  }

  if (row.date >= target.latestDate) {
    target.latestDate = row.date

    if (name) {
      target.name = name
    }

    if (status) {
      target.status = status
    }
  }

  sumExtraMetrics(target.extraMetrics, row.extraMetrics)
}

function finalizeHierarchyBase(
  row: MutableHierarchyBaseRow,
  profitProxyModel: PaidMediaProfitProxyModel
) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    accountId: row.accountId,
    latestDate: row.latestDate,
    spend: row.spend,
    budget: row.budget,
    impressions: row.impressions,
    clicks: row.clicks,
    purchases: row.purchases,
    attributedRevenue: row.attributedRevenue,
    roas: safeDivide(row.attributedRevenue, row.spend),
    cpa: safeDivide(row.spend, row.purchases),
    cpm: safeDivide(row.spend * 1000, row.impressions),
    ctr: safeDivide(row.clicks, row.impressions) * 100,
    extraMetrics: row.extraMetrics,
    daily: finalizeDailyPoints(row.daily),
    estimatedProfitProxy: calculatePaidMediaProfitProxyValue(
      profitProxyModel,
      row.attributedRevenue,
      row.spend
    ),
  }
}

function sortHierarchyRows<
  T extends {
    spend: number
    attributedRevenue: number
    name: string
  },
>(rows: T[]) {
  return rows.sort((left, right) => {
    if (right.spend !== left.spend) {
      return right.spend - left.spend
    }

    if (right.attributedRevenue !== left.attributedRevenue) {
      return right.attributedRevenue - left.attributedRevenue
    }

    return left.name.localeCompare(right.name)
  })
}

function buildPlatformHierarchy(
  rows: FactAdsDailyRow[],
  profitProxyModel: PaidMediaProfitProxyModel,
  creativeDimensions: CreativeDimension[]
): PaidMediaPlatformCampaignNode[] {
  const creativeLookup = buildCreativeDimensionByAdId(creativeDimensions)
  const byCampaign = new Map<string, MutableCampaignNode>()

  for (const row of rows) {
    const platform = normalizePaidMediaPlatform(row.platform)
    const campaignId = row.campaignId || row.campaignName || "unknown_campaign"
    const campaign = byCampaign.get(campaignId) ?? {
      ...createMutableHierarchyBase(
        campaignId,
        row.campaignName || campaignId,
        row.campaignStatus,
        row.date,
        row.accountId
      ),
      adsets: new Map<string, MutableAdsetNode>(),
    }

    applyHierarchyMetrics(
      campaign,
      row,
      row.campaignName || campaignId,
      row.campaignStatus
    )
    byCampaign.set(campaignId, campaign)

    const hasAdsetIdentity = Boolean(
      row.adsetId || row.adsetName || row.adId || row.adName
    )

    if (!hasAdsetIdentity) {
      continue
    }

    const adsetId =
      row.adsetId ||
      row.adsetName ||
      `__${campaignId}_adset_${campaign.adsets.size + 1}`
    const adset = campaign.adsets.get(adsetId) ?? {
      ...createMutableHierarchyBase(
        adsetId,
        row.adsetName || adsetId,
        row.adsetStatus,
        row.date,
        row.accountId
      ),
      ads: new Map<string, MutableAdNode>(),
    }

    applyHierarchyMetrics(adset, row, row.adsetName || adsetId, row.adsetStatus)
    campaign.adsets.set(adsetId, adset)

    const hasAdIdentity = Boolean(row.adId || row.adName)

    if (!hasAdIdentity) {
      continue
    }

    const adId = row.adId || row.adName || `__${adsetId}_ad_${adset.ads.size + 1}`
    const ad =
      adset.ads.get(adId) ??
      {
        ...createMutableHierarchyBase(
          adId,
          row.adName || adId,
          row.adStatus,
          row.date,
          row.accountId
        ),
        imageUrl: "",
        thumbnailUrl: "",
      }

    applyHierarchyMetrics(ad, row, row.adName || adId, row.adStatus)
    const creative =
      (platform
        ? creativeLookup.byPlatformAndAdId.get(`${platform}::${adId}`)
        : null) ?? creativeLookup.byAdId.get(adId)

    if (creative) {
      if (!ad.imageUrl) {
        ad.imageUrl = creative.imageUrl || creative.thumbnailUrl || ""
      }

      if (!ad.thumbnailUrl) {
        ad.thumbnailUrl = creative.thumbnailUrl || creative.imageUrl || ""
      }
    }

    adset.ads.set(adId, ad)
  }

  return sortHierarchyRows(
    Array.from(byCampaign.values()).map((campaign) => {
      const adsets = sortHierarchyRows(
        Array.from(campaign.adsets.values()).map((adset) => {
          const ads = sortHierarchyRows(
            Array.from(adset.ads.values()).map(
              (ad): PaidMediaPlatformAdNode => ({
                entityLevel: "ad",
                ...finalizeHierarchyBase(ad, profitProxyModel),
                imageUrl: ad.imageUrl,
                thumbnailUrl: ad.thumbnailUrl,
              })
            )
          )

          return {
            entityLevel: "adset",
            adCount: ads.length,
            ads,
            ...finalizeHierarchyBase(adset, profitProxyModel),
          } satisfies PaidMediaPlatformAdsetNode
        })
      )

      return {
        entityLevel: "campaign",
        adsetCount: adsets.length,
        adCount: adsets.reduce((total, adset) => total + adset.adCount, 0),
        adsets,
        ...finalizeHierarchyBase(campaign, profitProxyModel),
      } satisfies PaidMediaPlatformCampaignNode
    })
  )
}

async function loadPaidMediaFoundation(
  context: DashboardRequestContext,
  platform?: PaidMediaPlatformId
): Promise<PaidMediaFoundation> {
  const cacheBuster = context.refresh ?? context.loadedAt
  const comparisonRange = getComparisonRange(
    context.from,
    context.to,
    context.compare
  )
  const profitProxyBaselineRange = getTrailingRange(
    context.to,
    PAID_MEDIA_PROFIT_PROXY_LOOKBACK_DAYS
  )
  const [
    configRows,
    targetRows,
    costSettingsRows,
    skuCostRows,
    selectedOverviewRows,
    selectedChannelRows,
    selectedFactRows,
    comparisonOverviewRows,
    comparisonChannelRows,
    comparisonFactRows,
    creativeDimensionRows,
    profitProxyOverviewRows,
    profitProxyOrderItemRows,
  ] = await Promise.all([
    selectRowsFromTable("configEntries", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("targetEntries", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("costSettings", {
      workspaceId: context.workspaceId,
      limit: 1,
      cacheBuster,
    }),
    selectRowsFromTable("skuCosts", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("contractDailyOverview", {
      workspaceId: context.workspaceId,
      from: context.from,
      to: context.to,
      cacheBuster,
    }),
    selectRowsFromTable("contractDailyChannelCampaign", {
      workspaceId: context.workspaceId,
      from: context.from,
      to: context.to,
      cacheBuster,
    }),
    platform
      ? selectRowsFromTable("factAdsDaily", {
          workspaceId: context.workspaceId,
          from: context.from,
          to: context.to,
          cacheBuster,
        })
      : Promise.resolve([]),
    comparisonRange
      ? selectRowsFromTable("contractDailyOverview", {
          workspaceId: context.workspaceId,
          from: comparisonRange.from,
          to: comparisonRange.to,
          cacheBuster,
        })
      : Promise.resolve([]),
    comparisonRange
      ? selectRowsFromTable("contractDailyChannelCampaign", {
          workspaceId: context.workspaceId,
          from: comparisonRange.from,
          to: comparisonRange.to,
          cacheBuster,
        })
      : Promise.resolve([]),
    comparisonRange && platform
      ? selectRowsFromTable("factAdsDaily", {
          workspaceId: context.workspaceId,
          from: comparisonRange.from,
          to: comparisonRange.to,
          cacheBuster,
        })
      : Promise.resolve([]),
    platform
      ? selectRowsFromTable("dimCreative", {
          workspaceId: context.workspaceId,
          limit: null,
          cacheBuster,
        })
      : Promise.resolve([]),
    selectRowsFromTable("contractDailyOverview", {
      workspaceId: context.workspaceId,
      from: profitProxyBaselineRange.from,
      to: profitProxyBaselineRange.to,
      cacheBuster,
    }),
    selectRowsFromTable("factOrderItems", {
      workspaceId: context.workspaceId,
      from: profitProxyBaselineRange.from,
      to: profitProxyBaselineRange.to,
      limit: null,
      cacheBuster,
    }),
  ])

  const configEntries = configRows.map(parseConfigEntry)
  const targetEntries = targetRows.map(parseTargetEntry)
  const settings = buildEcomDash2SettingsSnapshot({
    configEntries,
    targetEntries,
  })
  const costSettings = costSettingsRows[0]
    ? parseCostSettings(costSettingsRows[0])
    : null
  const profitProxyCostSummary = buildDailyOrderItemCostSummary({
    orderItems: profitProxyOrderItemRows.map(parseFactOrderItem),
    skuCosts: skuCostRows.map(parseSkuCost),
    costSettings,
  })
  const parsedProfitProxyOverviewRows = applyDailyCostSummaryToOverviewRows(
    profitProxyOverviewRows.map(parseDailyOverviewRow),
    profitProxyCostSummary
  )

  return {
    comparisonRange,
    currentOverviewRows: selectedOverviewRows.map(parseDailyOverviewRow),
    comparisonOverviewRows: comparisonOverviewRows.map(parseDailyOverviewRow),
    currentChannelRows: selectedChannelRows.map(parseDailyChannelCampaignRow),
    comparisonChannelRows: comparisonChannelRows.map(parseDailyChannelCampaignRow),
    currentFactRows: selectedFactRows.map(parseFactAdsDailyRow),
    comparisonFactRows: comparisonFactRows.map(parseFactAdsDailyRow),
    creativeDimensions: creativeDimensionRows.map(parseCreativeDimension),
    targetFormatting: buildPaidMediaTargetFormatting(configEntries, targetEntries),
    profitProxyModel: buildPaidMediaProfitProxyModel({
      baselineRange: profitProxyBaselineRange,
      overviewRows: parsedProfitProxyOverviewRows,
      costSettings,
      costCoverage:
        profitProxyCostSummary.length > 0
          ? summarizeOrderItemCostCoverage(profitProxyCostSummary)
          : null,
    }),
    managerContextByPlatform: buildPaidMediaManagerContextByPlatform(
      configEntries,
      targetEntries
    ),
    settings: {
      currency: settings.currency,
      kpiMetricIds: [...PAID_MEDIA_KPI_METRIC_IDS],
    },
  }
}

export async function loadPaidMediaSlice(
  context: DashboardRequestContext
): Promise<PaidMediaSliceData> {
  const foundation = await loadPaidMediaFoundation(context)
  const currentCampaignRows = aggregateCampaignRows(
    foundation.currentChannelRows,
    foundation.profitProxyModel
  )
  const comparisonCampaignRows = aggregateCampaignRows(
    foundation.comparisonChannelRows,
    foundation.profitProxyModel
  )

  return {
    context,
    currentRange: {
      range: {
        from: context.from,
        to: context.to,
      },
      totals: buildPaidMediaTotals({
        campaignRows: currentCampaignRows,
        overviewRows: foundation.currentOverviewRows,
        profitProxyModel: foundation.profitProxyModel,
      }),
      trend: buildTrend({
        currentRange: {
          from: context.from,
          to: context.to,
        },
        comparisonRange: foundation.comparisonRange,
        currentRows: foundation.currentChannelRows,
        comparisonRows: foundation.comparisonChannelRows,
      }),
      channelSummary: aggregateChannelSummary(
        currentCampaignRows,
        foundation.profitProxyModel
      ),
      campaignRows: currentCampaignRows,
    },
    comparison: foundation.comparisonRange
      ? {
          range: foundation.comparisonRange,
          totals: buildPaidMediaTotals({
            campaignRows: comparisonCampaignRows,
            overviewRows: foundation.comparisonOverviewRows,
            profitProxyModel: foundation.profitProxyModel,
          }),
        }
      : null,
    targetFormatting: foundation.targetFormatting,
    profitProxyModel: foundation.profitProxyModel,
    settings: foundation.settings,
  }
}

export async function loadPaidMediaPlatformSlice(
  context: DashboardRequestContext,
  platform: PaidMediaPlatformId
): Promise<PaidMediaPlatformSliceData> {
  const foundation = await loadPaidMediaFoundation(context, platform)
  const currentFactRows = filterRowsForPlatform(foundation.currentFactRows, platform)
  const comparisonFactRows = filterRowsForPlatform(
    foundation.comparisonFactRows,
    platform
  )
  const currentContractRows = filterRowsForPlatform(
    foundation.currentChannelRows,
    platform
  )
  const comparisonContractRows = filterRowsForPlatform(
    foundation.comparisonChannelRows,
    platform
  )
  const currentSourceRows =
    currentFactRows.length > 0 ? currentFactRows : currentContractRows
  const comparisonSourceRows =
    currentFactRows.length > 0 ? comparisonFactRows : comparisonContractRows
  const currentCampaignRows = aggregateCampaignRows(
    currentSourceRows,
    foundation.profitProxyModel
  )
  const comparisonCampaignRows = aggregateCampaignRows(
    comparisonSourceRows,
    foundation.profitProxyModel
  )

  return {
    platform,
    context,
    managerContext: foundation.managerContextByPlatform[platform],
    currentRange: {
      range: {
        from: context.from,
        to: context.to,
      },
      totals: buildPaidMediaTotals({
        campaignRows: currentCampaignRows,
        overviewRows: foundation.currentOverviewRows,
        profitProxyModel: foundation.profitProxyModel,
      }),
      trend: buildTrend({
        currentRange: {
          from: context.from,
          to: context.to,
        },
        comparisonRange: foundation.comparisonRange,
        currentRows: currentSourceRows,
        comparisonRows: comparisonSourceRows,
      }),
      campaignRows: currentCampaignRows,
      hierarchy:
        currentFactRows.length > 0
          ? buildPlatformHierarchy(
              currentFactRows,
              foundation.profitProxyModel,
              foundation.creativeDimensions
            )
          : [],
    },
    comparison: foundation.comparisonRange
      ? {
          range: foundation.comparisonRange,
          totals: buildPaidMediaTotals({
            campaignRows: comparisonCampaignRows,
            overviewRows: foundation.comparisonOverviewRows,
            profitProxyModel: foundation.profitProxyModel,
          }),
        }
      : null,
    targetFormatting: foundation.targetFormatting,
    profitProxyModel: foundation.profitProxyModel,
    settings: foundation.settings,
  }
}

type CreativeFoundation = {
  comparisonRange: LoaderRange | null
  currentRows: CreativePerformance[]
  comparisonRows: CreativePerformance[]
  dimensions: CreativeDimension[]
  settings: {
    currency: string
    kpiMetricIds: EcomDashMetricId[]
    defaultCardMetricIds: EcomDashMetricId[]
    allowedCardMetricIds: EcomDashMetricId[]
  }
}

type MutableCreativeAggregate = {
  id: string
  creativeId: string
  adId: string
  adName: string
  platform: string
  headline: string
  primaryText: string
  format: string
  landingPage: string
  thumbnailUrl: string
  imageUrl: string
  videoUrl: string
  firstSeen: string
  lastSeen: string
  spend: number
  purchases: number
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
  labelSpend: number
}

function normalizeCreativePlatformLabel(value: string) {
  const normalized = normalizePaidMediaPlatform(value)

  if (normalized === "meta") {
    return "Meta"
  }

  if (normalized === "google") {
    return "Google"
  }

  if (normalized === "tiktok") {
    return "TikTok"
  }

  const trimmed = String(value ?? "").trim()
  return trimmed || "Unknown"
}

function resolveCreativeMediaType(input: {
  format: string
  videoUrl: string
  imageUrl: string
  thumbnailUrl: string
  video3sViews: number
  video15sViews: number
}): CreativeMediaType {
  const format = String(input.format ?? "").trim().toLowerCase()

  if (format.includes("carousel")) {
    return "carousel"
  }

  if (
    input.videoUrl ||
    format.includes("video") ||
    input.video3sViews > 0 ||
    input.video15sViews > 0
  ) {
    return "video"
  }

  if (input.imageUrl || input.thumbnailUrl) {
    return "image"
  }

  return "unknown"
}

function buildCreativeDimensionLookup(dimensions: CreativeDimension[]) {
  const byCompositeKey = new Map<string, CreativeDimension>()
  const byCreativeId = new Map<string, CreativeDimension>()

  for (const dimension of dimensions) {
    const creativeId = dimension.creativeId || dimension.adId || "unknown"
    const platformToken =
      normalizePaidMediaPlatform(dimension.platform) ?? dimension.platform.toLowerCase()

    if (platformToken) {
      byCompositeKey.set(`${platformToken}::${creativeId}`, dimension)
    }

    if (!byCreativeId.has(creativeId)) {
      byCreativeId.set(creativeId, dimension)
    }
  }

  return {
    byCompositeKey,
    byCreativeId,
  }
}

function fillCreativeIdentity(
  target: MutableCreativeAggregate,
  row: CreativePerformance,
  dimension: CreativeDimension | undefined
) {
  if (!target.adId) {
    target.adId = dimension?.adId || ""
  }

  if (!target.thumbnailUrl) {
    target.thumbnailUrl = row.thumbnailUrl || dimension?.thumbnailUrl || ""
  }

  if (!target.imageUrl) {
    target.imageUrl = row.imageUrl || dimension?.imageUrl || ""
  }

  if (!target.videoUrl) {
    target.videoUrl = row.videoUrl || dimension?.videoUrl || ""
  }

  if (!target.format) {
    target.format = row.format || dimension?.format || ""
  }

  if (!target.headline) {
    target.headline = row.headline || dimension?.headline || ""
  }

  if (!target.primaryText) {
    target.primaryText = dimension?.primaryText || ""
  }

  if (!target.landingPage) {
    target.landingPage = dimension?.landingPage || ""
  }

  if (dimension?.firstSeen) {
    target.firstSeen =
      !target.firstSeen || dimension.firstSeen < target.firstSeen
        ? dimension.firstSeen
        : target.firstSeen
  }

  if (dimension?.lastSeen) {
    target.lastSeen =
      !target.lastSeen || dimension.lastSeen > target.lastSeen
        ? dimension.lastSeen
        : target.lastSeen
  }

  target.firstSeen =
    !target.firstSeen || row.date < target.firstSeen ? row.date : target.firstSeen
  target.lastSeen =
    !target.lastSeen || row.date > target.lastSeen ? row.date : target.lastSeen
}

function aggregateCreativeRows(
  rows: CreativePerformance[],
  dimensions: CreativeDimension[]
): CreativePerformanceRow[] {
  const dimensionLookup = buildCreativeDimensionLookup(dimensions)
  const byCreative = new Map<string, MutableCreativeAggregate>()

  for (const row of rows) {
    const creativeId = row.creativeId || "unknown"
    const platformToken =
      normalizePaidMediaPlatform(row.platform) ||
      row.platform.toLowerCase() ||
      "unknown"
    const key = `${platformToken}::${creativeId}`
    const dimension =
      dimensionLookup.byCompositeKey.get(key) ??
      dimensionLookup.byCreativeId.get(creativeId)
    const existing = byCreative.get(key) ?? {
      id: key,
      creativeId,
      adId: "",
      adName: row.adName || "",
      platform: normalizeCreativePlatformLabel(row.platform || dimension?.platform || ""),
      headline: row.headline || "",
      primaryText: "",
      format: row.format || "",
      landingPage: "",
      thumbnailUrl: row.thumbnailUrl || "",
      imageUrl: row.imageUrl || "",
      videoUrl: row.videoUrl || "",
      firstSeen: row.date,
      lastSeen: row.date,
      spend: 0,
      purchases: 0,
      revenue: 0,
      impressions: 0,
      viewContent: 0,
      outboundClicks: 0,
      video3sViews: 0,
      video15sViews: 0,
      videoP25Viewed: 0,
      videoP50Viewed: 0,
      videoP75Viewed: 0,
      videoP100Viewed: 0,
      labelSpend: 0,
    }

    existing.spend += row.totalSpend
    existing.purchases += row.totalPurchases
    existing.revenue += row.revenue
    existing.impressions += row.impressions
    existing.viewContent += row.viewContent
    existing.outboundClicks += row.outboundClicks
    existing.video3sViews += row.video3sViews
    existing.video15sViews += row.video15sViews
    existing.videoP25Viewed += row.videoP25Viewed
    existing.videoP50Viewed += row.videoP50Viewed
    existing.videoP75Viewed += row.videoP75Viewed
    existing.videoP100Viewed += row.videoP100Viewed

    if (row.totalSpend >= existing.labelSpend) {
      existing.labelSpend = row.totalSpend
      existing.adName = row.adName || existing.adName
      existing.headline = row.headline || existing.headline
    }

    fillCreativeIdentity(existing, row, dimension)
    byCreative.set(key, existing)
  }

  return Array.from(byCreative.values())
    .map((row) => ({
      id: row.id,
      creativeId: row.creativeId,
      adId: row.adId,
      adName: row.adName,
      platform: row.platform,
      headline: row.headline,
      primaryText: row.primaryText,
      format: row.format,
      mediaType: resolveCreativeMediaType({
        format: row.format,
        videoUrl: row.videoUrl,
        imageUrl: row.imageUrl,
        thumbnailUrl: row.thumbnailUrl,
        video3sViews: row.video3sViews,
        video15sViews: row.video15sViews,
      }),
      landingPage: row.landingPage,
      thumbnailUrl: row.thumbnailUrl,
      imageUrl: row.imageUrl,
      videoUrl: row.videoUrl,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      spend: row.spend,
      purchases: row.purchases,
      revenue: row.revenue,
      cpa: safeDivide(row.spend, row.purchases),
      roas: safeDivide(row.revenue, row.spend),
      impressions: row.impressions,
      viewContent: row.viewContent,
      outboundClicks: row.outboundClicks,
      video3sViews: row.video3sViews,
      video15sViews: row.video15sViews,
      videoP25Viewed: row.videoP25Viewed,
      videoP50Viewed: row.videoP50Viewed,
      videoP75Viewed: row.videoP75Viewed,
      videoP100Viewed: row.videoP100Viewed,
      thumbstopRate: safeDivide(row.video3sViews * 100, row.impressions),
      holdRate: safeDivide(row.video15sViews * 100, row.video3sViews),
    }))
    .sort((left, right) => {
      if (right.spend !== left.spend) {
        return right.spend - left.spend
      }

      if (right.revenue !== left.revenue) {
        return right.revenue - left.revenue
      }

      return `${left.platform} ${left.creativeId}`.localeCompare(
        `${right.platform} ${right.creativeId}`
      )
    })
}

function buildCreativeTotals(rows: CreativePerformanceRow[]): CreativeTotals {
  const totals = rows.reduce(
    (accumulator, row) => {
      accumulator.spend += row.spend
      accumulator.purchases += row.purchases
      accumulator.revenue += row.revenue
      accumulator.impressions += row.impressions
      accumulator.viewContent += row.viewContent
      accumulator.outboundClicks += row.outboundClicks
      accumulator.video3sViews += row.video3sViews
      accumulator.video15sViews += row.video15sViews
      accumulator.videoP25Viewed += row.videoP25Viewed
      accumulator.videoP50Viewed += row.videoP50Viewed
      accumulator.videoP75Viewed += row.videoP75Viewed
      accumulator.videoP100Viewed += row.videoP100Viewed
      return accumulator
    },
    {
      spend: 0,
      purchases: 0,
      revenue: 0,
      cpa: 0,
      roas: 0,
      impressions: 0,
      viewContent: 0,
      outboundClicks: 0,
      video3sViews: 0,
      video15sViews: 0,
      videoP25Viewed: 0,
      videoP50Viewed: 0,
      videoP75Viewed: 0,
      videoP100Viewed: 0,
      thumbstopRate: 0,
      holdRate: 0,
    } satisfies CreativeTotals
  )

  totals.cpa = safeDivide(totals.spend, totals.purchases)
  totals.roas = safeDivide(totals.revenue, totals.spend)
  totals.thumbstopRate = safeDivide(totals.video3sViews * 100, totals.impressions)
  totals.holdRate = safeDivide(totals.video15sViews * 100, totals.video3sViews)

  return totals
}

async function loadCreativeFoundation(
  context: DashboardRequestContext
): Promise<CreativeFoundation> {
  const cacheBuster = context.refresh ?? context.loadedAt
  const comparisonRange = getComparisonRange(
    context.from,
    context.to,
    context.compare
  )
  const [configRows, targetRows, currentRows, comparisonRows, dimensionRows] =
    await Promise.all([
      selectRowsFromTable("configEntries", {
        workspaceId: context.workspaceId,
        limit: null,
        cacheBuster,
      }),
      selectRowsFromTable("targetEntries", {
        workspaceId: context.workspaceId,
        limit: null,
        cacheBuster,
      }),
      selectRowsFromTable("contractCreativePerformance", {
        workspaceId: context.workspaceId,
        from: context.from,
        to: context.to,
        cacheBuster,
      }),
      comparisonRange
        ? selectRowsFromTable("contractCreativePerformance", {
            workspaceId: context.workspaceId,
            from: comparisonRange.from,
            to: comparisonRange.to,
            cacheBuster,
          })
        : Promise.resolve([]),
      selectRowsFromTable("dimCreative", {
        workspaceId: context.workspaceId,
        limit: null,
        cacheBuster,
      }),
    ])

  const configEntries = configRows.map(parseConfigEntry)
  const targetEntries = targetRows.map(parseTargetEntry)
  const settings = buildEcomDash2SettingsSnapshot({
    configEntries,
    targetEntries,
  })

  return {
    comparisonRange,
    currentRows: currentRows
      .map(parseCreativePerformance)
      .filter((row) => {
        const platform = normalizePaidMediaPlatform(row.platform)
        return platform !== null && CREATIVE_SUPPORTED_PLATFORMS.has(platform)
      }),
    comparisonRows: comparisonRows
      .map(parseCreativePerformance)
      .filter((row) => {
        const platform = normalizePaidMediaPlatform(row.platform)
        return platform !== null && CREATIVE_SUPPORTED_PLATFORMS.has(platform)
      }),
    dimensions: dimensionRows
      .map(parseCreativeDimension)
      .filter((row) => {
        const platform = normalizePaidMediaPlatform(row.platform)
        return platform !== null && CREATIVE_SUPPORTED_PLATFORMS.has(platform)
      }),
    settings: {
      currency: settings.currency,
      kpiMetricIds: [...CREATIVE_KPI_METRIC_IDS],
      defaultCardMetricIds: [...CREATIVE_KPI_METRIC_IDS],
      allowedCardMetricIds: [...CREATIVE_ALLOWED_CARD_METRIC_IDS],
    },
  }
}

export async function loadCreativeSlice(
  context: DashboardRequestContext
): Promise<CreativeSliceData> {
  const foundation = await loadCreativeFoundation(context)
  const currentRows = aggregateCreativeRows(
    foundation.currentRows,
    foundation.dimensions
  )
  const comparisonRows = aggregateCreativeRows(
    foundation.comparisonRows,
    foundation.dimensions
  )

  return {
    context,
    currentRange: {
      range: {
        from: context.from,
        to: context.to,
      },
      totals: buildCreativeTotals(currentRows),
      rows: currentRows,
    },
    comparison: foundation.comparisonRange
      ? {
          range: foundation.comparisonRange,
          totals: buildCreativeTotals(comparisonRows),
        }
      : null,
    settings: foundation.settings,
  }
}
