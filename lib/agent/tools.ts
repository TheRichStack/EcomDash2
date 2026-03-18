import "server-only"

import { env } from "@/lib/env"
import { loadEmailSlice } from "@/lib/server/loaders/email"
import { loadOverviewSlice } from "@/lib/server/loaders/overview"
import { loadCreativeSlice, loadPaidMediaSlice } from "@/lib/server/loaders/paid-media"
import { getComparisonRange } from "@/lib/server/date-ranges"
import { loadSettingsSlice } from "@/lib/server/loaders/settings"
import { loadShopifyFunnelSlice } from "@/lib/server/loaders/shopify-funnel"
import { loadShopifyInventorySlice } from "@/lib/server/loaders/shopify-inventory"
import { loadShopifyProductsSlice } from "@/lib/server/loaders/shopify-products"
import { loadAdPerformanceSlice } from "@/lib/server/loaders/ad-performance"
import { loadAdSegmentsSlice } from "@/lib/server/loaders/ad-segments"
import { loadOrderAnalysisSlice } from "@/lib/server/loaders/order-analysis"
import { loadBudgetVsActualSlice } from "@/lib/server/loaders/budget-vs-actual"
import { loadCustomerCohortsSlice } from "@/lib/server/loaders/customer-cohorts"
import { buildAnomalyScan } from "@/lib/agent/anomalies"
import {
  AGENT_MAX_TOOL_COUNT,
} from "@/lib/agent/constants"
import type { AgentToolName, AgentToolResult } from "@/lib/agent/types"
import type { DashboardRequestContext } from "@/types/dashboard"

export type AgentToolCatalogItem = {
  name: AgentToolName
  description: string
}

export const AGENT_TOOL_CATALOG: AgentToolCatalogItem[] = [
  { name: "ad_performance",    description: "Ad-level and adset-level metrics: impressions, clicks, spend, ROAS, CPA, video hook rate, view-through rate per ad." },
  { name: "ad_segments",       description: "Ad performance broken down by country, device type, and audience segment across platforms." },
  { name: "anomaly_scan",      description: "Detects unusual metric movements compared to the prior period across revenue, spend, and key KPIs." },
  { name: "budget_vs_actual",  description: "Planned monthly budget vs actual spend by channel; pacing percentage and over/underspend." },
  { name: "creative_performance", description: "Creative-level spend, ROAS, hook rate, and video completion metrics; best and worst performing creatives." },
  { name: "customer_cohorts", description: "Customer LTV, cohort retention curves, acquisition volume by month, and 3/6/12-month revenue per acquired customer." },
  { name: "data_freshness",    description: "Shows when each data source (Shopify, Meta, Google, TikTok, Klaviyo) was last synced." },
  { name: "email_performance", description: "Email campaign and flow metrics: open rate, click rate, revenue per email, unsubscribes." },
  { name: "inventory_risk",    description: "Inventory levels, days of stock remaining, and stockout risk per product and variant." },
  { name: "order_analysis",    description: "Orders grouped by UTM source, acquisition channel, and country; new vs returning customer split and AOV." },
  { name: "overview_summary",  description: "High-level business overview: total revenue, orders, ad spend, blended ROAS, and period-over-period changes." },
  { name: "paid_media_summary", description: "Channel and campaign-level paid media: spend, impressions, ROAS, CPA across Meta, Google, TikTok." },
  { name: "product_performance", description: "Product and variant-level sales, units sold, revenue, and gross margin over the selected period." },
]

function keywordSet(message: string) {
  return new Set(
    String(message ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  )
}

function keywordList(message: string) {
  return String(message ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function productNameIncludesToken(productName: string, token: string) {
  if (productName.includes(token)) {
    return true
  }

  if (token.endsWith("s") && token.length > 3) {
    return productName.includes(token.slice(0, -1))
  }

  return false
}

function hasAnyTerm(terms: Set<string>, values: readonly string[]) {
  return values.some((value) => terms.has(value))
}

const AD_PERF_TERMS = [
  "adset",
  "adsets",
  "cpm",
  "ctr",
  "hook",
  "impression",
  "impressions",
  "outbound",
  "video",
] as const

const PAID_MEDIA_TERMS = [
  "ads",
  "ad",
  "campaign",
  "cpa",
  "google",
  "mer",
  "meta",
  "roas",
  "spend",
  "tiktok",
] as const

const CREATIVE_TERMS = [
  "creative",
  "creatives",
  "format",
  "headline",
  "hook",
  "static",
  "thumbnail",
  "ugc",
] as const

const SEGMENT_TERMS = [
  "audience",
  "audiences",
  "country",
  "countries",
  "device",
  "devices",
  "desktop",
  "geo",
  "geographic",
  "mobile",
  "segment",
  "segments",
] as const

const ORDER_TERMS = [
  "acquisition",
  "channel",
  "direct",
  "first order",
  "new customer",
  "new customers",
  "order",
  "orders",
  "organic",
  "referral",
  "returning customer",
  "returning customers",
  "utm",
] as const

const BUDGET_TERMS = [
  "budget",
  "budgets",
  "forecast",
  "overspend",
  "pacing",
  "pace",
  "planned",
  "underspend",
] as const

const COHORT_TERMS = [
  "cac",
  "cohort",
  "cohorts",
  "ltv",
  "lifetime",
  "payback",
  "repeat",
  "repurchase",
  "retention",
] as const

const INVENTORY_TERMS = [
  "inventory",
  "sku",
  "stock",
  "warehouse",
] as const

const PRODUCT_TERMS = [
  "gross",
  "margin",
  "product",
  "products",
  "sku",
  "sell",
  "sold",
  "unit",
  "units",
  "variant",
] as const

const EMAIL_TERMS = [
  "email",
  "flow",
  "flows",
  "klaviyo",
] as const

const FRESHNESS_TERMS = [
  "backfill",
  "connector",
  "freshness",
  "job",
  "jobs",
  "sync",
] as const

const OVERVIEW_TERMS = [
  "aov",
  "compare",
  "conversion",
  "cvr",
  "gross",
  "health",
  "margin",
  "orders",
  "overview",
  "performance",
  "profit",
  "revenue",
  "sales",
  "summary",
  "trend",
] as const

const TRAFFIC_CONVERSION_TERMS = [
  "conversion",
  "convert",
  "cvr",
  "funnel",
  "session",
  "sessions",
  "traffic",
] as const

const PRODUCT_MATCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "did",
  "for",
  "from",
  "how",
  "in",
  "many",
  "much",
  "what",
  "we",
  "were",
  "year",
  "month",
  "sales",
  "sell",
  "sold",
  "unit",
  "units",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
])

const TOOL_PAYLOAD_CAPS = {
  adPerfRows: 20,
  anomalyCoverage: 6,
  creativeRows: 15,
  anomalySignals: 20,
  emailCampaigns: 8,
  emailFlows: 8,
  emailFlowSteps: 5,
  freshnessBackfills: 8,
  freshnessJobs: 8,
  freshnessSyncState: 12,
  funnelBreakdownRows: 8,
  funnelDailyRows: 90,
  funnelProductRows: 20,
  inventoryRows: 12,
  paidMediaCampaigns: 20,
  paidMediaCampaignDaily: 30,
  paidMediaChannels: 6,
  productComparisonRows: 20,
  productMatchingRows: 10,
  productTags: 30,
  productTopRows: 20,
  segmentCountry: 12,
  segmentDevice: 6,
  segmentAudience: 10,
  orderUtmSource: 10,
  orderSource: 8,
  orderCountry: 12,
  budgetChannels: 10,
  cohortRows: 12,
} as const

function asFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function roundNumber(value: number, decimals = 2) {
  const factor = 10 ** Math.max(0, Math.floor(decimals))
  return Math.round(value * factor) / factor
}

function compactRows<T>(rows: readonly T[], cap: number) {
  return rows.slice(0, Math.max(1, Math.floor(cap)))
}

function summarizeTopDrivers<T>(input: {
  rows: readonly T[]
  cap: number
  label: (row: T) => string
  score: (row: T) => number
}) {
  return compactRows(
    [...input.rows].sort((left, right) => input.score(right) - input.score(left)),
    input.cap
  )
    .map((row) => ({
      label: input.label(row),
      score: roundNumber(input.score(row), 2),
    }))
    .filter((row) => row.label)
}

function withEvidence(
  result: AgentToolResult,
  evidence: Record<string, unknown>
): AgentToolResult {
  return {
    ...result,
    evidence,
  } as AgentToolResult
}

function shapeDatasetValue(value: unknown, rowLimit: number): unknown {
  if (Array.isArray(value)) {
    return value
      .slice(0, rowLimit)
      .map((entry) => shapeDatasetValue(entry, rowLimit))
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const shaped: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    shaped[key] = shapeDatasetValue(entry, rowLimit)
  }

  return shaped
}

function applyDatasetRowLimit<T>(dataset: T) {
  const rowLimit = Math.max(1, Math.floor(env.agent.datasetRowLimit))
  return shapeDatasetValue(dataset, rowLimit) as T
}

export function isBusinessAnalysisPrompt(message: string) {
  const normalized = String(message ?? "").trim().toLowerCase()

  if (!normalized) {
    return false
  }

  const terms = keywordSet(normalized)

  return (
    hasAnyTerm(terms, PAID_MEDIA_TERMS) ||
    hasAnyTerm(terms, INVENTORY_TERMS) ||
    hasAnyTerm(terms, PRODUCT_TERMS) ||
    hasAnyTerm(terms, EMAIL_TERMS) ||
    hasAnyTerm(terms, FRESHNESS_TERMS) ||
    hasAnyTerm(terms, OVERVIEW_TERMS) ||
    /(how many|how much|did we sell|units sold|what did we sell)/.test(normalized) ||
    /\b(20\d{2})\b/.test(normalized)
  )
}

async function buildAdPerformanceTool(
  context: DashboardRequestContext,
  _message: string
): Promise<AgentToolResult> {
  void _message
  const slice = await loadAdPerformanceSlice(context)
  const topRows = compactRows(slice.rows, TOOL_PAYLOAD_CAPS.adPerfRows)

  return withEvidence(
    {
      data: {
        kpis: slice.kpis,
        range: slice.range,
        topAds: topRows,
      },
      label: "Ad performance",
      name: "ad_performance",
      summary: `${topRows.length} ads returned. Blended ROAS ${slice.kpis.blendedRoas.toFixed(2)}, total spend ${slice.kpis.totalSpend.toFixed(2)}.`,
    },
    {
      caveats: topRows.length === 0
        ? ["No ad-level data found for selected date range."]
        : [],
      kpis: {
        blendedCpa: roundNumber(slice.kpis.blendedCpa, 2),
        blendedRoas: roundNumber(slice.kpis.blendedRoas, 2),
        totalImpressions: roundNumber(slice.kpis.totalImpressions, 0),
        totalSpend: roundNumber(slice.kpis.totalSpend, 2),
        // hookRate: not available as a kpis aggregate — per-row only; use topAds rows for video analysis
      },
      range: slice.range,
      topDrivers: summarizeTopDrivers({
        rows: topRows,
        cap: 3,
        label: (row) => String((row as { adName?: string }).adName ?? "Unknown"),
        score: (row) => asFiniteNumber((row as { spend?: number }).spend),
      }),
    }
  )
}

async function buildOverviewTool(
  context: DashboardRequestContext,
  _message: string
): Promise<AgentToolResult> {
  void _message
  const slice = await loadOverviewSlice(context)
  const totals = slice.selectedRange.totals
  const customerMix = slice.selectedRange.overviewRows.reduce(
    (accumulator, row) => {
      accumulator.newCustomers += row.newCustomers
      accumulator.returningCustomers += row.returningCustomers
      return accumulator
    },
    {
      newCustomers: 0,
      returningCustomers: 0,
    }
  )
  const comparisonCustomerMix = slice.selectedRange.comparisonRows.reduce(
    (accumulator, row) => {
      accumulator.newCustomers += row.newCustomers
      accumulator.returningCustomers += row.returningCustomers
      return accumulator
    },
    {
      newCustomers: 0,
      returningCustomers: 0,
    }
  )

  const topChannels = compactRows(
    slice.selectedRange.channelSummary,
    TOOL_PAYLOAD_CAPS.paidMediaChannels
  )
  const topProducts = compactRows(
    slice.selectedRange.topProducts,
    TOOL_PAYLOAD_CAPS.productTopRows
  )

  return withEvidence(
    {
      data: {
        comparisonTotals: slice.selectedRange.comparisonTotals,
        comparisonCustomerMix,
        currency: slice.settings.currency,
        customerMix,
        dateRange: slice.selectedRange.range,
        emailSnapshot: slice.selectedRange.emailSnapshot,
        snapshotRows: slice.snapshotRows,
        topChannels,
        topProducts,
        totals,
      },
      label: "Overview summary",
      name: "overview_summary",
      summary: `Revenue ${totals.revenue.toFixed(2)}, net profit ${totals.netProfit.toFixed(2)}, ad spend ${totals.adSpend.toFixed(2)}, MER ${totals.mer.toFixed(2)}.`,
    },
    {
      caveats: [
        slice.selectedRange.comparisonTotals
          ? null
          : "Comparison totals unavailable in selected scope.",
      ].filter((entry): entry is string => Boolean(entry)),
      kpis: {
        adSpend: roundNumber(totals.adSpend, 2),
        mer: roundNumber(totals.mer, 2),
        netProfit: roundNumber(totals.netProfit, 2),
        revenue: roundNumber(totals.revenue, 2),
      },
      range: slice.selectedRange.range,
      topDrivers: summarizeTopDrivers({
        rows: topChannels,
        cap: 3,
        label: (row) => String(row.platform ?? "Unknown"),
        score: (row) => asFiniteNumber((row as { revenue?: number }).revenue),
      }),
    }
  )
}

async function buildPaidMediaTool(
  context: DashboardRequestContext,
  _message: string
): Promise<AgentToolResult> {
  void _message
  const slice = await loadPaidMediaSlice(context)
  const totals = slice.currentRange.totals
  const channelSummary = compactRows(
    slice.currentRange.channelSummary,
    TOOL_PAYLOAD_CAPS.paidMediaChannels
  )
  const topCampaigns = compactRows(
    slice.currentRange.campaignRows,
    TOOL_PAYLOAD_CAPS.paidMediaCampaigns
  ).map((campaign) => ({
    ...campaign,
    daily: compactRows(campaign.daily, TOOL_PAYLOAD_CAPS.paidMediaCampaignDaily),
  }))

  return withEvidence(
    {
      data: {
        channelSummary,
        comparison: slice.comparison?.totals ?? null,
        profitProxyModel: slice.profitProxyModel,
        range: slice.currentRange.range,
        topCampaigns,
        totals,
      },
      label: "Paid media performance",
      name: "paid_media_summary",
      summary: `Spend ${totals.spend.toFixed(2)}, attributed revenue ${totals.attributedRevenue.toFixed(2)}, ROAS ${totals.roas.toFixed(2)}, CPA ${totals.cpa.toFixed(2)}, impressions ${totals.impressions.toFixed(0)}.`,
    },
    {
      caveats: [
        slice.comparison ? null : "Comparison window unavailable for paid media.",
        slice.profitProxyModel.confidence === "high"
          ? null
          : `Profit proxy confidence is ${slice.profitProxyModel.confidence}.`,
      ].filter((entry): entry is string => Boolean(entry)),
      kpis: {
        attributedRevenue: roundNumber(totals.attributedRevenue, 2),
        clicks: roundNumber(totals.clicks, 0),
        cpa: roundNumber(totals.cpa, 2),
        cpm: roundNumber(totals.cpm, 2),
        ctr: roundNumber(totals.ctr, 2),
        impressions: roundNumber(totals.impressions, 0),
        roas: roundNumber(totals.roas, 2),
        spend: roundNumber(totals.spend, 2),
      },
      range: slice.currentRange.range,
      topDrivers: summarizeTopDrivers({
        rows: channelSummary,
        cap: 3,
        label: (row) => String(row.platform ?? "Unknown"),
        score: (row) =>
          asFiniteNumber((row as { attributedRevenue?: number }).attributedRevenue),
      }),
    }
  )
}

async function buildTrafficConversionTool(
  context: DashboardRequestContext,
  _message: string
): Promise<AgentToolResult> {
  void _message
  const slice = await loadShopifyFunnelSlice(context)
  const cappedDaily = compactRows(
    slice.currentRange.daily,
    TOOL_PAYLOAD_CAPS.funnelDailyRows
  )
  const cappedBreakdowns = Object.fromEntries(
    Object.entries(slice.currentRange.breakdowns).map(([dimension, rows]) => [
      dimension,
      compactRows(rows, TOOL_PAYLOAD_CAPS.funnelBreakdownRows),
    ])
  )
  const cappedProductBreakdown = {
    ...slice.currentRange.productBreakdown,
    rowsByGroup: {
      ...slice.currentRange.productBreakdown.rowsByGroup,
      product: compactRows(
        slice.currentRange.productBreakdown.rowsByGroup.product,
        TOOL_PAYLOAD_CAPS.funnelProductRows
      ),
      sku: compactRows(
        slice.currentRange.productBreakdown.rowsByGroup.sku,
        TOOL_PAYLOAD_CAPS.funnelProductRows
      ),
    },
  }

  return withEvidence(
    {
      data: {
        comparison: slice.comparison
          ? {
              ...slice.comparison,
              daily: compactRows(
                slice.comparison.daily,
                TOOL_PAYLOAD_CAPS.funnelDailyRows
              ),
            }
          : null,
        currency: slice.settings.currency,
        currentRange: {
          breakdowns: cappedBreakdowns,
          daily: cappedDaily,
          kpis: slice.currentRange.kpis,
          latestAvailableDate: slice.currentRange.latestAvailableDate,
          productBreakdown: cappedProductBreakdown,
          range: slice.currentRange.range,
          stageCountSource: slice.currentRange.stageCountSource,
        },
      },
      label: "Traffic and conversion",
      name: "traffic_conversion",
      summary: `Sessions ${slice.currentRange.kpis.sessions.toFixed(0)}, purchase conversion ${slice.currentRange.kpis.purchaseConversionRate.toFixed(2)}%, orders ${slice.currentRange.kpis.orders.toFixed(0)}.`,
    },
    {
      caveats: [
        slice.comparison ? null : "Comparison range unavailable for funnel KPIs.",
        slice.currentRange.stageCountSource === "shopify_totals"
          ? null
          : `Stage counts sourced from ${slice.currentRange.stageCountSource}.`,
      ].filter((entry): entry is string => Boolean(entry)),
      kpis: {
        orders: roundNumber(slice.currentRange.kpis.orders, 0),
        purchaseConversionRate: roundNumber(
          slice.currentRange.kpis.purchaseConversionRate,
          2
        ),
        sessions: roundNumber(slice.currentRange.kpis.sessions, 0),
      },
      range: slice.currentRange.range,
      topDrivers: summarizeTopDrivers({
        rows: cappedBreakdowns.channel ?? [],
        cap: 3,
        label: (row) => String((row as { label?: string }).label ?? "Unknown"),
        score: (row) => asFiniteNumber((row as { sessions?: number }).sessions),
      }),
    }
  )
}

async function buildInventoryTool(
  context: DashboardRequestContext,
  _message: string
): Promise<AgentToolResult> {
  void _message
  const slice = await loadShopifyInventorySlice(context)
  const flaggedRows = slice.rows.filter(
    (row) => row.status === "at_risk" || row.status === "out_of_stock"
  )

  const cappedRows = compactRows(flaggedRows, TOOL_PAYLOAD_CAPS.inventoryRows)

  return withEvidence(
    {
      data: {
        kpis: slice.kpis,
        latestSnapshotDate: slice.selectedRange.latestSnapshotDate,
        rows: cappedRows,
        velocity: slice.velocity,
      },
      label: "Inventory risk",
      name: "inventory_risk",
      summary: `${slice.kpis.atRiskVariants} at-risk variants and ${slice.kpis.outOfStockVariants} out of stock from ${slice.kpis.trackedVariants} tracked variants.`,
    },
    {
      caveats: [
        slice.selectedRange.usedRangeFallback
          ? "Latest snapshot fell back outside requested date range."
          : null,
      ].filter((entry): entry is string => Boolean(entry)),
      kpis: {
        atRiskVariants: roundNumber(slice.kpis.atRiskVariants, 0),
        outOfStockVariants: roundNumber(slice.kpis.outOfStockVariants, 0),
        trackedVariants: roundNumber(slice.kpis.trackedVariants, 0),
      },
      range: slice.selectedRange.range,
      topDrivers: summarizeTopDrivers({
        rows: cappedRows,
        cap: 3,
        label: (row) => String((row as { product?: string }).product ?? "Unknown"),
        score: (row) => {
          const status = String((row as { status?: string }).status ?? "")
          const riskWeight = status === "out_of_stock" ? 2 : status === "at_risk" ? 1 : 0
          const velocity = asFiniteNumber(
            (row as { velocity?: { 30?: { sold?: number } } }).velocity?.[30]?.sold
          )
          return riskWeight * 1000 + velocity
        },
      }),
    }
  )
}

async function buildProductsTool(
  context: DashboardRequestContext,
  message: string
): Promise<AgentToolResult> {
  const comparisonRange = getComparisonRange(
    context.from,
    context.to,
    context.compare
  )
  const [slice, comparisonSlice] = await Promise.all([
    loadShopifyProductsSlice(context),
    comparisonRange
      ? loadShopifyProductsSlice({
          ...context,
          from: comparisonRange.from,
          to: comparisonRange.to,
        })
      : Promise.resolve(null),
  ])
  const topProducts = compactRows(
    slice.currentRange.breakdowns.product,
    TOOL_PAYLOAD_CAPS.productTopRows
  )
  const matchTokens = keywordList(message).filter((token) => {
    return (
      token.length >= 3 &&
      !PRODUCT_MATCH_STOP_WORDS.has(token) &&
      !/^\d+$/.test(token)
    )
  })
  const matchingProducts = slice.currentRange.breakdowns.product
    .filter((row) => {
      if (matchTokens.length === 0) {
        return false
      }

      const normalizedProduct = row.product.toLowerCase()
      return matchTokens.every((token) =>
        productNameIncludesToken(normalizedProduct, token)
      )
    })
    .slice(0, TOOL_PAYLOAD_CAPS.productMatchingRows)
  const matchSummary = matchingProducts[0]

  return withEvidence(
    {
      data: {
        availableTags: compactRows(
          slice.currentRange.availableTags,
          TOOL_PAYLOAD_CAPS.productTags
        ),
        comparisonKpis: comparisonSlice?.currentRange.kpis ?? null,
        comparisonTopProducts: comparisonSlice
          ? compactRows(
              comparisonSlice.currentRange.breakdowns.product,
              TOOL_PAYLOAD_CAPS.productComparisonRows
            )
          : [],
        currency: slice.settings.currency,
        kpis: slice.currentRange.kpis,
        matchingProducts,
        matchTokens: compactRows(matchTokens, 10),
        topProducts,
        velocityWindows: slice.velocityWindows,
      },
      label: "Product performance",
      name: "product_performance",
      summary: matchSummary
        ? `Matched ${matchingProducts.length} product rows. Top match ${matchSummary.product} sold ${matchSummary.qtySold.toFixed(0)} units for ${matchSummary.totalSales.toFixed(2)}.`
        : `Sales ${slice.currentRange.kpis.totalSales.toFixed(2)}, units ${slice.currentRange.kpis.unitsSold.toFixed(0)}, gross profit ${slice.currentRange.kpis.grossProfit.toFixed(2)}.`,
    },
    {
      caveats: [
        comparisonSlice ? null : "Comparison slice unavailable for product diagnostics.",
        matchTokens.length > 0 && matchingProducts.length === 0
          ? "No product names matched all extracted query tokens."
          : null,
      ].filter((entry): entry is string => Boolean(entry)),
      kpis: {
        grossProfit: roundNumber(slice.currentRange.kpis.grossProfit, 2),
        totalSales: roundNumber(slice.currentRange.kpis.totalSales, 2),
        unitsSold: roundNumber(slice.currentRange.kpis.unitsSold, 0),
      },
      range: slice.currentRange.range,
      topDrivers: summarizeTopDrivers({
        rows: matchingProducts.length > 0 ? matchingProducts : topProducts,
        cap: 3,
        label: (row) => String((row as { product?: string }).product ?? "Unknown"),
        score: (row) => asFiniteNumber((row as { totalSales?: number }).totalSales),
      }),
    }
  )
}

async function buildEmailTool(
  context: DashboardRequestContext,
  _message: string
): Promise<AgentToolResult> {
  void _message
  const slice = await loadEmailSlice(context)
  const campaigns = compactRows(
    slice.currentRange.campaigns,
    TOOL_PAYLOAD_CAPS.emailCampaigns
  )
  const flows = compactRows(slice.currentRange.flows, TOOL_PAYLOAD_CAPS.emailFlows).map(
    (flow) => ({
      ...flow,
      sequenceSteps: compactRows(
        flow.sequenceSteps,
        TOOL_PAYLOAD_CAPS.emailFlowSteps
      ),
    })
  )

  return withEvidence(
    {
      data: {
        campaigns,
        comparison: slice.comparison?.kpis ?? null,
        flows,
        kpis: slice.currentRange.kpis,
        range: slice.currentRange.range,
      },
      label: "Email performance",
      name: "email_performance",
      summary: `Email revenue ${slice.currentRange.kpis.revenue.toFixed(2)}, sends ${slice.currentRange.kpis.sends.toFixed(0)}, open rate ${slice.currentRange.kpis.openRate.toFixed(1)}%, click rate ${slice.currentRange.kpis.clickRate.toFixed(1)}%.`,
    },
    {
      caveats: [
        slice.comparison ? null : "Comparison KPIs unavailable for email.",
        slice.settings.flowSequence.available
          ? null
          : String(slice.settings.flowSequence.reason),
      ].filter((entry): entry is string => Boolean(entry)),
      kpis: {
        clickRate: roundNumber(slice.currentRange.kpis.clickRate, 2),
        openRate: roundNumber(slice.currentRange.kpis.openRate, 2),
        revenue: roundNumber(slice.currentRange.kpis.revenue, 2),
        sends: roundNumber(slice.currentRange.kpis.sends, 0),
        // unsubscribes: not available on EmailKpiTotals — only in per-row seed; omitted
      },
      range: slice.currentRange.range,
      topDrivers: summarizeTopDrivers({
        rows: campaigns,
        cap: 3,
        label: (row) => String((row as { campaignName?: string }).campaignName ?? ""),
        score: (row) => asFiniteNumber((row as { revenue?: number }).revenue),
      }),
    }
  )
}

async function buildFreshnessTool(
  context: DashboardRequestContext,
  _message: string
): Promise<AgentToolResult> {
  void _message
  const slice = await loadSettingsSlice(context)
  const recentJobs = compactRows(
    slice.syncs.recentJobRuns,
    TOOL_PAYLOAD_CAPS.freshnessJobs
  )
  const recentBackfills = compactRows(
    slice.syncs.recentBackfillRuns,
    TOOL_PAYLOAD_CAPS.freshnessBackfills
  )
  const syncState = compactRows(
    slice.syncs.syncState,
    TOOL_PAYLOAD_CAPS.freshnessSyncState
  )

  return withEvidence(
    {
      data: {
        recentBackfills,
        recentJobs,
        syncState,
        tokenStatus: slice.workspace.tokens,
      },
      label: "Data freshness",
      name: "data_freshness",
      summary: `${slice.syncs.recentJobRuns.length} recent jobs, ${slice.syncs.recentBackfillRuns.length} recent backfills, ${slice.syncs.syncState.length} sync-state rows in scope.`,
    },
    {
      caveats: [
        slice.workspace.tokens.length === 0 ? "No connector token status rows found." : null,
      ].filter((entry): entry is string => Boolean(entry)),
      kpis: {
        recentBackfills: roundNumber(slice.syncs.recentBackfillRuns.length, 0),
        recentJobs: roundNumber(slice.syncs.recentJobRuns.length, 0),
        syncStateRows: roundNumber(slice.syncs.syncState.length, 0),
      },
      range: {
        from: context.from,
        to: context.to,
      },
      topDrivers: summarizeTopDrivers({
        rows: recentJobs,
        cap: 3,
        label: (row) => String((row as { jobName?: string }).jobName ?? "job"),
        score: (row) => asFiniteNumber((row as { durationMs?: number }).durationMs),
      }),
    }
  )
}

async function buildCreativePerformanceTool(
  context: DashboardRequestContext,
  _message: string
): Promise<AgentToolResult> {
  void _message
  const slice = await loadCreativeSlice(context)
  const topRows = compactRows(
    slice.currentRange.rows,
    TOOL_PAYLOAD_CAPS.creativeRows
  )
  const totals = slice.currentRange.totals

  return withEvidence(
    {
      data: {
        comparison: slice.comparison?.totals ?? null,
        currency: slice.settings.currency,
        range: slice.currentRange.range,
        topCreatives: topRows,
        totals,
      },
      label: "Creative performance",
      name: "creative_performance",
      summary: `${topRows.length} creatives returned. Total spend ${totals.spend.toFixed(2)}, ROAS ${totals.roas.toFixed(2)}.`,
    },
    {
      caveats: topRows.length === 0
        ? ["No creative data found for selected date range."]
        : [],
      kpis: {
        roas: roundNumber(totals.roas, 2),
        spend: roundNumber(totals.spend, 2),
        revenue: roundNumber(totals.revenue, 2),
        impressions: roundNumber(totals.impressions, 0),
      },
      range: slice.currentRange.range,
      topDrivers: summarizeTopDrivers({
        rows: topRows,
        cap: 3,
        label: (row) =>
          String(
            (row as { headline?: string }).headline ||
            (row as { adName?: string }).adName ||
            "Unknown"
          ),
        score: (row) => asFiniteNumber((row as { roas?: number }).roas),
      }),
    }
  )
}

async function buildAnomalyTool(
  context: DashboardRequestContext,
  _message: string
): Promise<AgentToolResult> {
  void _message
  const anomalyScan = await buildAnomalyScan(context)
  const coverage = compactRows(anomalyScan.coverage, TOOL_PAYLOAD_CAPS.anomalyCoverage)
  const signals = compactRows(anomalyScan.signals, TOOL_PAYLOAD_CAPS.anomalySignals)

  return withEvidence(
    {
      data: {
        ...anomalyScan,
        coverage,
        signals,
      } as unknown as Record<string, unknown>,
      label: "Anomaly scan",
      name: "anomaly_scan",
      summary: anomalyScan.summary,
    },
    {
      caveats: coverage
        .filter((row) => row.status !== "clear")
        .map((row) => `${row.label}: ${row.status}`),
      kpis: {
        signalCount: roundNumber(anomalyScan.signalCount, 0),
      },
      range: {
        from: context.from,
        to: context.to,
      },
      topDrivers: summarizeTopDrivers({
        rows: signals,
        cap: 3,
        label: (row) => String((row as { title?: string }).title ?? ""),
        score: (row) =>
          Math.abs(
            asFiniteNumber((row as { metricDeltaPct?: number }).metricDeltaPct)
          ) +
          Math.abs(asFiniteNumber((row as { zScore?: number }).zScore)),
      }),
    }
  )
}

async function buildAdSegmentsTool(
  context: DashboardRequestContext,
  _message: string
): Promise<AgentToolResult> {
  void _message
  const slice = await loadAdSegmentsSlice(context)
  const byCountry = compactRows(slice.byCountry, TOOL_PAYLOAD_CAPS.segmentCountry)
  const byDevice = compactRows(slice.byDevice, TOOL_PAYLOAD_CAPS.segmentDevice)
  const byAudience = compactRows(slice.byAudience, TOOL_PAYLOAD_CAPS.segmentAudience)
  const { kpis } = slice

  return withEvidence(
    {
      data: {
        byAudience,
        byCountry,
        byDevice,
        kpis,
        range: slice.range,
      },
      label: "Ad segment breakdown",
      name: "ad_segments",
      summary: `${byCountry.length} countries, ${byDevice.length} devices, ${byAudience.length} audience segments. Total spend ${kpis.totalSpend.toFixed(2)}, blended ROAS ${kpis.blendedRoas.toFixed(2)}.`,
    },
    {
      caveats:
        byCountry.length === 0 && byDevice.length === 0
          ? ["No segment data found for selected date range."]
          : [],
      kpis: {
        blendedRoas: roundNumber(kpis.blendedRoas, 2),
        totalImpressions: roundNumber(kpis.totalImpressions, 0),
        totalRevenue: roundNumber(kpis.totalRevenue, 2),
        totalSpend: roundNumber(kpis.totalSpend, 2),
        // totalClicks, cpm, ctr: not on kpis aggregate in the loader — per-segment rows have ctr
      },
      range: slice.range,
      topDrivers: summarizeTopDrivers({
        rows: byCountry,
        cap: 3,
        label: (row) => String((row as { value?: string }).value ?? "Unknown"),
        score: (row) => asFiniteNumber((row as { spend?: number }).spend),
      }),
    }
  )
}

async function buildOrderAnalysisTool(
  context: DashboardRequestContext,
  _message: string
): Promise<AgentToolResult> {
  void _message
  const slice = await loadOrderAnalysisSlice(context)
  const byUtmSource = compactRows(slice.byUtmSource, TOOL_PAYLOAD_CAPS.orderUtmSource)
  const bySource = compactRows(slice.bySource, TOOL_PAYLOAD_CAPS.orderSource)
  const byCountry = compactRows(slice.byCountry, TOOL_PAYLOAD_CAPS.orderCountry)
  const { kpis } = slice

  return withEvidence(
    {
      data: {
        byCountry,
        bySource,
        byUtmSource,
        kpis,
        range: slice.range,
      },
      label: "Order analysis",
      name: "order_analysis",
      summary: `${kpis.totalOrders} orders. New customer rate ${(kpis.newCustomerRate * 100).toFixed(1)}%, AOV ${kpis.aov.toFixed(2)}, total revenue ${kpis.totalRevenue.toFixed(2)}.`,
    },
    {
      caveats:
        kpis.totalOrders === 0
          ? ["No order data found for selected date range."]
          : [],
      kpis: {
        aov: roundNumber(kpis.aov, 2),
        newCustomerRate: roundNumber(kpis.newCustomerRate, 4),
        totalOrders: roundNumber(kpis.totalOrders, 0),
        totalRevenue: roundNumber(kpis.totalRevenue, 2),
      },
      range: slice.range,
      topDrivers: summarizeTopDrivers({
        rows: byUtmSource,
        cap: 3,
        label: (row) => String((row as { value?: string }).value ?? "Unknown"),
        score: (row) =>
          asFiniteNumber((row as { totalRevenue?: number }).totalRevenue),
      }),
    }
  )
}

async function buildBudgetVsActualTool(
  context: DashboardRequestContext,
  _message: string
): Promise<AgentToolResult> {
  void _message
  const slice = await loadBudgetVsActualSlice(context)
  const channels = compactRows(slice.channels, TOOL_PAYLOAD_CAPS.budgetChannels)
  const { totals } = slice

  return withEvidence(
    {
      data: {
        channels,
        range: slice.range,
        totals,
      },
      label: "Budget vs actual",
      name: "budget_vs_actual",
      summary: `${channels.length} channels. Total budgeted ${totals.budgetedAmount.toFixed(2)}, actual spend ${totals.actualSpend.toFixed(2)}, pace ${totals.pacePercent.toFixed(1)}%.`,
    },
    {
      caveats: (() => {
        const c: string[] = []
        if (totals.budgetedAmount === 0) {
          c.push("No budget plan found for the selected period. Set up budgets in Settings.")
        }
        if (totals.actualSpend === 0) {
          c.push("No actual spend data found for the selected date range.")
        }
        return c
      })(),
      kpis: {
        actualSpend: roundNumber(totals.actualSpend, 2),
        budgetedAmount: roundNumber(totals.budgetedAmount, 2),
        pacePercent: roundNumber(totals.pacePercent, 1),
        remainingBudget: roundNumber(totals.remainingBudget, 2),
      },
      range: slice.range,
      topDrivers: summarizeTopDrivers({
        rows: channels,
        cap: 3,
        label: (row) => String((row as { channel?: string }).channel ?? "Unknown"),
        score: (row) => asFiniteNumber((row as { actualSpend?: number }).actualSpend),
      }),
    }
  )
}

async function buildCustomerCohortsTool(
  context: DashboardRequestContext,
  _message: string
): Promise<AgentToolResult> {
  void _message
  const slice = await loadCustomerCohortsSlice(context)
  const recentCohorts = compactRows(slice.acquisitionByMonth, TOOL_PAYLOAD_CAPS.cohortRows)
  const { totals } = slice

  return withEvidence(
    {
      data: {
        acquisitionByMonth: recentCohorts,
        retentionCurve: slice.retentionCurve,
        range: slice.range,
        totals,
      },
      label: "Customer cohorts",
      name: "customer_cohorts",
      summary: `${totals.totalNewCustomers} new customers across ${recentCohorts.length} cohort months. Avg LTV: 3mo ${totals.avgLtv3Month.toFixed(2)}, 6mo ${totals.avgLtv6Month.toFixed(2)}, 12mo ${totals.avgLtv12Month.toFixed(2)}.`,
    },
    {
      caveats: (() => {
        const c: string[] = []
        if (totals.totalNewCustomers === 0) {
          c.push("No cohort data found. Run a daily reconcile to populate customer cohorts.")
        }
        if (totals.avgLtv6Month === 0) {
          c.push("LTV estimates require at least 6 months of post-acquisition order history.")
        }
        return c
      })(),
      kpis: {
        avgLtv12Month: roundNumber(totals.avgLtv12Month, 2),
        avgLtv3Month: roundNumber(totals.avgLtv3Month, 2),
        avgLtv6Month: roundNumber(totals.avgLtv6Month, 2),
        totalNewCustomers: roundNumber(totals.totalNewCustomers, 0),
      },
      range: slice.range,
      topDrivers: summarizeTopDrivers({
        rows: recentCohorts,
        cap: 3,
        label: (row) => String((row as { cohortMonth?: string }).cohortMonth ?? ""),
        score: (row) => asFiniteNumber((row as { newCustomers?: number }).newCustomers),
      }),
    }
  )
}

const TOOL_BUILDERS: Record<
  AgentToolName,
  (
    context: DashboardRequestContext,
    message: string
  ) => Promise<AgentToolResult>
> = {
  ad_performance: buildAdPerformanceTool,
  ad_segments: buildAdSegmentsTool,
  anomaly_scan: buildAnomalyTool,
  budget_vs_actual: buildBudgetVsActualTool,
  creative_performance: buildCreativePerformanceTool,
  customer_cohorts: buildCustomerCohortsTool,
  data_freshness: buildFreshnessTool,
  email_performance: buildEmailTool,
  inventory_risk: buildInventoryTool,
  order_analysis: buildOrderAnalysisTool,
  overview_summary: buildOverviewTool,
  paid_media_summary: buildPaidMediaTool,
  product_performance: buildProductsTool,
  traffic_conversion: buildTrafficConversionTool,
}

export async function getRelevantAgentTools(
  message: string,
  options?: { llmSelector?: (message: string) => Promise<AgentToolName[]> }
): Promise<AgentToolName[]> {
  if (options?.llmSelector) {
    try {
      const llmResult = await options.llmSelector(message)
      if (llmResult.length > 0) {
        return llmResult
      }
    } catch {
      // LLM selector failed — fall through to keyword routing
    }
  }

  const terms = keywordSet(message)
  const normalized = message.toLowerCase()
  const selected = new Set<AgentToolName>()

  if (hasAnyTerm(terms, PAID_MEDIA_TERMS)) {
    selected.add("paid_media_summary")
  }

  if (hasAnyTerm(terms, AD_PERF_TERMS)) {
    selected.add("ad_performance")
  }

  if (/\b(best ad|top ad|worst ad|which ad|what ad|hook rate|video view)\b/.test(normalized)) {
    selected.add("ad_performance")
  }

  if (hasAnyTerm(terms, CREATIVE_TERMS)) {
    selected.add("creative_performance")
  }

  if (/\b(winning creative|top creative|best creative|worst creative|creative analysis|ad creative)\b/.test(normalized)) {
    selected.add("creative_performance")
  }

  if (hasAnyTerm(terms, SEGMENT_TERMS)) {
    selected.add("ad_segments")
  }

  if (/\b(by country|by device|by audience|uk vs us|us vs uk|mobile vs desktop|desktop vs mobile|geo breakdown|audience breakdown)\b/.test(normalized)) {
    selected.add("ad_segments")
  }

  if (hasAnyTerm(terms, ORDER_TERMS)) {
    selected.add("order_analysis")
  }

  if (/\b(new customer|returning customer|utm source|by channel|by source|order breakdown|acquisition channel|first.?time buyer)\b/.test(normalized)) {
    selected.add("order_analysis")
  }

  if (hasAnyTerm(terms, BUDGET_TERMS)) {
    selected.add("budget_vs_actual")
  }

  if (/\b(on track|over budget|under budget|month.?end|pacing|budget check|spend forecast)\b/.test(normalized)) {
    selected.add("budget_vs_actual")
  }

  if (hasAnyTerm(terms, COHORT_TERMS)) {
    selected.add("customer_cohorts")
  }

  if (/\b(payback period|acquisition cost|returning customer revenue|repeat purchase|repeat rate|90.?day ltv|customer value)\b/.test(normalized)) {
    selected.add("customer_cohorts")
  }

  if (hasAnyTerm(terms, INVENTORY_TERMS)) {
    selected.add("inventory_risk")
    selected.add("product_performance")
  }

  if (hasAnyTerm(terms, PRODUCT_TERMS)) {
    selected.add("product_performance")
  }

  if (hasAnyTerm(terms, TRAFFIC_CONVERSION_TERMS)) {
    selected.add("traffic_conversion")
  }

  if (/\b(how many|how much|did we sell|units sold)\b/.test(normalized)) {
    selected.add("product_performance")
  }

  if (hasAnyTerm(terms, EMAIL_TERMS)) {
    selected.add("email_performance")
  }

  if (hasAnyTerm(terms, FRESHNESS_TERMS)) {
    selected.add("data_freshness")
  }

  if (selected.size === 0 && hasAnyTerm(terms, OVERVIEW_TERMS)) {
    selected.add("overview_summary")
  }

  if (
    normalized.includes("anomal") ||
    normalized.includes("diagnostic") ||
    normalized.includes("diagnose")
  ) {
    selected.add("anomaly_scan")
  }

  return Array.from(selected).slice(0, AGENT_MAX_TOOL_COUNT)
}

export async function runAgentTools(input: {
  context: DashboardRequestContext
  message: string
  toolNames: AgentToolName[]
}) {
  return Promise.all(
    input.toolNames.map((toolName) =>
      TOOL_BUILDERS[toolName](input.context, input.message)
    )
  )
}

export async function getAgentDataset(input: {
  dataset: string
  context: DashboardRequestContext
}) {
  switch (input.dataset) {
    case "overview_slice":
      return applyDatasetRowLimit(await loadOverviewSlice(input.context))
    case "shopify_funnel_slice":
      return applyDatasetRowLimit(await loadShopifyFunnelSlice(input.context))
    case "paid_media_slice":
      return applyDatasetRowLimit(await loadPaidMediaSlice(input.context))
    case "shopify_inventory_slice":
      return applyDatasetRowLimit(await loadShopifyInventorySlice(input.context))
    case "shopify_products_slice":
      return applyDatasetRowLimit(await loadShopifyProductsSlice(input.context))
    case "email_slice":
      return applyDatasetRowLimit(await loadEmailSlice(input.context))
    case "settings_slice":
      return applyDatasetRowLimit(await loadSettingsSlice(input.context))
    default:
      throw new Error(`Unknown dataset "${input.dataset}".`)
  }
}
