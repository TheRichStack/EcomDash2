import "server-only"

import { selectRowsFromTable } from "@/lib/db/query"
import {
  parseConfigEntry,
  parseCostSettings,
  parseDailyOverviewRow,
  parseFactOrderItem,
  parseSkuCost,
  parseTargetEntry,
} from "@/lib/db/record-parsers"
import { getComparisonRange } from "@/lib/server/date-ranges"
import { buildEcomDash2SettingsSnapshot } from "@/lib/server/dashboard-settings"
import {
  applyDailyCostSummaryToOverviewRows,
  buildDailyOrderItemCostSummary,
} from "@/lib/server/reporting-costs"
import {
  applyAllocatedOverhead,
  sumProfitTotals,
  toProfitSeries,
} from "@/lib/server/reporting-math"
import type { ShopifyProfitSliceData } from "@/types/backend"
import type { DashboardRequestContext } from "@/types/dashboard"

export async function loadShopifyProfitSlice(
  context: DashboardRequestContext
): Promise<ShopifyProfitSliceData> {
  const cacheBuster = context.refresh ?? context.loadedAt
  const comparisonRange = getComparisonRange(
    context.from,
    context.to,
    context.compare
  )
  const orderItemsFrom = comparisonRange
    ? (comparisonRange.from < context.from ? comparisonRange.from : context.from)
    : context.from
  const orderItemsTo = comparisonRange
    ? (comparisonRange.to > context.to ? comparisonRange.to : context.to)
    : context.to
  const [
    configRows,
    targetRows,
    costSettingsRows,
    skuCostRows,
    overviewRows,
    comparisonRows,
    factOrderItemRows,
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
      comparisonRange
        ? selectRowsFromTable("contractDailyOverview", {
            workspaceId: context.workspaceId,
            from: comparisonRange.from,
            to: comparisonRange.to,
            cacheBuster,
          })
        : Promise.resolve([]),
      selectRowsFromTable("factOrderItems", {
        workspaceId: context.workspaceId,
        from: orderItemsFrom,
        to: orderItemsTo,
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
  const dailyCostSummary = buildDailyOrderItemCostSummary({
    orderItems: factOrderItemRows.map(parseFactOrderItem),
    skuCosts: skuCostRows.map(parseSkuCost),
    costSettings,
  })
  const monthlyOverhead = costSettings?.monthlyOverhead ?? 0
  const currentDaily = toProfitSeries(
    applyAllocatedOverhead(
      applyDailyCostSummaryToOverviewRows(
        overviewRows.map(parseDailyOverviewRow),
        dailyCostSummary
      ),
      monthlyOverhead
    )
  )
  const comparisonDaily = toProfitSeries(
    applyAllocatedOverhead(
      applyDailyCostSummaryToOverviewRows(
        comparisonRows.map(parseDailyOverviewRow),
        dailyCostSummary
      ),
      monthlyOverhead
    )
  )

  return {
    context,
    currentRange: {
      range: {
        from: context.from,
        to: context.to,
      },
      daily: currentDaily,
      totals: sumProfitTotals(currentDaily),
    },
    comparison: comparisonRange
      ? {
          range: comparisonRange,
          daily: comparisonDaily,
          totals: sumProfitTotals(comparisonDaily),
        }
      : null,
    settings: {
      currency: settings.currency,
      configEntries: settings.configEntries,
      targetEntries: settings.targetEntries,
      kpis: settings.shopifyProfitKpis,
    },
    costSettings,
  }
}
