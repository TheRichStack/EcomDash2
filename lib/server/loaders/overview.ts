import "server-only"

import { selectRowsFromTable } from "@/lib/db/query"
import {
  parseBudgetTargetsMeta,
  parseConfigEntry,
  parseCostSettings,
  parseCreativeDimension,
  parseCreativePerformance,
  parseDailyChannelCampaignRow,
  parseDailyOverviewRow,
  parseFactOrderItem,
  parseKlaviyoCampaign,
  parseKlaviyoFlow,
  parseSkuCost,
  parseTargetEntry,
  parseTargetsEffectiveDaily,
} from "@/lib/db/record-parsers"
import { getComparisonRange, getMonthToDateRange } from "@/lib/server/date-ranges"
import { buildEcomDash2SettingsSnapshot } from "@/lib/server/dashboard-settings"
import {
  applyDailyCostSummaryToOverviewRows,
  buildDailyOrderItemCostSummary,
} from "@/lib/server/reporting-costs"
import {
  applyAllocatedOverhead,
  sumOverviewTotals,
} from "@/lib/server/reporting-math"
import type {
  CreativeDimension,
  CreativePerformance,
  DailyChannelCampaignRow,
  DailyOverviewRow,
  FactOrderItem,
  KlaviyoCampaign,
  KlaviyoFlow,
  OverviewChannelSummary,
  OverviewCreativeSnapshot,
  OverviewEmailSnapshot,
  OverviewMetricTotals,
  OverviewPacingRow,
  OverviewSliceData,
  OverviewSnapshotRow,
  OverviewTopProduct,
  TargetsEffectiveDaily,
} from "@/types/backend"
import type { DashboardRequestContext } from "@/types/dashboard"
import type { EcomDashMetricId } from "@/types/metrics"

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

function shiftIsoDateByMonths(isoDate: string, months: number) {
  const shifted = parseIsoDate(isoDate)
  shifted.setUTCMonth(shifted.getUTCMonth() + months)
  return toIsoDate(shifted)
}

function startOfIsoMonth(isoDate: string) {
  const parsed = parseIsoDate(isoDate)
  return toIsoDate(
    new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1))
  )
}

function endOfIsoMonth(isoDate: string) {
  const parsed = parseIsoDate(isoDate)
  return toIsoDate(
    new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0))
  )
}

function countInclusiveDays(from: string, to: string) {
  const fromDate = parseIsoDate(from)
  const toDate = parseIsoDate(to)

  return Math.max(
    0,
    Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1
  )
}

function combineRanges(
  ranges: Array<{
    from: string
    to: string
  }>
) {
  return ranges.reduce(
    (combined, range) => ({
      from: range.from < combined.from ? range.from : combined.from,
      to: range.to > combined.to ? range.to : combined.to,
    }),
    ranges[0]
  )
}

function aggregateChannelSummary(rows: DailyChannelCampaignRow[]): OverviewChannelSummary[] {
  const byPlatform = new Map<string, OverviewChannelSummary>()

  for (const row of rows) {
    const key = row.platform || "Unknown"
    const existing = byPlatform.get(key) ?? {
      platform: key,
      spend: 0,
      revenue: 0,
      purchases: 0,
      impressions: 0,
      clicks: 0,
    }

    existing.spend += row.spend
    existing.revenue += row.revenue
    existing.purchases += row.purchases
    existing.impressions += row.impressions
    existing.clicks += row.clicks
    byPlatform.set(key, existing)
  }

  return Array.from(byPlatform.values()).sort((left, right) => {
    if (right.revenue !== left.revenue) {
      return right.revenue - left.revenue
    }

    return left.platform.localeCompare(right.platform)
  })
}

function aggregateTopCreatives(
  rows: CreativePerformance[],
  dimensions: CreativeDimension[],
  limit = 10
): OverviewCreativeSnapshot[] {
  const dimensionByCreativeId = new Map(
    dimensions.map((dimension) => [dimension.creativeId, dimension] as const)
  )
  const byCreative = new Map<string, OverviewCreativeSnapshot>()

  for (const row of rows) {
    const dimension = dimensionByCreativeId.get(row.creativeId)
    const existing = byCreative.get(row.creativeId) ?? {
      creativeId: row.creativeId,
      platform: row.platform || dimension?.platform || "Unknown",
      adName: row.adName,
      headline: row.headline || dimension?.headline || "",
      format: row.format || dimension?.format || "",
      thumbnailUrl: row.thumbnailUrl || dimension?.thumbnailUrl || "",
      imageUrl: row.imageUrl || dimension?.imageUrl || "",
      videoUrl: row.videoUrl || dimension?.videoUrl || "",
      spend: 0,
      purchases: 0,
      revenue: 0,
    }

    existing.spend += row.totalSpend
    existing.purchases += row.totalPurchases
    existing.revenue += row.revenue
    byCreative.set(row.creativeId, existing)
  }

  return Array.from(byCreative.values())
    .sort((left, right) => {
      if (right.revenue !== left.revenue) {
        return right.revenue - left.revenue
      }

      if (right.spend !== left.spend) {
        return right.spend - left.spend
      }

      return left.creativeId.localeCompare(right.creativeId)
    })
    .slice(0, limit)
}

function aggregateTopProducts(
  rows: FactOrderItem[],
  limit = 10
): OverviewTopProduct[] {
  const byProduct = new Map<string, OverviewTopProduct>()

  for (const row of rows) {
    const key = row.productId || `${row.productName}::${row.variantName}::${row.sku}`
    const existing = byProduct.get(key) ?? {
      productId: row.productId,
      productName: row.productName,
      variantName: row.variantName,
      sku: row.sku,
      quantity: 0,
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
    }

    existing.quantity += row.netQuantity || row.quantity
    existing.revenue += row.netLineTotal || row.lineTotal
    existing.cogs += row.lineCost
    existing.grossProfit += row.grossProfit
    byProduct.set(key, existing)
  }

  return Array.from(byProduct.values())
    .sort((left, right) => {
      if (right.revenue !== left.revenue) {
        return right.revenue - left.revenue
      }

      return left.productName.localeCompare(right.productName)
    })
    .slice(0, limit)
}

function buildEmailSnapshot(
  campaigns: KlaviyoCampaign[],
  flows: KlaviyoFlow[]
): OverviewEmailSnapshot {
  return {
    campaignRevenue: campaigns.reduce(
      (total, campaign) => total + campaign.revenue,
      0
    ),
    flowRevenue: flows.reduce((total, flow) => total + flow.revenue, 0),
    totalRevenue:
      campaigns.reduce((total, campaign) => total + campaign.revenue, 0) +
      flows.reduce((total, flow) => total + flow.revenue, 0),
    campaignSends: campaigns.reduce((total, campaign) => total + campaign.sends, 0),
    flowSends: flows.reduce((total, flow) => total + flow.sends, 0),
  }
}

function aggregateOverviewTotalsForRange(
  rows: DailyOverviewRow[],
  range: {
    from: string
    to: string
  }
) {
  return sumOverviewTotals(
    rows.filter((row) => row.date >= range.from && row.date <= range.to)
  )
}

function resolveOverviewMetricValue(
  totals: OverviewMetricTotals,
  metricId: EcomDashMetricId
) {
  switch (metricId) {
    case "shopify_net_revenue":
    case "total_sales":
      return totals.revenue
    case "blended_ad_spend":
      return totals.adSpend
    case "orders_count":
      return totals.orders
    case "cogs":
      return totals.cogs
    case "allocated_overhead":
      return totals.allocatedOverhead
    case "aov":
      return totals.aov
    case "mer":
      return totals.mer
    case "gross_profit":
      return totals.grossProfit
    case "net_profit_after_ads":
      return totals.netProfitAfterAds
    case "contribution_margin":
      return totals.contributionMargin
    case "net_profit":
      return totals.netProfit
    default:
      return 0
  }
}

function isRateMetric(metricId: EcomDashMetricId) {
  return metricId === "mer" || metricId === "aov"
}

function getTargetMetricValue(
  row: TargetsEffectiveDaily,
  metricId: EcomDashMetricId
) {
  switch (metricId) {
    case "shopify_net_revenue":
      return row.revenueTarget > 0 ? row.revenueTarget : null
    case "blended_ad_spend":
      return row.adBudget > 0 ? row.adBudget : null
    case "net_profit":
      return row.profitTarget > 0 ? row.profitTarget : null
    case "mer":
      return row.targetMer > 0 ? row.targetMer : null
    default:
      return null
  }
}

function summarizeTargetMetric(
  rows: TargetsEffectiveDaily[],
  metricId: EcomDashMetricId
) {
  const values = rows
    .map((row) => getTargetMetricValue(row, metricId))
    .filter((value): value is number => value !== null)

  if (values.length === 0) {
    return null
  }

  if (isRateMetric(metricId)) {
    return values.reduce((total, value) => total + value, 0) / values.length
  }

  return values.reduce((total, value) => total + value, 0)
}

function buildOverviewPacingRows(input: {
  selectedMetricIds: readonly EcomDashMetricId[]
  monthToDateTotals: OverviewMetricTotals
  monthToDateRange: {
    from: string
    to: string
  }
  targetRows: TargetsEffectiveDaily[]
  fullMonthTargetRows: TargetsEffectiveDaily[]
  previousMonthTotals: OverviewMetricTotals
}): OverviewPacingRow[] {
  const elapsedDays = countInclusiveDays(
    input.monthToDateRange.from,
    input.monthToDateRange.to
  )
  const fullMonthRange = {
    from: startOfIsoMonth(input.monthToDateRange.to),
    to: endOfIsoMonth(input.monthToDateRange.to),
  }
  const totalDays = countInclusiveDays(fullMonthRange.from, fullMonthRange.to)

  return input.selectedMetricIds.map((metricId) => {
    const actualToDate = resolveOverviewMetricValue(input.monthToDateTotals, metricId)
    const explicitExpectedToDate = summarizeTargetMetric(input.targetRows, metricId)
    const explicitExpectedPeriodEnd = summarizeTargetMetric(
      input.fullMonthTargetRows,
      metricId
    )
    const previousMonthValue = resolveOverviewMetricValue(
      input.previousMonthTotals,
      metricId
    )
    const usingTarget =
      explicitExpectedToDate !== null && explicitExpectedPeriodEnd !== null
    const expectedToDate = usingTarget
      ? explicitExpectedToDate
      : isRateMetric(metricId)
        ? previousMonthValue
        : totalDays > 0
          ? (previousMonthValue * elapsedDays) / totalDays
          : 0
    const expectedPeriodEnd = usingTarget
      ? explicitExpectedPeriodEnd
      : previousMonthValue
    const projectedPeriodEnd = isRateMetric(metricId)
      ? actualToDate
      : elapsedDays > 0
        ? (actualToDate * totalDays) / elapsedDays
        : 0

    return {
      metricId,
      actualToDate,
      expectedToDate,
      deltaToDate: actualToDate - expectedToDate,
      projectedPeriodEnd,
      expectedPeriodEnd,
      source: usingTarget ? "target" : "baseline",
      sourceLabel: usingTarget ? "Target" : "Baseline",
      supportText: usingTarget
        ? "Expected pace comes from the workspace target plan."
        : "Expected pace uses the previous month as the fallback baseline.",
    }
  })
}

function buildSnapshotRanges(anchorDate: string) {
  const previousMonthAnchor = shiftIsoDateByMonths(anchorDate, -1)
  const previousMonthRange = {
    from: startOfIsoMonth(previousMonthAnchor),
    to: endOfIsoMonth(previousMonthAnchor),
  }

  return [
    {
      id: "today",
      label: "Today",
      range: {
        from: anchorDate,
        to: anchorDate,
      },
    },
    {
      id: "yesterday",
      label: "Yesterday",
      range: {
        from: addUtcDays(anchorDate, -1),
        to: addUtcDays(anchorDate, -1),
      },
    },
    {
      id: "last_7_days",
      label: "Last 7 Days",
      range: {
        from: addUtcDays(anchorDate, -6),
        to: anchorDate,
      },
    },
    {
      id: "last_month",
      label: "Last Month",
      range: previousMonthRange,
    },
  ] as const
}

function buildSnapshotRows(input: {
  rows: DailyOverviewRow[]
  compare: DashboardRequestContext["compare"]
  anchorDate: string
}): OverviewSnapshotRow[] {
  return buildSnapshotRanges(input.anchorDate).map((definition) => {
    const totals = aggregateOverviewTotalsForRange(input.rows, definition.range)
    const comparisonRange = getComparisonRange(
      definition.range.from,
      definition.range.to,
      input.compare
    )
    const comparisonTotals = comparisonRange
      ? aggregateOverviewTotalsForRange(input.rows, comparisonRange)
      : null

    return {
      id: definition.id,
      label: definition.label,
      range: definition.range,
      comparisonRange,
      revenue: totals.revenue,
      netProfit: totals.netProfit,
      mer: totals.mer,
      comparisonRevenue: comparisonTotals?.revenue ?? null,
      comparisonDeltaPct:
        comparisonTotals && comparisonTotals.revenue > 0
          ? ((totals.revenue - comparisonTotals.revenue) /
              comparisonTotals.revenue) *
            100
          : null,
    }
  })
}

export async function loadOverviewSlice(
  context: DashboardRequestContext
): Promise<OverviewSliceData> {
  const cacheBuster = context.refresh ?? context.loadedAt
  const comparisonRange = getComparisonRange(
    context.from,
    context.to,
    context.compare
  )
  const monthToDateRange = getMonthToDateRange(context.to)
  const fullMonthRange = {
    from: startOfIsoMonth(context.to),
    to: endOfIsoMonth(context.to),
  }
  const snapshotDefinitions = buildSnapshotRanges(context.to)
  const snapshotFetchRange = combineRanges(
    snapshotDefinitions.flatMap((definition) => {
      const ranges = [definition.range]
      const snapshotComparisonRange = getComparisonRange(
        definition.range.from,
        definition.range.to,
        context.compare
      )

      if (snapshotComparisonRange) {
        ranges.push(snapshotComparisonRange)
      }

      return ranges
    })
  )
  const orderItemFetchRange = combineRanges(
    [
      {
        from: context.from,
        to: context.to,
      },
      monthToDateRange,
      snapshotFetchRange,
      ...(comparisonRange ? [comparisonRange] : []),
    ].filter(Boolean)
  )

  const [
    configRows,
    targetRows,
    costSettingsRows,
    skuCostRows,
    currentOverviewRows,
    currentChannelRows,
    currentCreativeRows,
    creativeDimensionRows,
    currentCampaignRows,
    currentFlowRows,
    orderItemRows,
    monthToDateOverviewRows,
    monthToDateTargetRows,
    fullMonthTargetRows,
    budgetTargetsMetaRows,
    comparisonOverviewRows,
    snapshotOverviewRows,
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
    selectRowsFromTable("contractCreativePerformance", {
      workspaceId: context.workspaceId,
      from: context.from,
      to: context.to,
      cacheBuster,
    }),
    selectRowsFromTable("dimCreative", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("reportKlaviyoCampaigns", {
      workspaceId: context.workspaceId,
      from: context.from,
      to: context.to,
      cacheBuster,
    }),
    selectRowsFromTable("reportKlaviyoFlows", {
      workspaceId: context.workspaceId,
      from: context.from,
      to: context.to,
      cacheBuster,
    }),
    selectRowsFromTable("factOrderItems", {
      workspaceId: context.workspaceId,
      from: orderItemFetchRange.from,
      to: orderItemFetchRange.to,
      cacheBuster,
    }),
    selectRowsFromTable("contractDailyOverview", {
      workspaceId: context.workspaceId,
      from: monthToDateRange.from,
      to: monthToDateRange.to,
      cacheBuster,
    }),
    selectRowsFromTable("targetsEffectiveDaily", {
      workspaceId: context.workspaceId,
      from: monthToDateRange.from,
      to: monthToDateRange.to,
      cacheBuster,
    }),
    selectRowsFromTable("targetsEffectiveDaily", {
      workspaceId: context.workspaceId,
      from: fullMonthRange.from,
      to: fullMonthRange.to,
      cacheBuster,
    }),
    selectRowsFromTable("budgetTargetsMeta", {
      workspaceId: context.workspaceId,
      limit: 1,
      cacheBuster,
    }),
    comparisonRange
      ? selectRowsFromTable("contractDailyOverview", {
          workspaceId: context.workspaceId,
          from: comparisonRange.from,
          to: comparisonRange.to,
          cacheBuster,
        })
      : Promise.resolve([]),
    selectRowsFromTable("contractDailyOverview", {
      workspaceId: context.workspaceId,
      from: snapshotFetchRange.from,
      to: snapshotFetchRange.to,
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
  const parsedOrderItems = orderItemRows.map(parseFactOrderItem)
  const dailyCostSummary = buildDailyOrderItemCostSummary({
    orderItems: parsedOrderItems,
    skuCosts: skuCostRows.map(parseSkuCost),
    costSettings,
  })
  const monthlyOverhead = costSettings?.monthlyOverhead ?? 0
  const selectedOverviewRows = applyAllocatedOverhead(
    applyDailyCostSummaryToOverviewRows(
      currentOverviewRows.map(parseDailyOverviewRow),
      dailyCostSummary
    ),
    monthlyOverhead
  )
  const selectedComparisonRows = applyAllocatedOverhead(
    applyDailyCostSummaryToOverviewRows(
      comparisonOverviewRows.map(parseDailyOverviewRow),
      dailyCostSummary
    ),
    monthlyOverhead
  )
  const monthToDateRows = applyAllocatedOverhead(
    applyDailyCostSummaryToOverviewRows(
      monthToDateOverviewRows.map(parseDailyOverviewRow),
      dailyCostSummary
    ),
    monthlyOverhead
  )
  const snapshotRows = applyAllocatedOverhead(
    applyDailyCostSummaryToOverviewRows(
      snapshotOverviewRows.map(parseDailyOverviewRow),
      dailyCostSummary
    ),
    monthlyOverhead
  )
  const selectedChannelRows = currentChannelRows.map(parseDailyChannelCampaignRow)
  const selectedCampaigns = currentCampaignRows.map(parseKlaviyoCampaign)
  const selectedFlows = currentFlowRows.map(parseKlaviyoFlow)
  const parsedMonthToDateTargets = monthToDateTargetRows.map(parseTargetsEffectiveDaily)
  const parsedFullMonthTargets = fullMonthTargetRows.map(parseTargetsEffectiveDaily)
  const previousMonthRange = {
    from: startOfIsoMonth(shiftIsoDateByMonths(context.to, -1)),
    to: endOfIsoMonth(shiftIsoDateByMonths(context.to, -1)),
  }
  const previousMonthTotals = aggregateOverviewTotalsForRange(
    snapshotRows,
    previousMonthRange
  )

  return {
    context,
    selectedRange: {
      range: {
        from: context.from,
        to: context.to,
      },
      overviewRows: selectedOverviewRows,
      comparisonRange,
      comparisonRows: selectedComparisonRows,
      channelCampaignRows: selectedChannelRows,
      channelSummary: aggregateChannelSummary(selectedChannelRows),
      topProducts: aggregateTopProducts(
        parsedOrderItems.filter(
          (item) => item.orderDate >= context.from && item.orderDate <= context.to
        )
      ),
      topCreatives: aggregateTopCreatives(
        currentCreativeRows.map(parseCreativePerformance),
        creativeDimensionRows.map(parseCreativeDimension)
      ),
      emailCampaigns: selectedCampaigns,
      emailFlows: selectedFlows,
      emailSnapshot: buildEmailSnapshot(selectedCampaigns, selectedFlows),
      totals: sumOverviewTotals(selectedOverviewRows),
      comparisonTotals: comparisonRange
        ? sumOverviewTotals(selectedComparisonRows)
        : null,
    },
    monthToDate: {
      range: monthToDateRange,
      overviewRows: monthToDateRows,
      targetRows: parsedMonthToDateTargets,
      totals: sumOverviewTotals(monthToDateRows),
      targetMeta: budgetTargetsMetaRows[0]
        ? parseBudgetTargetsMeta(budgetTargetsMetaRows[0])
        : null,
      pacingRows: buildOverviewPacingRows({
        selectedMetricIds: settings.overviewPacing.selectedMetricIds,
        monthToDateTotals: sumOverviewTotals(monthToDateRows),
        monthToDateRange,
        targetRows: parsedMonthToDateTargets,
        fullMonthTargetRows: parsedFullMonthTargets,
        previousMonthTotals,
      }),
    },
    snapshotRows: buildSnapshotRows({
      rows: snapshotRows,
      compare: context.compare,
      anchorDate: context.to,
    }),
    settings,
    costSettings,
  }
}
