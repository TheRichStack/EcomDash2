import type { MetricFormulaToken } from "@/types/metrics"

function toFiniteNumber(value: number) {
  return Number.isFinite(value) ? value : 0
}

export function safeDivide(numerator: number, denominator: number): number {
  const safeNumerator = Number(numerator)
  const safeDenominator = Number(denominator)

  if (!Number.isFinite(safeNumerator) || !Number.isFinite(safeDenominator)) {
    return 0
  }

  if (safeDenominator <= 0) {
    return 0
  }

  return safeNumerator / safeDenominator
}

export function calculateAov(revenue: number, orders: number) {
  return safeDivide(revenue, orders)
}

export function calculateMer(revenue: number, adSpend: number) {
  return safeDivide(revenue, adSpend)
}

export function calculateBlendedRoas(
  attributedRevenue: number,
  adSpend: number
) {
  return safeDivide(attributedRevenue, adSpend)
}

export function calculateGrossProfit(revenue: number, cogs: number) {
  return toFiniteNumber(revenue) - toFiniteNumber(cogs)
}

export function calculateNetProfitAfterAds(
  grossProfit: number,
  adSpend: number
) {
  return toFiniteNumber(grossProfit) - toFiniteNumber(adSpend)
}

export function calculateContributionMargin(
  totalSales: number,
  cogs: number,
  marketingCosts: number
) {
  return (
    toFiniteNumber(totalSales) -
    toFiniteNumber(cogs) -
    toFiniteNumber(marketingCosts)
  )
}

export function calculateNetProfit(
  contributionMargin: number,
  allocatedOverhead: number
) {
  return toFiniteNumber(contributionMargin) - toFiniteNumber(allocatedOverhead)
}

export function calculatePlatformAttributedRevenue(
  metaRevenue: number,
  googleRevenue: number,
  tiktokRevenue: number
) {
  return (
    toFiniteNumber(metaRevenue) +
    toFiniteNumber(googleRevenue) +
    toFiniteNumber(tiktokRevenue)
  )
}

export function formulaSignatureFromTokens(tokens: MetricFormulaToken[]) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return "base"
  }

  return tokens
    .map((token) => (token.type === "metric" ? token.metricId : token.value))
    .join("")
}
