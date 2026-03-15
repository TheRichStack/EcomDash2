import "server-only"

import { queryRows, selectRowsFromTable } from "@/lib/db/query"
import {
  parseConfigEntry,
  parseFactOrderItem,
  parseRawShopifyOrder,
} from "@/lib/db/record-parsers"
import { buildEcomDash2SettingsSnapshot } from "@/lib/server/dashboard-settings"
import type {
  FactOrderItem,
  RawShopifyOrder,
  ShopifyProductsBreakdown,
  ShopifyProductsSliceData,
  ShopifyProductsTableRow,
} from "@/types/backend"
import type { DashboardRequestContext } from "@/types/dashboard"

type RawShopifyOrderSqlRow = {
  order_id?: string | number | null
  created_at?: string | null
  updated_at?: string | null
  _synced_at?: string | null
  tags?: string | null
}

type MutableShopifyProductsRow = {
  key: string
  product: string
  sku: string
  variant: string
  totalSales: number
  qtySold: number
  qtyRefunded: number
  refundAmount: number
  productCosts: number
  grossProfit: number
  totalDiscount: number
  grossBeforeDiscount: number
  qtyLast7d: number
  qtyLast30d: number
  orderIds: Set<string>
  tagSet: Set<string>
}

const SHOPIFY_PRODUCTS_BREAKDOWNS = [
  "product",
  "sku",
  "variant",
] as const satisfies readonly ShopifyProductsBreakdown[]

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
  const shifted = parseIsoDate(isoDate)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return toIsoDate(shifted)
}

function minIsoDate(left: string, right: string) {
  return left <= right ? left : right
}

function productFallbackKey(item: FactOrderItem) {
  return item.productId || item.productName || "unknown-product"
}

function buildBreakdownIdentity(
  item: FactOrderItem,
  breakdown: ShopifyProductsBreakdown
) {
  const product = item.productName.trim() || "Unknown product"
  const sku = item.sku.trim() || "-"
  const variant = item.variantName.trim() || item.sku.trim() || "Default"
  const fallbackProductKey = productFallbackKey(item)

  switch (breakdown) {
    case "product":
      return {
        key: item.productId || fallbackProductKey,
        product,
        sku,
        variant: "-",
      }
    case "sku":
      return {
        key: item.sku || `${fallbackProductKey}::no-sku`,
        product,
        sku,
        variant: "-",
      }
    case "variant":
      return {
        key:
          item.variantId ||
          `${fallbackProductKey}::${item.sku || "no-sku"}::${variant}`,
        product,
        sku,
        variant,
      }
    default:
      return {
        key: item.productId || fallbackProductKey,
        product,
        sku,
        variant: "-",
      }
  }
}

function pickLatestRawShopifyOrder(left: RawShopifyOrder, right: RawShopifyOrder) {
  const leftFreshness = left.updatedAt || left.syncedAt || left.createdAt || ""
  const rightFreshness =
    right.updatedAt || right.syncedAt || right.createdAt || ""

  return leftFreshness >= rightFreshness ? left : right
}

async function selectRawShopifyOrdersForRange(input: {
  workspaceId: string
  from: string
  to: string
  cacheBuster?: string
}) {
  const orderDateSql = `
    COALESCE(
      NULLIF(substr(created_at, 1, 10), ''),
      NULLIF(substr(updated_at, 1, 10), ''),
      NULLIF(substr(_synced_at, 1, 10), '')
    )
  `

  const rows = await queryRows<RawShopifyOrderSqlRow>(
    `
      SELECT order_id, created_at, updated_at, _synced_at, tags
      FROM raw_shopify_orders
      WHERE workspace_id = ?
        AND ${orderDateSql} >= ?
        AND ${orderDateSql} <= ?
      ORDER BY created_at ASC, updated_at ASC
    `,
    [input.workspaceId, input.from, input.to],
    { cacheBuster: input.cacheBuster }
  )

  return rows.map(parseRawShopifyOrder)
}

function buildOrderTagMap(rawOrders: RawShopifyOrder[]) {
  const latestOrderById = new Map<string, RawShopifyOrder>()

  for (const order of rawOrders) {
    if (!order.orderId) {
      continue
    }

    const existing = latestOrderById.get(order.orderId)

    latestOrderById.set(
      order.orderId,
      existing ? pickLatestRawShopifyOrder(existing, order) : order
    )
  }

  return new Map(
    Array.from(latestOrderById.entries()).map(([orderId, order]) => [
      orderId,
      order.tags,
    ])
  )
}

function buildBreakdownMaps() {
  return {
    product: new Map<string, MutableShopifyProductsRow>(),
    sku: new Map<string, MutableShopifyProductsRow>(),
    variant: new Map<string, MutableShopifyProductsRow>(),
  } satisfies Record<
    ShopifyProductsBreakdown,
    Map<string, MutableShopifyProductsRow>
  >
}

function upsertSelectedRangeRow(input: {
  item: FactOrderItem
  tags: string[]
  breakdown: ShopifyProductsBreakdown
  rows: Map<string, MutableShopifyProductsRow>
}) {
  const identity = buildBreakdownIdentity(input.item, input.breakdown)
  const existing = input.rows.get(identity.key) ?? {
    key: identity.key,
    product: identity.product,
    sku: identity.sku,
    variant: identity.variant,
    totalSales: 0,
    qtySold: 0,
    qtyRefunded: 0,
    refundAmount: 0,
    productCosts: 0,
    grossProfit: 0,
    totalDiscount: 0,
    grossBeforeDiscount: 0,
    qtyLast7d: 0,
    qtyLast30d: 0,
    orderIds: new Set<string>(),
    tagSet: new Set<string>(),
  }

  existing.totalSales += input.item.lineTotal
  existing.qtySold += input.item.quantity
  existing.qtyRefunded += input.item.quantityRefunded
  existing.refundAmount += input.item.refundAmount
  existing.productCosts += input.item.lineCost
  existing.grossProfit += input.item.grossProfit
  existing.totalDiscount += input.item.discount
  existing.grossBeforeDiscount += input.item.lineTotal + input.item.discount

  if (input.item.orderId) {
    existing.orderIds.add(input.item.orderId)
  }

  if (input.breakdown === "product" && identity.sku !== "-") {
    if (existing.sku === "-" || existing.sku === "") {
      existing.sku = identity.sku
    } else if (existing.sku !== identity.sku && existing.sku !== "Multiple") {
      existing.sku = "Multiple"
    }
  }

  for (const tag of input.tags) {
    existing.tagSet.add(tag)
  }

  input.rows.set(identity.key, existing)
}

function applyVelocityToRow(input: {
  item: FactOrderItem
  breakdown: ShopifyProductsBreakdown
  rows: Map<string, MutableShopifyProductsRow>
  last7DaysFrom: string
}) {
  const identity = buildBreakdownIdentity(input.item, input.breakdown)
  const row = input.rows.get(identity.key)

  if (!row) {
    return
  }

  if (input.item.orderDate >= input.last7DaysFrom) {
    row.qtyLast7d += input.item.quantity
  }

  row.qtyLast30d += input.item.quantity
}

function finalizeBreakdownRows(rows: Map<string, MutableShopifyProductsRow>) {
  return Array.from(rows.values())
    .map<ShopifyProductsTableRow>((row) => ({
      key: row.key,
      product: row.product,
      sku: row.sku || "-",
      variant: row.variant || "-",
      totalSales: row.totalSales,
      orders: row.orderIds.size,
      qtySold: row.qtySold,
      qtyRefunded: row.qtyRefunded,
      refundAmount: row.refundAmount,
      productCosts: row.productCosts,
      grossProfit: row.grossProfit,
      netProfit: row.grossProfit - row.refundAmount,
      marginPct: row.totalSales > 0 ? row.grossProfit / row.totalSales : 0,
      priceReductionPct:
        row.grossBeforeDiscount > 0
          ? row.totalDiscount / row.grossBeforeDiscount
          : 0,
      salesVelocity7d: row.qtyLast7d / 7,
      salesVelocity30d: row.qtyLast30d / 30,
      tags: Array.from(row.tagSet).sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => {
      if (right.totalSales !== left.totalSales) {
        return right.totalSales - left.totalSales
      }

      if (right.qtySold !== left.qtySold) {
        return right.qtySold - left.qtySold
      }

      if (left.product !== right.product) {
        return left.product.localeCompare(right.product)
      }

      if (left.sku !== right.sku) {
        return left.sku.localeCompare(right.sku)
      }

      return left.variant.localeCompare(right.variant)
    })
}

export async function loadShopifyProductsSlice(
  context: DashboardRequestContext
): Promise<ShopifyProductsSliceData> {
  const cacheBuster = context.refresh ?? context.loadedAt
  const last7DaysFrom = addUtcDays(context.to, -6)
  const last30DaysFrom = addUtcDays(context.to, -29)
  const analysisFrom = minIsoDate(context.from, last30DaysFrom)
  const [configRows, factOrderItemRows, rawShopifyOrderRows] = await Promise.all([
    selectRowsFromTable("configEntries", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("factOrderItems", {
      workspaceId: context.workspaceId,
      from: analysisFrom,
      to: context.to,
      limit: null,
      cacheBuster,
    }),
    selectRawShopifyOrdersForRange({
      workspaceId: context.workspaceId,
      from: context.from,
      to: context.to,
      cacheBuster,
    }),
  ])

  const configEntries = configRows.map(parseConfigEntry)
  const settings = buildEcomDash2SettingsSnapshot({
    configEntries,
    targetEntries: [],
  })
  const orderItems = factOrderItemRows
    .map(parseFactOrderItem)
    .filter((item) => item.orderDate >= analysisFrom && item.orderDate <= context.to)
  const selectedRangeItems = orderItems.filter(
    (item) => item.orderDate >= context.from && item.orderDate <= context.to
  )
  const velocityWindowItems = orderItems.filter(
    (item) => item.orderDate >= last30DaysFrom && item.orderDate <= context.to
  )
  const orderTagMap = buildOrderTagMap(rawShopifyOrderRows)
  const breakdownMaps = buildBreakdownMaps()
  const availableTagSet = new Set<string>()
  const kpiAccumulator = {
    totalSales: 0,
    unitsSold: 0,
    unitsRefunded: 0,
    refundAmount: 0,
    grossProfit: 0,
  }

  for (const item of selectedRangeItems) {
    const tags = orderTagMap.get(item.orderId) ?? []

    kpiAccumulator.totalSales += item.lineTotal
    kpiAccumulator.unitsSold += item.quantity
    kpiAccumulator.unitsRefunded += item.quantityRefunded
    kpiAccumulator.refundAmount += item.refundAmount
    kpiAccumulator.grossProfit += item.grossProfit

    for (const tag of tags) {
      availableTagSet.add(tag)
    }

    for (const breakdown of SHOPIFY_PRODUCTS_BREAKDOWNS) {
      upsertSelectedRangeRow({
        item,
        tags,
        breakdown,
        rows: breakdownMaps[breakdown],
      })
    }
  }

  for (const item of velocityWindowItems) {
    for (const breakdown of SHOPIFY_PRODUCTS_BREAKDOWNS) {
      applyVelocityToRow({
        item,
        breakdown,
        rows: breakdownMaps[breakdown],
        last7DaysFrom,
      })
    }
  }

  return {
    context,
    currentRange: {
      range: {
        from: context.from,
        to: context.to,
      },
      kpis: {
        totalSales: kpiAccumulator.totalSales,
        unitsSold: kpiAccumulator.unitsSold,
        grossProfit: kpiAccumulator.grossProfit,
        // Products v1 does not allocate ad spend or overhead by row, so the
        // KPI uses a refund-adjusted gross-profit proxy for net profit.
        netProfit: kpiAccumulator.grossProfit - kpiAccumulator.refundAmount,
        refundAmount: kpiAccumulator.refundAmount,
        returnRate:
          kpiAccumulator.unitsSold > 0
            ? (kpiAccumulator.unitsRefunded / kpiAccumulator.unitsSold) * 100
            : 0,
      },
      breakdowns: {
        product: finalizeBreakdownRows(breakdownMaps.product),
        sku: finalizeBreakdownRows(breakdownMaps.sku),
        variant: finalizeBreakdownRows(breakdownMaps.variant),
      },
      availableTags: Array.from(availableTagSet).sort((left, right) =>
        left.localeCompare(right)
      ),
    },
    settings: {
      currency: settings.currency,
      configEntries: settings.configEntries,
    },
    velocityWindows: {
      last7DaysFrom,
      last30DaysFrom,
    },
  }
}
