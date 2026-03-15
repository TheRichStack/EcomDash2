import {
  calculateAov,
  calculateBlendedRoas,
  calculateContributionMargin,
  calculateMer,
  calculateNetProfit,
} from "@/lib/metrics/formulas"
import type {
  DailyOverviewRow,
  OverviewMetricTotals,
  ProfitSeriesRow,
  ProfitTotals,
} from "@/types/backend"

function daysInMonthIso(isoDate: string) {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`)
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)
  ).getUTCDate()
}

export function calculateAllocatedOverheadForDate(
  isoDate: string,
  monthlyOverhead: number
) {
  if (!Number.isFinite(monthlyOverhead) || monthlyOverhead <= 0) {
    return 0
  }

  return monthlyOverhead / Math.max(1, daysInMonthIso(isoDate))
}

export function applyAllocatedOverhead(
  rows: DailyOverviewRow[],
  monthlyOverhead: number
) {
  return rows.map((row) => {
    const allocatedOverhead = row.date
      ? calculateAllocatedOverheadForDate(row.date, monthlyOverhead)
      : 0
    const contributionMargin = calculateContributionMargin(
      row.totalRevenue,
      row.cogs,
      row.totalSpend
    )

    return {
      ...row,
      allocatedOverhead,
      contributionMargin,
      netProfit: calculateNetProfit(contributionMargin, allocatedOverhead),
    }
  })
}

export function sumOverviewTotals(rows: DailyOverviewRow[]): OverviewMetricTotals {
  const totals = rows.reduce(
    (accumulator, row) => {
      accumulator.revenue += row.totalRevenue
      accumulator.orders += row.totalOrders
      accumulator.adSpend += row.totalSpend
      accumulator.cogs += row.cogs
      accumulator.grossProfit += row.grossProfit
      accumulator.netProfitAfterAds += row.netProfitAfterAds
      accumulator.allocatedOverhead += row.allocatedOverhead
      accumulator.netProfit += row.netProfit
      accumulator.platformAttributedRevenue += row.platformAttributedRevenue
      return accumulator
    },
    {
      revenue: 0,
      orders: 0,
      adSpend: 0,
      aov: 0,
      mer: 0,
      blendedRoas: 0,
      cogs: 0,
      grossProfit: 0,
      netProfitAfterAds: 0,
      allocatedOverhead: 0,
      contributionMargin: 0,
      netProfit: 0,
      platformAttributedRevenue: 0,
    } satisfies OverviewMetricTotals
  )

  totals.aov = calculateAov(totals.revenue, totals.orders)
  totals.mer = calculateMer(totals.revenue, totals.adSpend)
  totals.blendedRoas = calculateBlendedRoas(
    totals.platformAttributedRevenue,
    totals.adSpend
  )
  totals.contributionMargin = calculateContributionMargin(
    totals.revenue,
    totals.cogs,
    totals.adSpend
  )

  return totals
}

export function toProfitSeries(rows: DailyOverviewRow[]): ProfitSeriesRow[] {
  return rows.map((row) => ({
    date: row.date,
    totalSales: row.totalRevenue,
    marketingCosts: row.totalSpend,
    cogs: row.cogs,
    contributionMargin: row.contributionMargin,
    allocatedOverhead: row.allocatedOverhead,
    netProfit: row.netProfit,
  }))
}

export function sumProfitTotals(rows: ProfitSeriesRow[]): ProfitTotals {
  return rows.reduce(
    (accumulator, row) => {
      accumulator.totalSales += row.totalSales
      accumulator.marketingCosts += row.marketingCosts
      accumulator.cogs += row.cogs
      accumulator.contributionMargin += row.contributionMargin
      accumulator.allocatedOverhead += row.allocatedOverhead
      accumulator.netProfit += row.netProfit
      return accumulator
    },
    {
      totalSales: 0,
      marketingCosts: 0,
      cogs: 0,
      contributionMargin: 0,
      allocatedOverhead: 0,
      netProfit: 0,
    } satisfies ProfitTotals
  )
}
