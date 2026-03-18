import "server-only"

import { selectRowsFromTable } from "@/lib/db/query"
import { parseFactOrder } from "@/lib/db/record-parsers"
import type { DashboardRequestContext } from "@/types/dashboard"

export type OrderGroupRow = {
  dimension: string
  value: string
  orders: number
  newOrders: number
  returningOrders: number
  totalRevenue: number
  netRevenue: number
  aov: number
}

export type OrderAnalysisSlice = {
  range: { from: string; to: string }
  kpis: {
    totalOrders: number
    newOrders: number
    returningOrders: number
    newCustomerRate: number
    totalRevenue: number
    netRevenue: number
    aov: number
  }
  byUtmSource: OrderGroupRow[]
  bySource: OrderGroupRow[]
  byCountry: OrderGroupRow[]
}

type OrderAccumulator = {
  dimension: string
  value: string
  orders: number
  newOrders: number
  returningOrders: number
  totalRevenue: number
  netRevenue: number
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b
}

export async function loadOrderAnalysisSlice(
  context: DashboardRequestContext
): Promise<OrderAnalysisSlice> {
  const rows = await selectRowsFromTable("factOrders", {
    workspaceId: context.workspaceId,
    from: context.from,
    to: context.to,
    cacheBuster: context.refresh ?? context.loadedAt,
  })

  const utmSourceMap = new Map<string, OrderAccumulator>()
  const sourceMap = new Map<string, OrderAccumulator>()
  const countryMap = new Map<string, OrderAccumulator>()

  let totalOrders = 0
  let totalNewOrders = 0
  let totalReturningOrders = 0
  let totalRevenue = 0
  let totalNetRevenue = 0

  for (const rawRow of rows) {
    const row = parseFactOrder(rawRow)

    const utmKey = row.utmSource || "(none)"
    const sourceKey = row.source || "(none)"
    const countryKey = row.country || "(unknown)"

    // Accumulate into utmSourceMap
    if (!utmSourceMap.has(utmKey)) {
      utmSourceMap.set(utmKey, {
        dimension: "utmSource",
        value: utmKey,
        orders: 0,
        newOrders: 0,
        returningOrders: 0,
        totalRevenue: 0,
        netRevenue: 0,
      })
    }
    const utm = utmSourceMap.get(utmKey)!
    utm.orders += 1
    utm.newOrders += row.isFirstOrder ? 1 : 0
    utm.returningOrders += row.isFirstOrder ? 0 : 1
    utm.totalRevenue += row.totalRevenue
    utm.netRevenue += row.netRevenue

    // Accumulate into sourceMap
    if (!sourceMap.has(sourceKey)) {
      sourceMap.set(sourceKey, {
        dimension: "source",
        value: sourceKey,
        orders: 0,
        newOrders: 0,
        returningOrders: 0,
        totalRevenue: 0,
        netRevenue: 0,
      })
    }
    const src = sourceMap.get(sourceKey)!
    src.orders += 1
    src.newOrders += row.isFirstOrder ? 1 : 0
    src.returningOrders += row.isFirstOrder ? 0 : 1
    src.totalRevenue += row.totalRevenue
    src.netRevenue += row.netRevenue

    // Accumulate into countryMap
    if (!countryMap.has(countryKey)) {
      countryMap.set(countryKey, {
        dimension: "country",
        value: countryKey,
        orders: 0,
        newOrders: 0,
        returningOrders: 0,
        totalRevenue: 0,
        netRevenue: 0,
      })
    }
    const cty = countryMap.get(countryKey)!
    cty.orders += 1
    cty.newOrders += row.isFirstOrder ? 1 : 0
    cty.returningOrders += row.isFirstOrder ? 0 : 1
    cty.totalRevenue += row.totalRevenue
    cty.netRevenue += row.netRevenue

    // Global KPI accumulation
    totalOrders += 1
    totalNewOrders += row.isFirstOrder ? 1 : 0
    totalReturningOrders += row.isFirstOrder ? 0 : 1
    totalRevenue += row.totalRevenue
    totalNetRevenue += row.netRevenue
  }

  function toGroupRows(map: Map<string, OrderAccumulator>, cap: number): OrderGroupRow[] {
    return Array.from(map.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, cap)
      .map((acc) => ({
        dimension: acc.dimension,
        value: acc.value,
        orders: acc.orders,
        newOrders: acc.newOrders,
        returningOrders: acc.returningOrders,
        totalRevenue: acc.totalRevenue,
        netRevenue: acc.netRevenue,
        aov: safeDivide(acc.totalRevenue, acc.orders),
      }))
  }

  return {
    range: { from: context.from, to: context.to },
    kpis: {
      totalOrders,
      newOrders: totalNewOrders,
      returningOrders: totalReturningOrders,
      newCustomerRate: safeDivide(totalNewOrders, totalOrders),
      totalRevenue,
      netRevenue: totalNetRevenue,
      aov: safeDivide(totalRevenue, totalOrders),
    },
    byUtmSource: toGroupRows(utmSourceMap, 10),
    bySource: toGroupRows(sourceMap, 8),
    byCountry: toGroupRows(countryMap, 12),
  }
}
