import "server-only"

import { queryFirst, selectRowsFromTable } from "@/lib/db/query"
import {
  parseFactOrderItem,
  parseRawShopifyInventoryLevel,
} from "@/lib/db/record-parsers"
import type {
  FactOrderItem,
  RawShopifyInventoryLevel,
  ShopifyInventoryKpiTotals,
  ShopifyInventorySliceData,
  ShopifyInventoryStatus,
  ShopifyInventoryTableRow,
  ShopifyInventoryVelocityMetrics,
  ShopifyInventoryVelocityWindow,
} from "@/types/backend"
import type { DashboardRequestContext } from "@/types/dashboard"

const SHOPIFY_INVENTORY_VELOCITY_WINDOWS = [
  7,
  14,
  30,
  60,
  90,
] as const satisfies readonly ShopifyInventoryVelocityWindow[]

const DEFAULT_VELOCITY_WINDOW: ShopifyInventoryVelocityWindow = 30
const AT_RISK_DAYS_THRESHOLD = 14

type SnapshotDateRow = {
  snapshot_date?: string | null
}

type InventoryLookupMaps = {
  byVariantId: Map<string, string>
  byProductSkuVariant: Map<string, string>
  byProductSku: Map<string, string>
  bySku: Map<string, string>
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
  const shifted = parseIsoDate(isoDate)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return toIsoDate(shifted)
}

function normalizeLookupToken(value: string) {
  return value.trim().toLowerCase()
}

function rowKeyFromInventoryRow(row: RawShopifyInventoryLevel) {
  const variantId = row.variantId.trim()

  if (variantId) {
    return variantId
  }

  const productId = row.productId.trim() || "unknown-product"
  const sku = row.sku.trim() || "no-sku"
  const variant = row.variantTitle.trim() || "default"

  return `${productId}::${sku}::${variant}`
}

function isTrackedInventoryRow(row: RawShopifyInventoryLevel) {
  return row.tracked.trim().toLowerCase() === "true"
}

function resolveAvailableQuantity(
  row: RawShopifyInventoryLevel,
  tracked: boolean
) {
  if (tracked) {
    return row.availableQuantity ?? 0
  }

  return row.availableQuantity
}

function resolveInventoryStatus(input: {
  tracked: boolean
  available: number | null
  daysLeft: number | null
}): ShopifyInventoryStatus {
  if (!input.tracked) {
    return "untracked"
  }

  if (input.available !== null && input.available <= 0) {
    return "out_of_stock"
  }

  if (input.daysLeft !== null && input.daysLeft <= AT_RISK_DAYS_THRESHOLD) {
    return "at_risk"
  }

  return "healthy"
}

async function selectLatestSnapshotDate(input: {
  workspaceId: string
  from: string
  to: string
  cacheBuster?: string
}) {
  const inRange = await queryFirst<SnapshotDateRow>(
    `
      SELECT MAX(snapshot_date) AS snapshot_date
      FROM raw_shopify_inventory_levels
      WHERE workspace_id = ?
        AND snapshot_date >= ?
        AND snapshot_date <= ?
    `,
    [input.workspaceId, input.from, input.to],
    { cacheBuster: input.cacheBuster }
  )

  const latestInRange = String(inRange?.snapshot_date ?? "").trim()

  if (latestInRange) {
    return {
      latestSnapshotDate: latestInRange,
      usedRangeFallback: false,
    }
  }

  const latestOverall = await queryFirst<SnapshotDateRow>(
    `
      SELECT MAX(snapshot_date) AS snapshot_date
      FROM raw_shopify_inventory_levels
      WHERE workspace_id = ?
    `,
    [input.workspaceId],
    { cacheBuster: input.cacheBuster }
  )

  const latestSnapshotDate = String(latestOverall?.snapshot_date ?? "").trim()

  return {
    latestSnapshotDate: latestSnapshotDate || null,
    usedRangeFallback: Boolean(latestSnapshotDate),
  }
}

function buildInventoryLookupMaps(
  rows: RawShopifyInventoryLevel[]
): InventoryLookupMaps {
  const maps: InventoryLookupMaps = {
    byVariantId: new Map<string, string>(),
    byProductSkuVariant: new Map<string, string>(),
    byProductSku: new Map<string, string>(),
    bySku: new Map<string, string>(),
  }

  for (const row of rows) {
    const rowKey = rowKeyFromInventoryRow(row)
    const variantId = row.variantId.trim()
    const productId = row.productId.trim()
    const sku = normalizeLookupToken(row.sku)
    const variant = normalizeLookupToken(row.variantTitle)

    if (variantId && !maps.byVariantId.has(variantId)) {
      maps.byVariantId.set(variantId, rowKey)
    }

    if (productId || sku || variant) {
      const productSkuVariantKey = `${productId}|${sku}|${variant}`

      if (!maps.byProductSkuVariant.has(productSkuVariantKey)) {
        maps.byProductSkuVariant.set(productSkuVariantKey, rowKey)
      }
    }

    if (productId || sku) {
      const productSkuKey = `${productId}|${sku}`

      if (!maps.byProductSku.has(productSkuKey)) {
        maps.byProductSku.set(productSkuKey, rowKey)
      }
    }

    if (sku && !maps.bySku.has(sku)) {
      maps.bySku.set(sku, rowKey)
    }
  }

  return maps
}

function resolveInventoryRowKeyForOrderItem(
  item: FactOrderItem,
  lookupMaps: InventoryLookupMaps
) {
  const variantId = item.variantId.trim()

  if (variantId) {
    const matched = lookupMaps.byVariantId.get(variantId)

    if (matched) {
      return matched
    }
  }

  const productId = item.productId.trim()
  const sku = normalizeLookupToken(item.sku)
  const variant = normalizeLookupToken(item.variantName)

  const productSkuVariantKey = `${productId}|${sku}|${variant}`
  const productSkuVariantMatch =
    lookupMaps.byProductSkuVariant.get(productSkuVariantKey)

  if (productSkuVariantMatch) {
    return productSkuVariantMatch
  }

  const productSkuKey = `${productId}|${sku}`
  const productSkuMatch = lookupMaps.byProductSku.get(productSkuKey)

  if (productSkuMatch) {
    return productSkuMatch
  }

  if (!sku) {
    return null
  }

  return lookupMaps.bySku.get(sku) ?? null
}

function buildDailyUnitsByRowKey(input: {
  orderItems: FactOrderItem[]
  lookupMaps: InventoryLookupMaps
  from: string
  to: string
}) {
  const dailyUnitsByRowKey = new Map<string, Map<string, number>>()

  for (const item of input.orderItems) {
    if (item.orderDate < input.from || item.orderDate > input.to) {
      continue
    }

    const rowKey = resolveInventoryRowKeyForOrderItem(item, input.lookupMaps)

    if (!rowKey) {
      continue
    }

    if (!item.orderDate) {
      continue
    }

    const quantity = item.quantity

    if (!Number.isFinite(quantity) || quantity <= 0) {
      continue
    }

    const existingDailyUnits = dailyUnitsByRowKey.get(rowKey) ?? new Map<string, number>()
    existingDailyUnits.set(
      item.orderDate,
      (existingDailyUnits.get(item.orderDate) ?? 0) + quantity
    )
    dailyUnitsByRowKey.set(rowKey, existingDailyUnits)
  }

  return dailyUnitsByRowKey
}

function buildVelocityMetrics(input: {
  tracked: boolean
  available: number | null
  snapshotDate: string
  dailyUnits: Map<string, number> | undefined
}) {
  const velocity = {} as Record<
    ShopifyInventoryVelocityWindow,
    ShopifyInventoryVelocityMetrics
  >

  for (const window of SHOPIFY_INVENTORY_VELOCITY_WINDOWS) {
    const windowFrom = addUtcDays(input.snapshotDate, -(window - 1))
    let sold = 0

    for (const [date, quantity] of input.dailyUnits?.entries() ?? []) {
      if (date >= windowFrom && date <= input.snapshotDate) {
        sold += quantity
      }
    }

    const ratePerDay = input.tracked ? sold / window : null
    const daysLeft =
      !input.tracked || input.available === null
        ? null
        : input.available <= 0
          ? 0
          : ratePerDay !== null && ratePerDay > 0
            ? input.available / ratePerDay
            : null
    const estimatedStockout =
      !input.tracked || input.available === null
        ? null
        : input.available <= 0
          ? input.snapshotDate
          : daysLeft !== null && Number.isFinite(daysLeft)
            ? addUtcDays(input.snapshotDate, Math.max(0, Math.ceil(daysLeft)))
            : null

    velocity[window] = {
      sold,
      ratePerDay,
      daysLeft,
      estimatedStockout,
    }
  }

  return velocity
}

function buildInventoryKpis(rows: ShopifyInventoryTableRow[]): ShopifyInventoryKpiTotals {
  return rows.reduce<ShopifyInventoryKpiTotals>(
    (totals, row) => {
      if (row.tracked) {
        totals.trackedVariants += 1
      }

      if (row.available !== null) {
        totals.totalUnitsInStock += row.available
      }

      if (row.status === "at_risk") {
        totals.atRiskVariants += 1
      }

      if (row.status === "out_of_stock") {
        totals.outOfStockVariants += 1
      }

      return totals
    },
    {
      trackedVariants: 0,
      totalUnitsInStock: 0,
      atRiskVariants: 0,
      outOfStockVariants: 0,
    }
  )
}

function compareInventoryRows(
  left: ShopifyInventoryTableRow,
  right: ShopifyInventoryTableRow
) {
  const leftStatusRank =
    left.status === "out_of_stock"
      ? 0
      : left.status === "at_risk"
        ? 1
        : left.status === "healthy"
          ? 2
          : 3
  const rightStatusRank =
    right.status === "out_of_stock"
      ? 0
      : right.status === "at_risk"
        ? 1
        : right.status === "healthy"
          ? 2
          : 3

  if (leftStatusRank !== rightStatusRank) {
    return leftStatusRank - rightStatusRank
  }

  const leftDaysLeft = left.velocity[DEFAULT_VELOCITY_WINDOW].daysLeft
  const rightDaysLeft = right.velocity[DEFAULT_VELOCITY_WINDOW].daysLeft
  const normalizedLeftDaysLeft =
    leftDaysLeft === null ? Number.POSITIVE_INFINITY : leftDaysLeft
  const normalizedRightDaysLeft =
    rightDaysLeft === null ? Number.POSITIVE_INFINITY : rightDaysLeft

  if (normalizedLeftDaysLeft !== normalizedRightDaysLeft) {
    return normalizedLeftDaysLeft - normalizedRightDaysLeft
  }

  const leftAvailable =
    left.available === null ? Number.POSITIVE_INFINITY : left.available
  const rightAvailable =
    right.available === null ? Number.POSITIVE_INFINITY : right.available

  if (leftAvailable !== rightAvailable) {
    return leftAvailable - rightAvailable
  }

  if (left.product !== right.product) {
    return left.product.localeCompare(right.product)
  }

  if (left.variant !== right.variant) {
    return left.variant.localeCompare(right.variant)
  }

  return left.sku.localeCompare(right.sku)
}

export async function loadShopifyInventorySlice(
  context: DashboardRequestContext
): Promise<ShopifyInventorySliceData> {
  const cacheBuster = context.refresh ?? context.loadedAt
  const { latestSnapshotDate, usedRangeFallback } = await selectLatestSnapshotDate({
    workspaceId: context.workspaceId,
    from: context.from,
    to: context.to,
    cacheBuster,
  })

  if (!latestSnapshotDate) {
    return {
      context,
      selectedRange: {
        range: {
          from: context.from,
          to: context.to,
        },
        latestSnapshotDate: null,
        usedRangeFallback: false,
      },
      velocity: {
        anchorDate: null,
        defaultWindow: DEFAULT_VELOCITY_WINDOW,
        windows: [...SHOPIFY_INVENTORY_VELOCITY_WINDOWS],
      },
      kpis: {
        trackedVariants: 0,
        totalUnitsInStock: 0,
        atRiskVariants: 0,
        outOfStockVariants: 0,
      },
      rows: [],
    }
  }

  const [inventoryLevelRows, factOrderItemRows] = await Promise.all([
    selectRowsFromTable("rawShopifyInventoryLevels", {
      workspaceId: context.workspaceId,
      from: latestSnapshotDate,
      to: latestSnapshotDate,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("factOrderItems", {
      workspaceId: context.workspaceId,
      from: addUtcDays(
        latestSnapshotDate,
        -(Math.max(...SHOPIFY_INVENTORY_VELOCITY_WINDOWS) - 1)
      ),
      to: latestSnapshotDate,
      limit: null,
      cacheBuster,
    }),
  ])

  const inventoryRows = inventoryLevelRows.map(parseRawShopifyInventoryLevel)
  const orderItems = factOrderItemRows.map(parseFactOrderItem)
  const lookupMaps = buildInventoryLookupMaps(inventoryRows)
  const dailyUnitsByRowKey = buildDailyUnitsByRowKey({
    orderItems,
    lookupMaps,
    from: addUtcDays(
      latestSnapshotDate,
      -(Math.max(...SHOPIFY_INVENTORY_VELOCITY_WINDOWS) - 1)
    ),
    to: latestSnapshotDate,
  })

  const rows = inventoryRows
    .map<ShopifyInventoryTableRow>((row) => {
      const tracked = isTrackedInventoryRow(row)
      const available = resolveAvailableQuantity(row, tracked)
      const key = rowKeyFromInventoryRow(row)
      const velocity = buildVelocityMetrics({
        tracked,
        available,
        snapshotDate: latestSnapshotDate,
        dailyUnits: dailyUnitsByRowKey.get(key),
      })
      const status = resolveInventoryStatus({
        tracked,
        available,
        daysLeft: velocity[DEFAULT_VELOCITY_WINDOW].daysLeft,
      })

      return {
        key,
        product: row.productTitle.trim() || "Unknown product",
        variant: row.variantTitle.trim() || "Default",
        sku: row.sku.trim() || "-",
        tracked,
        available,
        status,
        velocity,
      }
    })
    .sort(compareInventoryRows)

  return {
    context,
    selectedRange: {
      range: {
        from: context.from,
        to: context.to,
      },
      latestSnapshotDate,
      usedRangeFallback,
    },
    velocity: {
      anchorDate: latestSnapshotDate,
      defaultWindow: DEFAULT_VELOCITY_WINDOW,
      windows: [...SHOPIFY_INVENTORY_VELOCITY_WINDOWS],
    },
    kpis: buildInventoryKpis(rows),
    rows,
  }
}
