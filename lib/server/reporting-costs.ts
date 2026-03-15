import "server-only"

import {
  calculateContributionMargin,
  calculateGrossProfit,
  calculateNetProfit,
  calculateNetProfitAfterAds,
} from "@/lib/metrics/formulas"
import { buildSkuCostRowKey } from "@/lib/settings/costs"
import type {
  CostSettings,
  DailyOverviewRow,
  FactOrderItem,
  SkuCost,
} from "@/types/backend"

export type DailyOrderItemCostSummaryRow = {
  date: string
  cogs: number
  exactRevenue: number
  fallbackRevenue: number
  missingRevenue: number
  missingKeys: string[]
}

export type OrderItemCostCoverageSummary = {
  exactRevenue: number
  fallbackRevenue: number
  missingRevenue: number
}

type MutableDailyOrderItemCostSummaryRow = {
  date: string
  cogs: number
  exactRevenue: number
  fallbackRevenue: number
  missingRevenue: number
  missingKeys: Set<string>
}

function roundCostValue(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.round(value * 1_000_000) / 1_000_000
}

function toPositiveNumber(value: unknown) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function toPercentRatio(value: unknown) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }

  return parsed > 1 ? parsed / 100 : parsed
}

function buildFallbackMissingKey(item: FactOrderItem) {
  const itemRowKey = buildSkuCostRowKey({
    shopifyVariantId: item.variantId,
    sku: item.sku,
    productTitle: item.productName,
    variantTitle: item.variantName,
  })

  if (itemRowKey) {
    return itemRowKey
  }

  const lineItemId = String(item.lineItemId ?? "")
    .trim()
    .toLowerCase()

  return lineItemId ? `line:${lineItemId}` : "line:unknown"
}

function buildSkuCostLookup(skuCosts: SkuCost[]) {
  const byRowKey = new Map<string, SkuCost>()

  for (const row of skuCosts) {
    const rowKey =
      String(row.rowKey ?? "").trim() ||
      buildSkuCostRowKey({
        shopifyVariantId: row.shopifyVariantId,
        sku: row.sku,
        productTitle: row.productTitle,
        variantTitle: row.variantTitle,
      })

    if (!rowKey) {
      continue
    }

    byRowKey.set(rowKey, row)
  }

  return byRowKey
}

function findMatchingSkuCost(
  item: FactOrderItem,
  lookup: Map<string, SkuCost>
) {
  const candidateKeys = [
    buildSkuCostRowKey({ shopifyVariantId: item.variantId }),
    buildSkuCostRowKey({ sku: item.sku }),
    buildSkuCostRowKey({
      productTitle: item.productName,
      variantTitle: item.variantName,
    }),
  ].filter(Boolean)

  for (const key of candidateKeys) {
    const match = lookup.get(key)

    if (match) {
      return match
    }
  }

  return null
}

export function buildDailyOrderItemCostSummary(input: {
  orderItems: FactOrderItem[]
  skuCosts: SkuCost[]
  costSettings: CostSettings | null
}) {
  const defaultMarginRatio = toPercentRatio(
    input.costSettings?.defaultMarginPct ?? 0
  )
  const skuCostLookup = buildSkuCostLookup(input.skuCosts)
  const byDate = new Map<string, MutableDailyOrderItemCostSummaryRow>()

  for (const item of input.orderItems) {
    const date = String(item.orderDate ?? "").slice(0, 10)
    const revenue = Number(item.lineTotal ?? 0)

    if (!date || !Number.isFinite(revenue) || revenue <= 0) {
      continue
    }

    const rawQuantity = Number(item.quantity ?? 0)
    const quantity = Number.isFinite(rawQuantity) ? rawQuantity : 0
    const existing = byDate.get(date) ?? {
      date,
      cogs: 0,
      exactRevenue: 0,
      fallbackRevenue: 0,
      missingRevenue: 0,
      missingKeys: new Set<string>(),
    }
    const matchedSkuCost = findMatchingSkuCost(item, skuCostLookup)
    const overrideUnitCost = toPositiveNumber(matchedSkuCost?.overrideUnitCost)
    const matchedShopifyUnitCost = toPositiveNumber(matchedSkuCost?.shopifyCost)
    const lineUnitCost = toPositiveNumber(item.unitCost)

    if (overrideUnitCost !== null) {
      existing.cogs += Math.max(quantity, 0) * overrideUnitCost
      existing.exactRevenue += revenue
      byDate.set(date, existing)
      continue
    }

    if (matchedShopifyUnitCost !== null) {
      existing.cogs += Math.max(quantity, 0) * matchedShopifyUnitCost
      existing.exactRevenue += revenue
      byDate.set(date, existing)
      continue
    }

    if (lineUnitCost !== null) {
      existing.cogs += Math.max(quantity, 0) * lineUnitCost
      existing.exactRevenue += revenue
      byDate.set(date, existing)
      continue
    }

    if (defaultMarginRatio > 0) {
      existing.cogs += revenue * (1 - defaultMarginRatio)
      existing.fallbackRevenue += revenue
      existing.missingKeys.add(buildFallbackMissingKey(item))
      byDate.set(date, existing)
      continue
    }

    existing.missingRevenue += revenue
    existing.missingKeys.add(buildFallbackMissingKey(item))
    byDate.set(date, existing)
  }

  return Array.from(byDate.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .map<DailyOrderItemCostSummaryRow>((row) => ({
      date: row.date,
      cogs: roundCostValue(row.cogs),
      exactRevenue: roundCostValue(row.exactRevenue),
      fallbackRevenue: roundCostValue(row.fallbackRevenue),
      missingRevenue: roundCostValue(row.missingRevenue),
      missingKeys: Array.from(row.missingKeys).sort((left, right) =>
        left.localeCompare(right)
      ),
    }))
}

export function summarizeOrderItemCostCoverage(
  rows: DailyOrderItemCostSummaryRow[]
): OrderItemCostCoverageSummary {
  return rows.reduce<OrderItemCostCoverageSummary>(
    (totals, row) => {
      totals.exactRevenue += row.exactRevenue
      totals.fallbackRevenue += row.fallbackRevenue
      totals.missingRevenue += row.missingRevenue
      return totals
    },
    {
      exactRevenue: 0,
      fallbackRevenue: 0,
      missingRevenue: 0,
    }
  )
}

export function applyDailyCostSummaryToOverviewRows(
  overviewRows: DailyOverviewRow[],
  costSummaryRows: DailyOrderItemCostSummaryRow[]
) {
  const summaryByDate = new Map(
    costSummaryRows.map((row) => [row.date, row] as const)
  )

  return overviewRows.map((row) => {
    const costSummary = summaryByDate.get(row.date)

    if (!costSummary) {
      return row
    }

    const cogs = costSummary.cogs
    const grossProfit = calculateGrossProfit(row.totalRevenue, cogs)
    const netProfitAfterAds = calculateNetProfitAfterAds(
      grossProfit,
      row.totalSpend
    )
    const contributionMargin = calculateContributionMargin(
      row.totalRevenue,
      cogs,
      row.totalSpend
    )

    return {
      ...row,
      cogs,
      grossProfit,
      netProfitAfterAds,
      contributionMargin,
      netProfit: calculateNetProfit(contributionMargin, row.allocatedOverhead),
    }
  })
}
