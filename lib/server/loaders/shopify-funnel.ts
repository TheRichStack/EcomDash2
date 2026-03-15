import "server-only"

import { env } from "@/lib/env"
import { queryRows, selectRowsFromTable } from "@/lib/db/query"
import {
  parseFactOrder,
  parseRawGa4ProductFunnel,
  parseRawShopifyAnalyticsBreakdown,
  parseRawShopifyAnalyticsDaily,
  parseRawShopifyAnalyticsTotals,
} from "@/lib/db/record-parsers"
import { getComparisonRange } from "@/lib/server/date-ranges"
import type {
  FactOrder,
  LoaderRange,
  RawGa4ProductFunnel,
  RawShopifyAnalyticsBreakdown,
  RawShopifyAnalyticsDaily,
  RawShopifyAnalyticsTotals,
  ShopifyFunnelBreakdownDimension,
  ShopifyFunnelBreakdownRow,
  ShopifyFunnelDailyPoint,
  ShopifyFunnelKpiTotals,
  ShopifyFunnelProductBreakdown,
  ShopifyFunnelProductBreakdownGroup,
  ShopifyFunnelProductBreakdownRow,
  ShopifyFunnelSliceData,
  ShopifyFunnelStageSource,
  ShopifyFunnelStageSummary,
} from "@/types/backend"
import type { DashboardRequestContext } from "@/types/dashboard"
import type { EcomDashMetricId } from "@/types/metrics"

type StageMetricKey = "sessions" | "addToCart" | "checkout" | "purchase"

type StageCounts = Record<StageMetricKey, number>

type DailyAggregation = {
  daily: ShopifyFunnelDailyPoint[]
  totals: StageCounts
  latestAvailableDate: string | null
}

type RangeView = {
  kpis: ShopifyFunnelKpiTotals
  stages: ShopifyFunnelStageSummary[]
  daily: ShopifyFunnelDailyPoint[]
  latestAvailableDate: string | null
  stageCountSource: ShopifyFunnelStageSource
}

type ShopifySkuLookupRow = {
  sku: string
  productName: string
  variantName: string
}

type ShopifySkuMetadata = {
  productName: string
  variantName: string
}

type ProductFunnelBaseItem = {
  key: string
  product: string
  sku: string
  views: number
  addToCart: number
  checkout: number
  purchase: number
}

const SHOPIFY_FUNNEL_KPI_METRIC_IDS = [
  "sessions",
  "add_to_cart_rate",
  "checkout_rate",
  "purchase_conversion_rate",
  "orders_count",
  "shopify_net_revenue",
] as const satisfies readonly EcomDashMetricId[]

const BREAKDOWN_CONFIG = {
  channel: {
    breakdownId: "funnel_daily_by_channel",
  },
  device: {
    breakdownId: "funnel_daily_by_device",
  },
  customer_type: {
    breakdownId: "funnel_daily_by_customer_type",
  },
  country: {
    breakdownId: "funnel_daily_by_country",
  },
} as const satisfies Record<
  ShopifyFunnelBreakdownDimension,
  { breakdownId: string }
>

function emptyStageCounts(): StageCounts {
  return {
    sessions: 0,
    addToCart: 0,
    checkout: 0,
    purchase: 0,
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

function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function buildDateSequence(from: string, to: string) {
  const dates: string[] = []
  const end = parseIsoDate(to)

  for (
    let cursor = parseIsoDate(from);
    cursor.getTime() <= end.getTime();
    cursor = addUtcDays(cursor, 1)
  ) {
    dates.push(toIsoDate(cursor))
  }

  return dates
}

function safePercent(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0
  }

  return (numerator / denominator) * 100
}

function safePercentOrNull(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null
  }

  return (numerator / denominator) * 100
}

function maxIsoDate(...values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .reduce<string | null>(
      (latest, value) => (latest === null || value > latest ? value : latest),
      null
    )
}

function normalizeLookupToken(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function daysBetweenInclusive(range: LoaderRange) {
  const start = parseIsoDate(range.from).getTime()
  const end = parseIsoDate(range.to).getTime()

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0
  }

  return Math.round((end - start) / 86400000) + 1
}

function overlapDays(left: LoaderRange, right: LoaderRange) {
  const from = left.from > right.from ? left.from : right.from
  const to = left.to < right.to ? left.to : right.to

  if (from > to) {
    return 0
  }

  return daysBetweenInclusive({ from, to })
}

function normalizeStageMetric(metric: string): StageMetricKey | null {
  const normalized = String(metric ?? "").trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (normalized === "sessions" || normalized === "online_store_sessions") {
    return "sessions"
  }

  if (
    normalized === "add_to_carts" ||
    normalized === "added_to_carts" ||
    normalized === "addtocarts"
  ) {
    return "addToCart"
  }

  if (normalized === "checkouts" || normalized === "reached_checkout") {
    return "checkout"
  }

  if (normalized === "purchases" || normalized === "orders") {
    return "purchase"
  }

  return null
}

function buildDailyAggregation(input: {
  range: LoaderRange
  rows: RawShopifyAnalyticsDaily[]
}): DailyAggregation {
  const latestByDateMetric = new Map<string, RawShopifyAnalyticsDaily>()
  let latestAvailableDate: string | null = null

  for (const row of input.rows) {
    const stageMetric = normalizeStageMetric(row.metric)

    if (!stageMetric || row.date < input.range.from || row.date > input.range.to) {
      continue
    }

    const existing = latestByDateMetric.get(`${row.date}::${stageMetric}`)

    if (!existing || row.syncedAt >= existing.syncedAt) {
      latestByDateMetric.set(`${row.date}::${stageMetric}`, row)
    }

    if (latestAvailableDate === null || row.date > latestAvailableDate) {
      latestAvailableDate = row.date
    }
  }

  if (!latestAvailableDate) {
    return {
      daily: [],
      totals: emptyStageCounts(),
      latestAvailableDate: null,
    }
  }

  const countsByDate = new Map<string, StageCounts>()

  for (const row of latestByDateMetric.values()) {
    const stageMetric = normalizeStageMetric(row.metric)

    if (!stageMetric) {
      continue
    }

    const current = countsByDate.get(row.date) ?? emptyStageCounts()
    current[stageMetric] += row.valueNum
    countsByDate.set(row.date, current)
  }

  const totals = emptyStageCounts()
  const daily = buildDateSequence(input.range.from, latestAvailableDate).map((date) => {
    const counts = countsByDate.get(date) ?? emptyStageCounts()

    totals.sessions += counts.sessions
    totals.addToCart += counts.addToCart
    totals.checkout += counts.checkout
    totals.purchase += counts.purchase

    return {
      date,
      sessions: counts.sessions,
      addToCart: counts.addToCart,
      checkout: counts.checkout,
      purchase: counts.purchase,
      addToCartRate: safePercent(counts.addToCart, counts.sessions),
      checkoutRate: safePercent(counts.checkout, counts.sessions),
      purchaseRate: safePercent(counts.purchase, counts.sessions),
    }
  })

  return {
    daily,
    totals,
    latestAvailableDate,
  }
}

function buildExactTotalMap(rows: RawShopifyAnalyticsTotals[]) {
  const latestByMetric = new Map<StageMetricKey, RawShopifyAnalyticsTotals>()

  for (const row of rows) {
    const stageMetric = normalizeStageMetric(row.metric)

    if (!stageMetric) {
      continue
    }

    const existing = latestByMetric.get(stageMetric)

    if (!existing || row.syncedAt >= existing.syncedAt) {
      latestByMetric.set(stageMetric, row)
    }
  }

  return latestByMetric
}

function resolveStageCounts(input: {
  dailyTotals: StageCounts
  exactTotals: RawShopifyAnalyticsTotals[]
  latestAvailableDate: string | null
}) {
  const exactTotalsByMetric = buildExactTotalMap(input.exactTotals)
  const counts = emptyStageCounts()
  const exactMetricCount = exactTotalsByMetric.size

  counts.sessions = exactTotalsByMetric.get("sessions")?.valueNum ?? input.dailyTotals.sessions
  counts.addToCart =
    exactTotalsByMetric.get("addToCart")?.valueNum ?? input.dailyTotals.addToCart
  counts.checkout =
    exactTotalsByMetric.get("checkout")?.valueNum ?? input.dailyTotals.checkout
  counts.purchase =
    exactTotalsByMetric.get("purchase")?.valueNum ?? input.dailyTotals.purchase

  const stageCountSource: ShopifyFunnelStageSource =
    exactMetricCount === 0
      ? input.latestAvailableDate
        ? "shopify_daily"
        : "unavailable"
      : exactMetricCount === 4
        ? "shopify_totals"
        : "mixed"

  return {
    counts,
    stageCountSource,
  }
}

function buildStageSummaries(counts: StageCounts): ShopifyFunnelStageSummary[] {
  return [
    {
      id: "sessions",
      label: "Sessions",
      count: counts.sessions,
      overallRate: counts.sessions > 0 ? 100 : 0,
      stepRate: null,
      dropOffCount: null,
    },
    {
      id: "add_to_cart",
      label: "Add to cart",
      count: counts.addToCart,
      overallRate: safePercent(counts.addToCart, counts.sessions),
      stepRate: safePercentOrNull(counts.addToCart, counts.sessions),
      dropOffCount: Math.max(0, counts.sessions - counts.addToCart),
    },
    {
      id: "checkout",
      label: "Checkout",
      count: counts.checkout,
      overallRate: safePercent(counts.checkout, counts.sessions),
      stepRate: safePercentOrNull(counts.checkout, counts.addToCart),
      dropOffCount: Math.max(0, counts.addToCart - counts.checkout),
    },
    {
      id: "purchase",
      label: "Purchase",
      count: counts.purchase,
      overallRate: safePercent(counts.purchase, counts.sessions),
      stepRate: safePercentOrNull(counts.purchase, counts.checkout),
      dropOffCount: Math.max(0, counts.checkout - counts.purchase),
    },
  ]
}

function buildKpis(counts: StageCounts, orders: FactOrder[]): ShopifyFunnelKpiTotals {
  return {
    sessions: counts.sessions,
    addToCartRate: safePercent(counts.addToCart, counts.sessions),
    checkoutRate: safePercent(counts.checkout, counts.sessions),
    purchaseConversionRate: safePercent(counts.purchase, counts.sessions),
    orders: orders.length,
    revenue: orders.reduce((total, order) => total + order.netRevenue, 0),
  }
}

function formatBreakdownLabel(
  dimension: ShopifyFunnelBreakdownDimension,
  rawValue: string
) {
  const value = rawValue.trim()

  if (!value || value.toLowerCase() === "(not set)") {
    return "Unknown"
  }

  if (dimension === "device" || dimension === "customer_type") {
    return value
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  }

  return value
}

function buildBreakdownRows(input: {
  rows: RawShopifyAnalyticsBreakdown[]
  dimension: ShopifyFunnelBreakdownDimension
  totalSessions: number
}): ShopifyFunnelBreakdownRow[] {
  const latestByDateValueMetric = new Map<string, RawShopifyAnalyticsBreakdown>()

  for (const row of input.rows) {
    if (row.breakdownId !== BREAKDOWN_CONFIG[input.dimension].breakdownId) {
      continue
    }

    if (row.dimension !== input.dimension) {
      continue
    }

    const stageMetric = normalizeStageMetric(row.metric)

    if (!stageMetric) {
      continue
    }

    const key = `${row.endDate}::${row.dimensionValue.trim().toLowerCase()}::${stageMetric}`
    const existing = latestByDateValueMetric.get(key)

    if (!existing || row.syncedAt >= existing.syncedAt) {
      latestByDateValueMetric.set(key, row)
    }
  }

  const countsByValue = new Map<
    string,
    {
      key: string
      label: string
      counts: StageCounts
    }
  >()

  for (const row of latestByDateValueMetric.values()) {
    const stageMetric = normalizeStageMetric(row.metric)

    if (!stageMetric) {
      continue
    }

    const label = formatBreakdownLabel(input.dimension, row.dimensionValue)
    const key = label.toLowerCase()
    const current = countsByValue.get(key) ?? {
      key,
      label,
      counts: emptyStageCounts(),
    }

    current.counts[stageMetric] += row.valueNum
    countsByValue.set(key, current)
  }

  return Array.from(countsByValue.values())
    .map<ShopifyFunnelBreakdownRow>(({ key, label, counts }) => ({
      key,
      label,
      sessions: counts.sessions,
      addToCart: counts.addToCart,
      checkout: counts.checkout,
      purchase: counts.purchase,
      addToCartRate: safePercent(counts.addToCart, counts.sessions),
      checkoutRate: safePercent(counts.checkout, counts.sessions),
      purchaseRate: safePercent(counts.purchase, counts.sessions),
      checkoutToPurchaseRate: safePercent(counts.purchase, counts.checkout),
      sessionShare: safePercent(counts.sessions, input.totalSessions),
    }))
    .sort((left, right) => {
      if (right.purchase !== left.purchase) {
        return right.purchase - left.purchase
      }

      if (right.sessions !== left.sessions) {
        return right.sessions - left.sessions
      }

      return left.label.localeCompare(right.label)
    })
}

function deriveFallbackProductName(itemName: string, sku: string) {
  const normalizedItemName = itemName.trim()

  if (!normalizedItemName) {
    return sku.trim() || "Unmapped product"
  }

  const separatorIndex = normalizedItemName.lastIndexOf(" - ")

  if (separatorIndex > 0) {
    const baseName = normalizedItemName.slice(0, separatorIndex).trim()

    if (baseName) {
      return baseName
    }
  }

  return normalizedItemName
}

function buildSkuSummary(skuList: string[]) {
  if (skuList.length === 0) {
    return "Unknown SKU"
  }

  if (skuList.length === 1) {
    return skuList[0]
  }

  if (skuList.length === 2) {
    return `${skuList[0]}, ${skuList[1]}`
  }

  return `${skuList[0]}, ${skuList[1]} +${skuList.length - 2}`
}

function createProductBreakdownRow(input: {
  key: string
  product: string
  sku: string
  skuList: string[]
  views: number
  addToCart: number
  checkout: number
  purchase: number
}): ShopifyFunnelProductBreakdownRow {
  return {
    key: input.key,
    product: input.product,
    sku: input.sku,
    skuList: input.skuList,
    views: input.views,
    addToCart: input.addToCart,
    checkout: input.checkout,
    purchase: input.purchase,
    addToCartRate: safePercent(input.addToCart, input.views),
    checkoutRate: safePercent(input.checkout, input.views),
    purchaseRate: safePercent(input.purchase, input.views),
  }
}

function compareProductBreakdownRows(
  left: ShopifyFunnelProductBreakdownRow,
  right: ShopifyFunnelProductBreakdownRow
) {
  if (right.purchase !== left.purchase) {
    return right.purchase - left.purchase
  }

  if (right.views !== left.views) {
    return right.views - left.views
  }

  const productLabelComparison = left.product.localeCompare(right.product)

  if (productLabelComparison !== 0) {
    return productLabelComparison
  }

  return left.sku.localeCompare(right.sku)
}

function buildShopifySkuMetadataMap(rows: ShopifySkuLookupRow[]) {
  const metadata = new Map<string, ShopifySkuMetadata>()

  for (const row of rows) {
    const normalizedSku = normalizeLookupToken(row.sku)

    if (!normalizedSku || metadata.has(normalizedSku)) {
      continue
    }

    metadata.set(normalizedSku, {
      productName: row.productName.trim() || row.sku.trim() || "Unmapped product",
      variantName: row.variantName.trim(),
    })
  }

  return metadata
}

function buildProductBreakdownRows(input: {
  rows: RawGa4ProductFunnel[]
  skuMetadata: Map<string, ShopifySkuMetadata>
}): Record<
  ShopifyFunnelProductBreakdownGroup,
  ShopifyFunnelProductBreakdownRow[]
> {
  const itemRows = new Map<string, ProductFunnelBaseItem>()

  for (const row of input.rows) {
    const rawSku = row.itemId.trim()
    const sku = rawSku || "Unknown SKU"
    const skuKey = normalizeLookupToken(rawSku)
    const metadata = skuKey ? input.skuMetadata.get(skuKey) : undefined
    const product =
      metadata?.productName ?? deriveFallbackProductName(row.itemName, sku)
    const itemKey =
      skuKey ||
      normalizeLookupToken(row.itemName) ||
      `${row.startDate}:${row.endDate}:${product}`
    const current = itemRows.get(itemKey) ?? {
      key: itemKey,
      product,
      sku,
      views: 0,
      addToCart: 0,
      checkout: 0,
      purchase: 0,
    }

    current.views += row.views
    current.addToCart += row.addToCarts
    current.checkout += row.checkouts
    current.purchase += row.purchases
    itemRows.set(itemKey, current)
  }

  const skuRows = Array.from(itemRows.values())
    .map((item) =>
      createProductBreakdownRow({
        key: item.key,
        product: item.product,
        sku: item.sku,
        skuList: item.sku === "Unknown SKU" ? [] : [item.sku],
        views: item.views,
        addToCart: item.addToCart,
        checkout: item.checkout,
        purchase: item.purchase,
      })
    )
    .sort(compareProductBreakdownRows)

  const productRows = Array.from(itemRows.values())
    .reduce<
      Map<
        string,
        {
          key: string
          product: string
          skuSet: Set<string>
          views: number
          addToCart: number
          checkout: number
          purchase: number
        }
      >
    >((groups, item) => {
      const productKey = normalizeLookupToken(item.product) || item.key
      const current = groups.get(productKey) ?? {
        key: productKey,
        product: item.product,
        skuSet: new Set<string>(),
        views: 0,
        addToCart: 0,
        checkout: 0,
        purchase: 0,
      }

      if (item.sku !== "Unknown SKU") {
        current.skuSet.add(item.sku)
      }

      current.views += item.views
      current.addToCart += item.addToCart
      current.checkout += item.checkout
      current.purchase += item.purchase
      groups.set(productKey, current)

      return groups
    }, new Map())

  return {
    product: Array.from(productRows.values())
      .map((group) => {
        const skuList = Array.from(group.skuSet).sort((left, right) =>
          left.localeCompare(right)
        )

        return createProductBreakdownRow({
          key: group.key,
          product: group.product,
          sku: buildSkuSummary(skuList),
          skuList,
          views: group.views,
          addToCart: group.addToCart,
          checkout: group.checkout,
          purchase: group.purchase,
        })
      })
      .sort(compareProductBreakdownRows),
    sku: skuRows,
  }
}

function emptyProductBreakdown(): ShopifyFunnelProductBreakdown {
  return {
    rowsByGroup: {
      product: [],
      sku: [],
    },
    sourceRange: null,
    sourceMode: "unavailable",
  }
}

function buildProductBreakdown(input: {
  range: LoaderRange
  rows: RawGa4ProductFunnel[]
  skuMetadata: Map<string, ShopifySkuMetadata>
}): ShopifyFunnelProductBreakdown {
  if (input.rows.length === 0) {
    return emptyProductBreakdown()
  }

  const candidatesByRange = input.rows.reduce<
    Map<string, { range: LoaderRange; rows: RawGa4ProductFunnel[] }>
  >((candidates, row) => {
    if (!row.startDate || !row.endDate) {
      return candidates
    }

    const candidateKey = `${row.startDate}::${row.endDate}`
    const current = candidates.get(candidateKey) ?? {
      range: {
        from: row.startDate,
        to: row.endDate,
      },
      rows: [],
    }

    current.rows.push(row)
    candidates.set(candidateKey, current)

    return candidates
  }, new Map())

  const selectedCandidate = Array.from(candidatesByRange.values())
    .map((candidate) => ({
      ...candidate,
      exact:
        candidate.range.from === input.range.from &&
        candidate.range.to === input.range.to,
      overlap: overlapDays(input.range, candidate.range),
      spanDelta: Math.abs(
        daysBetweenInclusive(candidate.range) - daysBetweenInclusive(input.range)
      ),
      latestSyncedAt: candidate.rows.reduce<string>(
        (latest, row) => (row.syncedAt > latest ? row.syncedAt : latest),
        ""
      ),
    }))
    .filter((candidate) => candidate.overlap > 0)
    .sort((left, right) => {
      if (left.exact !== right.exact) {
        return left.exact ? -1 : 1
      }

      if (right.overlap !== left.overlap) {
        return right.overlap - left.overlap
      }

      if (left.spanDelta !== right.spanDelta) {
        return left.spanDelta - right.spanDelta
      }

      if (right.range.to !== left.range.to) {
        return right.range.to.localeCompare(left.range.to)
      }

      if (right.latestSyncedAt !== left.latestSyncedAt) {
        return right.latestSyncedAt.localeCompare(left.latestSyncedAt)
      }

      return right.rows.length - left.rows.length
    })[0]

  if (!selectedCandidate) {
    return emptyProductBreakdown()
  }

  return {
    rowsByGroup: buildProductBreakdownRows({
      rows: selectedCandidate.rows,
      skuMetadata: input.skuMetadata,
    }),
    sourceRange: selectedCandidate.range,
    sourceMode: selectedCandidate.exact ? "exact" : "fallback",
  }
}

function buildRangeView(input: {
  range: LoaderRange
  dailyRows: RawShopifyAnalyticsDaily[]
  exactTotalRows: RawShopifyAnalyticsTotals[]
  orderRows: FactOrder[]
}): RangeView {
  const dailyAggregation = buildDailyAggregation({
    range: input.range,
    rows: input.dailyRows,
  })
  const { counts, stageCountSource } = resolveStageCounts({
    dailyTotals: dailyAggregation.totals,
    exactTotals: input.exactTotalRows,
    latestAvailableDate: dailyAggregation.latestAvailableDate,
  })

  return {
    kpis: buildKpis(counts, input.orderRows),
    stages: buildStageSummaries(counts),
    daily: dailyAggregation.daily,
    latestAvailableDate: maxIsoDate(
      dailyAggregation.latestAvailableDate,
      input.orderRows.reduce<string | null>(
        (latest, order) =>
          latest === null || order.orderDate > latest ? order.orderDate : latest,
        null
      )
    ),
    stageCountSource,
  }
}

async function selectExactShopifyAnalyticsTotals(input: {
  workspaceId: string
  range: LoaderRange
  cacheBuster?: string
}) {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT *
      FROM raw_shopify_analytics_totals
      WHERE workspace_id = ?
        AND start_date = ?
        AND end_date = ?
      ORDER BY metric ASC
    `,
    [input.workspaceId, input.range.from, input.range.to],
    { cacheBuster: input.cacheBuster }
  )

  return rows.map(parseRawShopifyAnalyticsTotals)
}

async function selectGa4ProductFunnelRows(input: {
  workspaceId: string
  range: LoaderRange
  cacheBuster?: string
}) {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT *
      FROM raw_ga4_product_funnel
      WHERE workspace_id = ?
        AND start_date <= ?
        AND end_date >= ?
      ORDER BY end_date DESC, start_date DESC, item_name ASC, item_id ASC
    `,
    [input.workspaceId, input.range.to, input.range.from],
    { cacheBuster: input.cacheBuster }
  )

  return rows.map(parseRawGa4ProductFunnel)
}

async function selectShopifySkuLookupRows(input: {
  workspaceId: string
  cacheBuster?: string
}) {
  const rows = await queryRows<Record<string, unknown>>(
    `
      SELECT
        sku,
        product_name,
        variant_name,
        COUNT(*) AS usage_count,
        MAX(order_date) AS latest_order_date
      FROM fact_order_items
      WHERE workspace_id = ?
        AND TRIM(sku) != ''
      GROUP BY sku, product_name, variant_name
      ORDER BY usage_count DESC, latest_order_date DESC, product_name ASC, variant_name ASC, sku ASC
    `,
    [input.workspaceId],
    { cacheBuster: input.cacheBuster }
  )

  return rows.map<ShopifySkuLookupRow>((row) => ({
    sku: String(row.sku ?? "").trim(),
    productName: String(row.product_name ?? "").trim(),
    variantName: String(row.variant_name ?? "").trim(),
  }))
}

export async function loadShopifyFunnelSlice(
  context: DashboardRequestContext
): Promise<ShopifyFunnelSliceData> {
  const cacheBuster = context.refresh ?? context.loadedAt
  const comparisonRange = getComparisonRange(
    context.from,
    context.to,
    context.compare
  )
  const [
    currentDailyRows,
    currentBreakdownRows,
    currentOrderRows,
    currentExactTotalRows,
    currentProductFunnelRows,
    currentSkuLookupRows,
    comparisonDailyRows,
    comparisonOrderRows,
    comparisonExactTotalRows,
  ] = await Promise.all([
    selectRowsFromTable("rawShopifyAnalyticsDaily", {
      workspaceId: context.workspaceId,
      from: context.from,
      to: context.to,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("rawShopifyAnalyticsBreakdowns", {
      workspaceId: context.workspaceId,
      from: context.from,
      to: context.to,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("factOrders", {
      workspaceId: context.workspaceId,
      from: context.from,
      to: context.to,
      limit: null,
      cacheBuster,
    }),
    selectExactShopifyAnalyticsTotals({
      workspaceId: context.workspaceId,
      range: {
        from: context.from,
        to: context.to,
      },
      cacheBuster,
    }),
    selectGa4ProductFunnelRows({
      workspaceId: context.workspaceId,
      range: {
        from: context.from,
        to: context.to,
      },
      cacheBuster,
    }),
    selectShopifySkuLookupRows({
      workspaceId: context.workspaceId,
      cacheBuster,
    }),
    comparisonRange
      ? selectRowsFromTable("rawShopifyAnalyticsDaily", {
          workspaceId: context.workspaceId,
          from: comparisonRange.from,
          to: comparisonRange.to,
          limit: null,
          cacheBuster,
        })
      : Promise.resolve([]),
    comparisonRange
      ? selectRowsFromTable("factOrders", {
          workspaceId: context.workspaceId,
          from: comparisonRange.from,
          to: comparisonRange.to,
          limit: null,
          cacheBuster,
        })
      : Promise.resolve([]),
    comparisonRange
      ? selectExactShopifyAnalyticsTotals({
          workspaceId: context.workspaceId,
          range: comparisonRange,
          cacheBuster,
        })
      : Promise.resolve([]),
  ])

  const currentView = buildRangeView({
    range: {
      from: context.from,
      to: context.to,
    },
    dailyRows: currentDailyRows.map(parseRawShopifyAnalyticsDaily),
    exactTotalRows: currentExactTotalRows,
    orderRows: currentOrderRows.map(parseFactOrder),
  })
  const currentBreakdowns = currentBreakdownRows.map(
    parseRawShopifyAnalyticsBreakdown
  )
  const breakdowns = Object.fromEntries(
    (
      Object.keys(BREAKDOWN_CONFIG) as ShopifyFunnelBreakdownDimension[]
    ).map((dimension) => [
      dimension,
      buildBreakdownRows({
        rows: currentBreakdowns,
        dimension,
        totalSessions: currentView.kpis.sessions,
      }),
    ])
  ) as Partial<
    Record<ShopifyFunnelBreakdownDimension, ShopifyFunnelBreakdownRow[]>
  >
  const availableBreakdownDimensions = (
    Object.keys(BREAKDOWN_CONFIG) as ShopifyFunnelBreakdownDimension[]
  ).filter((dimension) => (breakdowns[dimension]?.length ?? 0) > 0)
  const productBreakdown = buildProductBreakdown({
    range: {
      from: context.from,
      to: context.to,
    },
    rows: currentProductFunnelRows,
    skuMetadata: buildShopifySkuMetadataMap(currentSkuLookupRows),
  })

  return {
    context,
    currentRange: {
      range: {
        from: context.from,
        to: context.to,
      },
      kpis: currentView.kpis,
      stages: currentView.stages,
      daily: currentView.daily,
      breakdowns,
      productBreakdown,
      availableBreakdownDimensions,
      latestAvailableDate: currentView.latestAvailableDate,
      stageCountSource: currentView.stageCountSource,
    },
    comparison: comparisonRange
      ? {
          range: comparisonRange,
          ...buildRangeView({
            range: comparisonRange,
            dailyRows: comparisonDailyRows.map(parseRawShopifyAnalyticsDaily),
            exactTotalRows: comparisonExactTotalRows,
            orderRows: comparisonOrderRows.map(parseFactOrder),
          }),
        }
      : null,
    settings: {
      currency: env.backend.defaultCurrency,
      kpiMetricIds: [...SHOPIFY_FUNNEL_KPI_METRIC_IDS],
    },
  }
}
