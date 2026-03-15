/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import {
  createDirectConnector,
  fetchJsonWithRetry,
  nowIso,
  readEnv,
  readRequiredEnv,
  sleep,
} from "@/lib/connectors/common"
import { normalizeDate } from "@/lib/connectors/common/rows"
import { areSharedDbSupportTableWritesEnabled } from "@/lib/jobs/runtime/env"

const SHOPIFY_DEFAULT_API_VERSION = "2025-01"
const SHOPIFY_PAGE_LIMIT = 250
const SHOPIFY_RETRY_STATUS = [408, 409, 425, 429, 500, 502, 503, 504]

function toNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeLineItemId(value) {
  const raw = String(value ?? "").trim()
  if (!raw) return ""

  const gidMatch = raw.match(/LineItem\/(\d+)$/i)
  if (gidMatch) return gidMatch[1]

  if (/^\d+(\.0+)?$/.test(raw)) return raw.replace(/\.0+$/, "")

  return raw
}

function parseBool(value, fallback = false) {
  const raw = String(value ?? "").trim().toLowerCase()
  if (!raw) return fallback
  return raw === "1" || raw === "true" || raw === "yes"
}

function normalizeShopDomain(domain) {
  return String(domain || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
}

function parseLinkHeader(linkHeader = "") {
  const match = String(linkHeader || "").match(/<([^>]+)>;\s*rel="?next"?/i)
  return match ? String(match[1] || "").trim() : ""
}

function parseQueryString(rawUrl = "") {
  try {
    const url = new URL(rawUrl, "https://example.com")
    return Object.fromEntries(url.searchParams.entries())
  } catch {
    return {}
  }
}

function parseShipping(order) {
  const v1 = order?.total_shipping_price_set?.shop_money?.amount
  const v2 = order?.current_total_shipping_price_set?.shop_money?.amount
  const v3 = order?.total_shipping_price
  const parsed = Number(v1 ?? v2 ?? v3 ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function parseRefunded(order) {
  let total = 0
  for (const refund of order?.refunds || []) {
    let txTotal = 0
    for (const txn of refund?.transactions || []) {
      txTotal += toNum(txn?.amount)
    }
    let lineTotal = 0
    for (const item of refund?.refund_line_items || []) {
      lineTotal += toNum(item?.subtotal)
      lineTotal += toNum(item?.total_tax)
    }
    total += lineTotal > 0 ? lineTotal : txTotal
  }
  return total
}

function parseRefundLineItemId(refundLineItem) {
  const direct = normalizeLineItemId(refundLineItem?.line_item_id)
  if (direct) return direct
  const nested = normalizeLineItemId(refundLineItem?.line_item?.id)
  return nested
}

function parseRefundLineItemTotals(refundLineItem) {
  const quantityRaw = refundLineItem?.quantity ?? refundLineItem?.line_item?.quantity
  const quantity = Math.max(0, toNum(quantityRaw))

  const subtotalRaw = toNum(
    refundLineItem?.subtotal ??
      refundLineItem?.subtotal_set?.shop_money?.amount ??
      refundLineItem?.subtotal_set?.presentment_money?.amount
  )
  const taxRaw = toNum(
    refundLineItem?.total_tax ??
      refundLineItem?.total_tax_set?.shop_money?.amount ??
      refundLineItem?.total_tax_set?.presentment_money?.amount
  )
  const totalRaw = toNum(
    refundLineItem?.total ??
      refundLineItem?.total_set?.shop_money?.amount ??
      refundLineItem?.total_set?.presentment_money?.amount
  )
  const total = totalRaw > 0 ? totalRaw : subtotalRaw + taxRaw
  const subtotal = subtotalRaw > 0 ? subtotalRaw : Math.max(0, total - taxRaw)
  const tax = taxRaw > 0 ? taxRaw : Math.max(0, total - subtotal)

  return {
    quantity,
    subtotal,
    tax,
    total,
  }
}

export function parseRefundLineItemsByLineId(order) {
  const out = new Map()
  for (const refund of order?.refunds || []) {
    for (const refundLineItem of refund?.refund_line_items || []) {
      const lineItemId = parseRefundLineItemId(refundLineItem)
      if (!lineItemId) continue
      const parsed = parseRefundLineItemTotals(refundLineItem)
      const existing = out.get(lineItemId) || {
        refunded_quantity: 0,
        refund_subtotal: 0,
        refund_tax: 0,
        refund_total: 0,
      }
      existing.refunded_quantity += parsed.quantity
      existing.refund_subtotal += parsed.subtotal
      existing.refund_tax += parsed.tax
      existing.refund_total += parsed.total
      out.set(lineItemId, existing)
    }
  }
  return out
}

function toIsoDateRange(from, to) {
  const fromIso = String(from || "").trim()
  const toIso = String(to || "").trim()
  if (!fromIso || !toIso) return { fromAt: "", toAt: "" }
  return {
    fromAt: `${fromIso}T00:00:00Z`,
    toAt: `${toIso}T23:59:59Z`,
  }
}

async function shopifyJsonRequest(url, token, label) {
  const response = await fetchJsonWithRetry({
    url,
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    retries: 3,
    retryDelayMs: 2500,
    retryStatuses: SHOPIFY_RETRY_STATUS,
    label,
    returnMeta: true,
  })
  return response
}

async function refreshShopifyAccessToken(domain, env) {
  const clientId = readEnv(env, "SHOPIFY_CLIENT_ID", "").trim()
  const clientSecret = readEnv(env, "SHOPIFY_CLIENT_SECRET", "").trim()
  if (!clientId || !clientSecret) return ""
  const url = `https://${domain}/admin/oauth/access_token`
  const body = new URLSearchParams()
  body.set("grant_type", "client_credentials")
  body.set("client_id", clientId)
  body.set("client_secret", clientSecret)
  const payload = await fetchJsonWithRetry({
    url,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    retries: 2,
    retryDelayMs: 2000,
    label: "shopify_token_refresh",
  })
  const token = String(payload?.access_token || "").trim()
  return token
}

function buildOrderUrl(baseUrl, from, to, ctx = {}) {
  const url = new URL(`${baseUrl}/orders.json`)
  url.searchParams.set("status", "any")
  url.searchParams.set("limit", String(SHOPIFY_PAGE_LIMIT))
  url.searchParams.set("order", "created_at asc")

  if ((ctx.reconcile === true || ctx.mode === "reconcile") && ctx.updatedSince) {
    url.searchParams.set("updated_at_min", `${ctx.updatedSince}T00:00:00Z`)
  } else {
    const { fromAt, toAt } = toIsoDateRange(from, to)
    if (fromAt) url.searchParams.set("created_at_min", fromAt)
    if (toAt) url.searchParams.set("created_at_max", toAt)
  }
  url.searchParams.set(
    "fields",
    [
      "id",
      "order_number",
      "created_at",
      "updated_at",
      "financial_status",
      "fulfillment_status",
      "total_price",
      "subtotal_price",
      "total_tax",
      "total_discounts",
      "currency",
      "customer",
      "billing_address",
      "shipping_address",
      "source_name",
      "landing_site",
      "referring_site",
      "discount_codes",
      "tags",
      "line_items",
      "refunds",
      "total_shipping_price_set",
      "current_total_shipping_price_set",
      "total_shipping_price",
    ].join(",")
  )
  return url.toString()
}

async function fetchShopifyOrdersWindow(baseUrl, token, from, to, ctx = {}) {
  const orders = []
  let nextUrl = buildOrderUrl(baseUrl, from, to, ctx)
  let guard = 0

  while (nextUrl) {
    guard += 1
    if (guard > 2000) {
      throw new Error("Shopify pagination exceeded hard limit (2000 pages)")
    }
    const { json, headers } = await shopifyJsonRequest(nextUrl, token, "shopify_orders")
    const pageOrders = Array.isArray(json?.orders) ? json.orders : []
    orders.push(...pageOrders)
    const linkHeader = headers?.get?.("link") || headers?.get?.("Link") || ""
    nextUrl = parseLinkHeader(linkHeader)
    if (nextUrl) {
      await sleep(300)
    }
  }

  return orders
}

async function fetchVariantsById(baseUrl, token, variantIds) {
  const out = new Map()
  const ids = Array.from(
    new Set((variantIds || []).map((id) => String(id || "").trim()).filter(Boolean))
  )
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100)
    const url = new URL(`${baseUrl}/variants.json`)
    url.searchParams.set("ids", batch.join(","))
    url.searchParams.set("fields", "id,inventory_item_id")
    const { json } = await shopifyJsonRequest(url.toString(), token, "shopify_variants")
    for (const variant of json?.variants || []) {
      const variantId = String(variant?.id || "").trim()
      if (!variantId) continue
      out.set(variantId, String(variant?.inventory_item_id || "").trim())
    }
    await sleep(250)
  }
  return out
}

async function fetchInventoryCosts(baseUrl, token, inventoryItemIds) {
  const out = new Map()
  const ids = Array.from(
    new Set((inventoryItemIds || []).map((id) => String(id || "").trim()).filter(Boolean))
  )
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100)
    const url = new URL(`${baseUrl}/inventory_items.json`)
    url.searchParams.set("ids", batch.join(","))
    url.searchParams.set("fields", "id,cost")
    const { json } = await shopifyJsonRequest(url.toString(), token, "shopify_inventory_items")
    for (const item of json?.inventory_items || []) {
      const id = String(item?.id || "").trim()
      if (!id) continue
      out.set(id, toNum(item?.cost))
    }
    await sleep(250)
  }
  return out
}

export function deriveOrderRows(order, syncedAt) {
  const orderId = String(order?.id || "").trim()
  if (!orderId) return null
  const landing = String(order?.landing_site || "").trim()
  const qs = parseQueryString(landing)
  const customerId = String(order?.customer?.id || "").trim()
  const shippingCountry = String(order?.shipping_address?.country || "").trim()
  const billingCountry = String(order?.billing_address?.country || "").trim()
  const utmSource =
    String(qs.utm_source || "").trim() ||
    (String(order?.referring_site || "").trim() ? "referral" : "")
  const utmMedium = String(qs.utm_medium || "").trim()
  const utmCampaign = String(qs.utm_campaign || "").trim()
  const discountCodes = Array.isArray(order?.discount_codes)
    ? order.discount_codes.map((d) => String(d?.code || "").trim()).filter(Boolean).join(", ")
    : ""
  const createdDate = normalizeDate(order?.created_at)
  const itemCount = (order?.line_items || []).reduce(
    (sum, item) => sum + toNum(item?.quantity),
    0
  )
  const shipping = parseShipping(order)
  const totalRefunded = parseRefunded(order)

  return {
    raw: {
      _synced_at: syncedAt,
      order_id: orderId,
      order_number: String(order?.order_number || "").trim(),
      created_at: String(order?.created_at || ""),
      updated_at: String(order?.updated_at || ""),
      financial_status: String(order?.financial_status || ""),
      fulfillment_status: String(order?.fulfillment_status || ""),
      total_price: toNum(order?.total_price),
      subtotal_price: toNum(order?.subtotal_price),
      total_tax: toNum(order?.total_tax),
      total_discounts: toNum(order?.total_discounts),
      total_refunded: totalRefunded,
      currency: String(order?.currency || ""),
      customer_id: customerId,
      billing_country: billingCountry,
      shipping_country: shippingCountry,
      source_name: String(order?.source_name || ""),
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      discount_codes: discountCodes,
      tags: String(order?.tags || ""),
      total_shipping_charged: shipping,
      total_payment_fees: 0,
    },
    fact: {
      order_id: orderId,
      order_date: createdDate,
      order_date_local: createdDate,
      customer_id: customerId,
      total_revenue: toNum(order?.total_price),
      subtotal: toNum(order?.subtotal_price),
      tax: toNum(order?.total_tax),
      discounts: toNum(order?.total_discounts),
      total_refunded: totalRefunded,
      net_revenue: toNum(order?.total_price) - totalRefunded,
      item_count: itemCount,
      source: String(order?.source_name || ""),
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      country: shippingCountry || billingCountry || "",
      is_first_order: 0,
      shipping_cost: shipping,
      payment_fees: 0,
    },
  }
}

export function deriveLineItemRows(
  order,
  syncedAt,
  variantToInventoryItem,
  inventoryCostByItem,
  refundByLineItemId = new Map()
) {
  const rows = []
  const orderId = String(order?.id || "").trim()
  const orderDate = normalizeDate(order?.created_at)
  for (const lineItem of order?.line_items || []) {
    const lineItemId = normalizeLineItemId(lineItem?.id)
    if (!lineItemId) continue
    const variantId = String(lineItem?.variant_id || "").trim()
    const inventoryItemId = variantId ? String(variantToInventoryItem.get(variantId) || "") : ""
    const unitCost = inventoryItemId ? toNum(inventoryCostByItem.get(inventoryItemId) || 0) : 0
    const quantity = toNum(lineItem?.quantity)
    const price = toNum(lineItem?.price)
    const discount = toNum(lineItem?.total_discount)
    const lineTotal = price * quantity - discount
    const lineCost = unitCost * quantity
    const grossProfit = lineTotal - lineCost
    const marginPct = lineTotal > 0 ? grossProfit / lineTotal : 0
    const refund = refundByLineItemId.get(lineItemId) || {
      refunded_quantity: 0,
      refund_subtotal: 0,
      refund_tax: 0,
      refund_total: 0,
    }
    const qtyRefunded = Math.max(0, toNum(refund.refunded_quantity))
    const refundSubtotal = Math.max(0, toNum(refund.refund_subtotal))
    const refundTax = Math.max(0, toNum(refund.refund_tax))
    const refundTotal = Math.max(0, toNum(refund.refund_total))
    const netQuantity = Math.max(0, quantity - qtyRefunded)
    const netLineTotal = Math.max(0, lineTotal - refundSubtotal)
    const taxAmount = Array.isArray(lineItem?.tax_lines)
      ? lineItem.tax_lines.reduce((sum, t) => sum + toNum(t?.price), 0)
      : 0

    rows.push({
      raw: {
        _synced_at: syncedAt,
        line_item_id: lineItemId,
        order_id: orderId,
        product_id: String(lineItem?.product_id || ""),
        variant_id: variantId,
        sku: String(lineItem?.sku || ""),
        title: String(lineItem?.title || ""),
        variant_title: String(lineItem?.variant_title || ""),
        quantity,
        price,
        total_discount: discount,
        tax_amount: taxAmount,
        inventory_item_id: inventoryItemId,
        unit_cost: unitCost,
        refunded_quantity: qtyRefunded,
        refund_subtotal: refundSubtotal,
        refund_tax: refundTax,
        refund_total: refundTotal,
      },
      fact: {
        line_item_id: lineItemId,
        order_id: orderId,
        order_date: orderDate,
        product_id: String(lineItem?.product_id || ""),
        variant_id: variantId,
        sku: String(lineItem?.sku || ""),
        product_name: String(lineItem?.title || ""),
        variant_name: String(lineItem?.variant_title || ""),
        quantity,
        unit_price: price,
        line_total: lineTotal,
        discount,
        unit_cost: unitCost,
        line_cost: lineCost,
        gross_profit: grossProfit,
        margin_pct: marginPct,
        qty_refunded: qtyRefunded,
        refund_amount: refundSubtotal,
        net_quantity: netQuantity,
        net_line_total: netLineTotal,
      },
    })
  }
  return rows
}

async function queryExistingFirstOrderDates(client, workspaceId, customerIds) {
  const out = new Map()
  const ids = Array.from(
    new Set((customerIds || []).map((v) => String(v || "").trim()).filter(Boolean))
  )
  if (!ids.length) return out
  for (let index = 0; index < ids.length; index += 250) {
    const batch = ids.slice(index, index + 250)
    const placeholders = batch.map(() => "?").join(", ")
    const result = await client.execute({
      sql: `
        SELECT customer_id, MIN(order_date) AS first_date
        FROM fact_orders
        WHERE workspace_id = ? AND customer_id IN (${placeholders})
        GROUP BY customer_id
      `,
      args: [workspaceId, ...batch],
    })
    for (const row of result.rows || []) {
      const customerId = String(row?.customer_id || "").trim()
      const firstDate = normalizeDate(row?.first_date)
      if (!customerId || !firstDate) continue
      out.set(customerId, firstDate)
    }
  }
  return out
}

async function queryExistingOrderFlags(client, workspaceId, orderIds) {
  const out = new Map()
  const ids = Array.from(
    new Set((orderIds || []).map((v) => String(v || "").trim()).filter(Boolean))
  )
  if (!ids.length) return out
  for (let index = 0; index < ids.length; index += 300) {
    const batch = ids.slice(index, index + 300)
    const placeholders = batch.map(() => "?").join(", ")
    const result = await client.execute({
      sql: `
        SELECT order_id, is_first_order
        FROM fact_orders
        WHERE workspace_id = ? AND order_id IN (${placeholders})
      `,
      args: [workspaceId, ...batch],
    })
    for (const row of result.rows || []) {
      const orderId = String(row?.order_id || "").trim()
      if (!orderId) continue
      out.set(orderId, toNum(row?.is_first_order) > 0 ? 1 : 0)
    }
  }
  return out
}

async function applyFirstOrderFlags(client, workspaceId, factOrders) {
  const customerIds = factOrders
    .map((row) => String(row?.customer_id || "").trim())
    .filter(Boolean)
  const orderIds = factOrders.map((row) => String(row?.order_id || "").trim()).filter(Boolean)
  const existingFirstByCustomer = await queryExistingFirstOrderDates(
    client,
    workspaceId,
    customerIds
  )
  const existingFlagByOrder = await queryExistingOrderFlags(client, workspaceId, orderIds)

  const incomingFirstByCustomer = new Map()
  for (const row of factOrders) {
    const customerId = String(row?.customer_id || "").trim()
    const orderDate = normalizeDate(row?.order_date)
    if (!customerId || !orderDate) continue
    const current = incomingFirstByCustomer.get(customerId)
    if (!current || orderDate < current) {
      incomingFirstByCustomer.set(customerId, orderDate)
    }
  }

  for (const row of factOrders) {
    const orderId = String(row?.order_id || "").trim()
    if (existingFlagByOrder.has(orderId)) {
      row.is_first_order = existingFlagByOrder.get(orderId)
      continue
    }
    const customerId = String(row?.customer_id || "").trim()
    const orderDate = normalizeDate(row?.order_date)
    if (!customerId || !orderDate) {
      row.is_first_order = 0
      continue
    }
    const existingFirst = existingFirstByCustomer.get(customerId)
    if (existingFirst && existingFirst <= orderDate) {
      row.is_first_order = 0
      continue
    }
    const incomingFirst = incomingFirstByCustomer.get(customerId) || orderDate
    row.is_first_order = incomingFirst === orderDate ? 1 : 0
  }
}

async function fetchShopifyMarkets(baseUrl, token, syncedAt) {
  try {
    const { json } = await shopifyJsonRequest(
      `${baseUrl}/markets.json?limit=250`,
      token,
      "shopify_markets"
    )
    const markets = Array.isArray(json?.markets) ? json.markets : []
    return markets
      .map((market) => ({
        _synced_at: syncedAt,
        market_id: String(market?.id || "").trim(),
        name: String(market?.name || ""),
        handle: String(market?.handle || ""),
        status: String(market?.enabled === true ? "active" : market?.status || ""),
        type: String(market?.type || ""),
        catalogs_count: Array.isArray(market?.catalogs) ? market.catalogs.length : 0,
      }))
      .filter((row) => row.market_id)
  } catch {
    return []
  }
}

async function fetchShopifyInventorySnapshot(baseUrl, token, syncedAt, snapshotDate) {
  const byVariant = []
  const statuses = ["active", "draft", "archived"]
  for (const status of statuses) {
    let nextUrl = `${baseUrl}/products.json?limit=${SHOPIFY_PAGE_LIMIT}&status=${encodeURIComponent(
      status
    )}&fields=${encodeURIComponent(
      "id,title,status,product_type,vendor,handle,published_at,created_at,updated_at,variants"
    )}`
    let pages = 0
    while (nextUrl) {
      pages += 1
      if (pages > 2000) break
      const { json, headers } = await shopifyJsonRequest(
        nextUrl,
        token,
        "shopify_inventory_products"
      )
      const products = Array.isArray(json?.products) ? json.products : []
      for (const product of products) {
        for (const variant of product?.variants || []) {
          byVariant.push({
            product_id: String(product?.id || ""),
            product_title: String(product?.title || ""),
            product_status: String(product?.status || status || ""),
            product_type: String(product?.product_type || ""),
            vendor: String(product?.vendor || ""),
            handle: String(product?.handle || ""),
            variant_id: String(variant?.id || ""),
            variant_title: String(variant?.title || ""),
            sku: String(variant?.sku || ""),
            barcode: String(variant?.barcode || ""),
            inventory_item_id: String(variant?.inventory_item_id || ""),
            tracked:
              String(variant?.inventory_management || "").toLowerCase() === "shopify"
                ? "true"
                : "false",
            inventory_policy: String(variant?.inventory_policy || ""),
            price: toNum(variant?.price),
            compare_at_price: toNum(variant?.compare_at_price),
            product_published_at: String(product?.published_at || ""),
            product_created_at: String(product?.created_at || ""),
            product_updated_at: String(product?.updated_at || ""),
          })
        }
      }
      const linkHeader = headers?.get?.("link") || headers?.get?.("Link") || ""
      nextUrl = parseLinkHeader(linkHeader)
      if (nextUrl) await sleep(250)
    }
  }

  if (!byVariant.length) return []

  const inventoryItemIds = Array.from(
    new Set(byVariant.map((row) => String(row.inventory_item_id || "").trim()).filter(Boolean))
  )
  const totalsByItem = new Map()
  const locationTotalsByItem = new Map()
  for (let index = 0; index < inventoryItemIds.length; index += 100) {
    const batch = inventoryItemIds.slice(index, index + 100)
    let nextUrl = `${baseUrl}/inventory_levels.json?limit=${SHOPIFY_PAGE_LIMIT}&inventory_item_ids=${encodeURIComponent(
      batch.join(",")
    )}`
    let pageGuard = 0
    while (nextUrl) {
      pageGuard += 1
      if (pageGuard > 2000) break
      const { json, headers } = await shopifyJsonRequest(
        nextUrl,
        token,
        "shopify_inventory_levels"
      )
      for (const level of json?.inventory_levels || []) {
        const itemId = String(level?.inventory_item_id || "").trim()
        const locationId = String(level?.location_id || "").trim()
        const available = toNum(level?.available)
        if (!itemId) continue
        totalsByItem.set(itemId, toNum(totalsByItem.get(itemId)) + available)
        const itemLocations = locationTotalsByItem.get(itemId) || new Map()
        itemLocations.set(locationId, toNum(itemLocations.get(locationId)) + available)
        locationTotalsByItem.set(itemId, itemLocations)
      }
      const linkHeader = headers?.get?.("link") || headers?.get?.("Link") || ""
      nextUrl = parseLinkHeader(linkHeader)
      if (nextUrl) await sleep(250)
    }
  }

  return byVariant
    .filter((row) => row.variant_id)
    .map((row) => {
      const itemId = String(row.inventory_item_id || "").trim()
      const locationMap = itemId ? locationTotalsByItem.get(itemId) || new Map() : new Map()
      const locationsJson = Array.from(locationMap.entries()).map(
        ([location_id, available]) => ({
          location_id,
          available,
        })
      )
      return {
        _synced_at: syncedAt,
        snapshot_date: snapshotDate,
        product_id: row.product_id,
        product_title: row.product_title,
        product_status: row.product_status,
        product_type: row.product_type,
        vendor: row.vendor,
        handle: row.handle,
        variant_id: row.variant_id,
        variant_title: row.variant_title,
        sku: row.sku,
        barcode: row.barcode,
        inventory_item_id: itemId,
        tracked: row.tracked,
        inventory_policy: row.inventory_policy,
        price: row.price,
        compare_at_price: row.compare_at_price,
        available_quantity: itemId ? toNum(totalsByItem.get(itemId)) : 0,
        location_count: locationsJson.length,
        locations_json: locationsJson.length ? JSON.stringify(locationsJson) : "",
        product_published_at: row.product_published_at,
        product_created_at: row.product_created_at,
        product_updated_at: row.product_updated_at,
      }
    })
}

async function pullShopifyTables(ctx) {
  const domain = normalizeShopDomain(readRequiredEnv(ctx.env, "SHOPIFY_STORE_DOMAIN"))
  let token = readRequiredEnv(ctx.env, "SHOPIFY_ACCESS_TOKEN")
  const apiVersion =
    readEnv(ctx.env, "SHOPIFY_API_VERSION", SHOPIFY_DEFAULT_API_VERSION).trim() ||
    SHOPIFY_DEFAULT_API_VERSION
  const sharedSupportTableWritesEnabled = areSharedDbSupportTableWritesEnabled(ctx.env)
  const baseUrl = `https://${domain}/admin/api/${apiVersion}`
  const syncedAt = nowIso()

  let orders = []
  try {
    orders = await fetchShopifyOrdersWindow(baseUrl, token, ctx.from, ctx.to, ctx)
  } catch (error) {
    const message = String(error?.message || "")
    const isUnauthorized =
      message.includes("(401)") ||
      /invalid api key|invalid access token|wrong password|unauthorized/i.test(message)
    if (!isUnauthorized) throw error
    const refreshed = await refreshShopifyAccessToken(domain, ctx.env)
    if (!refreshed) throw error
    token = refreshed
    orders = await fetchShopifyOrdersWindow(baseUrl, token, ctx.from, ctx.to, ctx)
  }

  const variantIds = []
  for (const order of orders) {
    for (const lineItem of order?.line_items || []) {
      const variantId = String(lineItem?.variant_id || "").trim()
      if (variantId) variantIds.push(variantId)
    }
  }

  const variantToInventoryItem = await fetchVariantsById(baseUrl, token, variantIds)
  const inventoryItemIds = Array.from(
    new Set(
      Array.from(variantToInventoryItem.values())
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  )
  const inventoryCostByItem = await fetchInventoryCosts(baseUrl, token, inventoryItemIds)

  const rawOrders = []
  const rawLineItems = []
  const factOrders = []
  const factOrderItems = []

  for (const order of orders) {
    const derived = deriveOrderRows(order, syncedAt)
    if (!derived) continue
    rawOrders.push(derived.raw)
    factOrders.push(derived.fact)
    const refundByLineItemId = parseRefundLineItemsByLineId(order)
    const lineRows = deriveLineItemRows(
      order,
      syncedAt,
      variantToInventoryItem,
      inventoryCostByItem,
      refundByLineItemId
    )
    for (const row of lineRows) {
      rawLineItems.push(row.raw)
      factOrderItems.push(row.fact)
    }
  }

  await applyFirstOrderFlags(ctx.client, ctx.workspaceId, factOrders)

  const tables = {
    RAW_SHOPIFY_ORDERS: rawOrders,
    RAW_SHOPIFY_LINE_ITEMS: rawLineItems,
    FACT_ORDERS: factOrders,
    FACT_ORDER_ITEMS: factOrderItems,
  }

  if (sharedSupportTableWritesEnabled) {
    const markets = await fetchShopifyMarkets(baseUrl, token, syncedAt)

    if (markets.length) {
      tables.RAW_SHOPIFY_MARKETS = markets
    }
  }

  const inventorySyncEnabled = parseBool(
    readEnv(ctx.env, "SHOPIFY_SYNC_INVENTORY", "1"),
    true
  )
  if (inventorySyncEnabled) {
    const snapshotDate = normalizeDate(ctx.to) || normalizeDate(new Date().toISOString())
    const inventoryRows = await fetchShopifyInventorySnapshot(
      baseUrl,
      token,
      syncedAt,
      snapshotDate
    )
    if (inventoryRows.length) {
      tables.RAW_SHOPIFY_INVENTORY_LEVELS = inventoryRows
    }
  }

  const metadata = {
    api_version: apiVersion,
    fetched_orders: orders.length,
    fetched_line_items: rawLineItems.length,
    inventory_sync_enabled: inventorySyncEnabled,
    support_table_writes_mode: sharedSupportTableWritesEnabled ? "shared" : "owned",
    note:
      "Shopify analytics datasets are not pulled by default in direct mode. Use order/fact tables plus inventory sync.",
  }

  return {
    tables,
    cursor: ctx.to,
    metadata,
  }
}

export const shopifyConnector = createDirectConnector({
  name: "shopify",
  tableKeys: [
    "RAW_SHOPIFY_ORDERS",
    "RAW_SHOPIFY_LINE_ITEMS",
    "RAW_SHOPIFY_INVENTORY_LEVELS",
    "RAW_SHOPIFY_MARKETS",
    "FACT_ORDERS",
    "FACT_ORDER_ITEMS",
  ],
  requiredEnvKeys: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ACCESS_TOKEN"],
  async syncWindow(ctx) {
    return pullShopifyTables(ctx)
  },
  async backfillWindow(ctx) {
    return pullShopifyTables(ctx)
  },
})
