/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import crypto from "node:crypto"

import {
  createDirectConnector,
  fetchJsonWithRetry,
  nowIso,
  readEnv,
  readRequiredEnv,
  sleep,
} from "@/lib/connectors/common"
import { areSharedDbSupportTableWritesEnabled } from "@/lib/jobs/runtime/env"

const GA4_API_BASE = "https://analyticsdata.googleapis.com/v1beta"
const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"

function toNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function ga4DateToIso(dateStr) {
  const s = String(dateStr || "").trim()
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return s
}

function safeRate(numerator, denominator) {
  const n = toNum(numerator)
  const d = toNum(denominator)
  if (d <= 0) return 0
  return (n / d) * 100
}

function mintServiceAccountJwt(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(
    JSON.stringify({
      iss: clientEmail,
      scope: GA4_SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url")
  const unsigned = `${header}.${payload}`
  const sign = crypto.createSign("RSA-SHA256")
  sign.update(unsigned)
  const signature = sign.sign(privateKey, "base64url")
  return `${unsigned}.${signature}`
}

async function fetchAccessTokenServiceAccount(clientEmail, privateKey) {
  const jwt = mintServiceAccountJwt(clientEmail, privateKey)
  const form = new URLSearchParams()
  form.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
  form.set("assertion", jwt)
  const payload = await fetchJsonWithRetry({
    url: "https://oauth2.googleapis.com/token",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    retries: 3,
    retryDelayMs: 2500,
    label: "ga4_sa_token",
  })
  const token = String(payload?.access_token || "").trim()
  if (!token) throw new Error("GA4 service account token exchange returned no access_token")
  return token
}

async function fetchAccessTokenRefresh(env) {
  const clientId = readEnv(env, "GA4_CLIENT_ID", "") || readEnv(env, "GOOGLE_ADS_CLIENT_ID", "")
  const clientSecret =
    readEnv(env, "GA4_CLIENT_SECRET", "") || readEnv(env, "GOOGLE_ADS_CLIENT_SECRET", "")
  const refreshToken = readEnv(env, "GA4_REFRESH_TOKEN", "")
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GA4 OAuth refresh token auth requires GA4_REFRESH_TOKEN and client ID/secret")
  }
  const form = new URLSearchParams()
  form.set("client_id", clientId.trim())
  form.set("client_secret", clientSecret.trim())
  form.set("refresh_token", refreshToken.trim())
  form.set("grant_type", "refresh_token")
  const payload = await fetchJsonWithRetry({
    url: "https://oauth2.googleapis.com/token",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    retries: 3,
    retryDelayMs: 2500,
    label: "ga4_oauth_token",
  })
  const token = String(payload?.access_token || "").trim()
  if (!token) throw new Error("GA4 OAuth token exchange returned no access_token")
  return token
}

async function resolveAccessToken(env) {
  const credsJsonRaw = readEnv(env, "GA4_CREDENTIALS_JSON", "").trim()
  if (credsJsonRaw) {
    try {
      const credsJson = credsJsonRaw.replace(/\r?\n/g, " ").replace(/\s+/g, " ")
      const creds = JSON.parse(credsJson)
      const email = String(creds.client_email || "").trim()
      const key = String(creds.private_key || "")
        .trim()
        .replace(/\\n/g, "\n")
      if (email && key) return fetchAccessTokenServiceAccount(email, key)
    } catch {
      throw new Error("GA4_CREDENTIALS_JSON is set but could not be parsed as JSON")
    }
  }

  const email = readEnv(env, "GA4_CLIENT_EMAIL", "").trim()
  const key = readEnv(env, "GA4_PRIVATE_KEY", "").trim()
  if (email && key) {
    return fetchAccessTokenServiceAccount(email, key.replace(/\\n/g, "\n"))
  }

  const refreshToken = readEnv(env, "GA4_REFRESH_TOKEN", "").trim()
  if (refreshToken) return fetchAccessTokenRefresh(env)

  throw new Error(
    "GA4 auth not configured. Set GA4_CREDENTIALS_JSON (or GA4_CLIENT_EMAIL + GA4_PRIVATE_KEY), or GA4_REFRESH_TOKEN."
  )
}

async function ga4RunReport(accessToken, propertyId, body) {
  const url = `${GA4_API_BASE}/properties/${propertyId}:runReport`
  const result = await fetchJsonWithRetry({
    url,
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    retries: 3,
    retryDelayMs: 3000,
    retryStatuses: [408, 429, 500, 502, 503, 504],
    label: "ga4_run_report",
  })
  return result
}

function parseReportRows(report, dimCount, metricCount) {
  const rows = []
  for (const row of report?.rows || []) {
    const dims = (row.dimensionValues || []).map((d) => String(d.value || ""))
    const metrics = (row.metricValues || []).map((m) => toNum(m.value))
    while (dims.length < dimCount) dims.push("")
    while (metrics.length < metricCount) metrics.push(0)
    rows.push({ dims, metrics })
  }
  return rows
}

async function fetchDailyMetrics(accessToken, propertyId, from, to) {
  const body = {
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "sessions" },
      { name: "addToCarts" },
      { name: "ecommercePurchases" },
      { name: "checkouts" },
    ],
  }
  const report = await ga4RunReport(accessToken, propertyId, body)
  return parseReportRows(report, 1, 4)
}

async function fetchBreakdown(accessToken, propertyId, from, to, dimension, metric = "sessions") {
  const body = {
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: dimension }],
    metrics: [{ name: metric }],
    limit: "50",
  }
  const report = await ga4RunReport(accessToken, propertyId, body)
  return parseReportRows(report, 1, 1)
}

async function fetchDailySegmentedFunnel(accessToken, propertyId, from, to, dimension) {
  const body = {
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: "date" }, { name: dimension }],
    metrics: [
      { name: "sessions" },
      { name: "addToCarts" },
      { name: "checkouts" },
      { name: "ecommercePurchases" },
    ],
    limit: "100000",
  }
  const report = await ga4RunReport(accessToken, propertyId, body)
  return parseReportRows(report, 2, 4)
}

async function fetchProductFunnel(accessToken, propertyId, from, to) {
  const body = {
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: "itemId" }, { name: "itemName" }],
    metrics: [
      { name: "itemsViewed" },
      { name: "itemsAddedToCart" },
      { name: "itemsCheckedOut" },
      { name: "itemsPurchased" },
      { name: "itemRevenue" },
    ],
    limit: "100",
  }
  const report = await ga4RunReport(accessToken, propertyId, body)
  return parseReportRows(report, 2, 5)
}

function buildDailyRows(dailyData, syncedAt) {
  const rows = []
  for (const { dims, metrics } of dailyData) {
    const date = ga4DateToIso(dims[0])
    if (!date) continue
    const [sessions, addToCarts, purchases, checkouts] = metrics

    rows.push({
      _synced_at: syncedAt,
      dataset: "sessions",
      date,
      metric: "sessions",
      value: String(sessions),
      value_num: sessions,
      data_type: "integer",
      display_name: "Sessions",
      query: "ga4:sessions",
    })
    rows.push({
      _synced_at: syncedAt,
      dataset: "sessions",
      date,
      metric: "add_to_carts",
      value: String(addToCarts),
      value_num: addToCarts,
      data_type: "integer",
      display_name: "Add to Carts",
      query: "ga4:add_to_carts",
    })
    rows.push({
      _synced_at: syncedAt,
      dataset: "sessions",
      date,
      metric: "checkouts",
      value: String(checkouts),
      value_num: checkouts,
      data_type: "integer",
      display_name: "Checkouts",
      query: "ga4:checkouts",
    })
    rows.push({
      _synced_at: syncedAt,
      dataset: "orders",
      date,
      metric: "orders",
      value: String(purchases),
      value_num: purchases,
      data_type: "integer",
      display_name: "Orders",
      query: "ga4:orders",
    })

    rows.push({
      _synced_at: syncedAt,
      dataset: "sessions",
      date,
      metric: "conversion_rate",
      value: String(safeRate(purchases, sessions)),
      value_num: safeRate(purchases, sessions),
      data_type: "percentage",
      display_name: "Conversion Rate",
      query: "ga4:conversion_rate",
    })
    rows.push({
      _synced_at: syncedAt,
      dataset: "sessions",
      date,
      metric: "added_to_cart_rate",
      value: String(safeRate(addToCarts, sessions)),
      value_num: safeRate(addToCarts, sessions),
      data_type: "percentage",
      display_name: "Added to Cart Rate",
      query: "ga4:added_to_cart_rate",
    })
    rows.push({
      _synced_at: syncedAt,
      dataset: "sessions",
      date,
      metric: "reached_checkout_rate",
      value: String(safeRate(checkouts, sessions)),
      value_num: safeRate(checkouts, sessions),
      data_type: "percentage",
      display_name: "Reached Checkout Rate",
      query: "ga4:reached_checkout_rate",
    })
  }
  return rows
}

function buildBreakdownRows(data, breakdownId, dimension, from, to, syncedAt) {
  return data.map(({ dims, metrics }) => ({
    _synced_at: syncedAt,
    dataset: "sessions",
    start_date: from,
    end_date: to,
    breakdown_id: breakdownId,
    dimension,
    dimension_value: dims[0] || "(not set)",
    metric: "sessions",
    value: String(metrics[0]),
    value_num: metrics[0],
    data_type: "integer",
    display_name: "Sessions",
    query: `ga4:${breakdownId}`,
  }))
}

function buildDailySegmentBreakdownRows(data, breakdownId, dimension, syncedAt) {
  const metricDefs = [
    { metric: "sessions", displayName: "Sessions", querySuffix: "sessions" },
    { metric: "add_to_carts", displayName: "Add to Carts", querySuffix: "add_to_carts" },
    { metric: "checkouts", displayName: "Checkouts", querySuffix: "checkouts" },
    { metric: "purchases", displayName: "Purchases", querySuffix: "purchases" },
  ]

  const rows = []
  for (const { dims, metrics } of data) {
    const date = ga4DateToIso(dims[0])
    if (!date) continue
    const dimensionValue = String(dims[1] || "(not set)").trim() || "(not set)"
    for (let index = 0; index < metricDefs.length; index += 1) {
      const def = metricDefs[index]
      const metricValue = toNum(metrics[index])
      rows.push({
        _synced_at: syncedAt,
        dataset: "sessions",
        start_date: date,
        end_date: date,
        breakdown_id: breakdownId,
        dimension,
        dimension_value: dimensionValue,
        metric: def.metric,
        value: String(metricValue),
        value_num: metricValue,
        data_type: "integer",
        display_name: def.displayName,
        query: `ga4:${breakdownId}:${def.querySuffix}`,
      })
    }
  }
  return rows
}

function buildCatalogRows(syncedAt) {
  const metrics = ["sessions", "conversion_rate", "added_to_cart_rate", "reached_checkout_rate"]
  return metrics.map((metric) => ({
    _synced_at: syncedAt,
    dataset: "sessions",
    metric,
    status: "supported",
    sample_query: "ga4",
    message: "",
  }))
}

function buildDimensionsCatalogRows(syncedAt) {
  const dims = [
    { dimension: "landing_page", dataset: "sessions" },
    { dimension: "country", dataset: "sessions" },
    { dimension: "device", dataset: "sessions" },
    { dimension: "referrer", dataset: "sessions" },
    { dimension: "channel", dataset: "sessions" },
    { dimension: "customer_type", dataset: "sessions" },
    { dimension: "new_vs_returning", dataset: "sessions" },
  ]
  return dims.map((d) => ({
    _synced_at: syncedAt,
    dataset: d.dataset,
    dimension: d.dimension,
    status: "supported",
    sample_query: "ga4",
    message: "",
  }))
}

function buildProductFunnelRows(data, from, to, syncedAt) {
  return data.map(({ dims, metrics }) => {
    const [views, addToCarts, checkouts, purchases, revenue] = metrics
    return {
      _synced_at: syncedAt,
      start_date: from,
      end_date: to,
      item_id: dims[0] || "",
      item_name: dims[1] || "",
      views,
      add_to_carts: addToCarts,
      checkouts,
      purchases,
      revenue,
      view_to_atc_rate: safeRate(addToCarts, views),
      atc_to_checkout_rate: safeRate(checkouts, addToCarts),
      checkout_to_purchase_rate: safeRate(purchases, checkouts),
      view_to_purchase_rate: safeRate(purchases, views),
      query: "ga4:product_funnel",
    }
  })
}

async function pullGa4Tables(ctx) {
  const propertyId = readRequiredEnv(ctx.env, "GA4_PROPERTY_ID").trim()
  const accessToken = await resolveAccessToken(ctx.env)
  const syncedAt = nowIso()
  const sharedSupportTableWritesEnabled = areSharedDbSupportTableWritesEnabled(ctx.env)

  const dailyData = await fetchDailyMetrics(accessToken, propertyId, ctx.from, ctx.to)
  await sleep(200)

  const landingPageData = await fetchBreakdown(
    accessToken,
    propertyId,
    ctx.from,
    ctx.to,
    "landingPage"
  )
  await sleep(200)

  const locationData = await fetchBreakdown(accessToken, propertyId, ctx.from, ctx.to, "country")
  await sleep(200)

  const deviceData = await fetchBreakdown(
    accessToken,
    propertyId,
    ctx.from,
    ctx.to,
    "deviceCategory"
  )
  await sleep(200)

  const referrerData = await fetchBreakdown(
    accessToken,
    propertyId,
    ctx.from,
    ctx.to,
    "sessionDefaultChannelGroup"
  )
  await sleep(200)

  const dailyByChannel = await fetchDailySegmentedFunnel(
    accessToken,
    propertyId,
    ctx.from,
    ctx.to,
    "sessionDefaultChannelGroup"
  )
  await sleep(200)

  const dailyByDevice = await fetchDailySegmentedFunnel(
    accessToken,
    propertyId,
    ctx.from,
    ctx.to,
    "deviceCategory"
  )
  await sleep(200)

  const dailyByCountry = await fetchDailySegmentedFunnel(
    accessToken,
    propertyId,
    ctx.from,
    ctx.to,
    "country"
  )
  await sleep(200)

  const dailyByCustomerType = await fetchDailySegmentedFunnel(
    accessToken,
    propertyId,
    ctx.from,
    ctx.to,
    "newVsReturning"
  )
  await sleep(200)

  const productData = await fetchProductFunnel(accessToken, propertyId, ctx.from, ctx.to)

  const dailyRows = buildDailyRows(dailyData, syncedAt)
  const breakdownRows = [
    ...buildBreakdownRows(
      landingPageData,
      "sessions_by_landing_page",
      "landing_page",
      ctx.from,
      ctx.to,
      syncedAt
    ),
    ...buildBreakdownRows(
      locationData,
      "sessions_by_location",
      "country",
      ctx.from,
      ctx.to,
      syncedAt
    ),
    ...buildBreakdownRows(
      deviceData,
      "sessions_by_device",
      "device",
      ctx.from,
      ctx.to,
      syncedAt
    ),
    ...buildBreakdownRows(
      referrerData,
      "sessions_by_referrer",
      "referrer",
      ctx.from,
      ctx.to,
      syncedAt
    ),
    ...buildDailySegmentBreakdownRows(
      dailyByChannel,
      "funnel_daily_by_channel",
      "channel",
      syncedAt
    ),
    ...buildDailySegmentBreakdownRows(
      dailyByDevice,
      "funnel_daily_by_device",
      "device",
      syncedAt
    ),
    ...buildDailySegmentBreakdownRows(
      dailyByCountry,
      "funnel_daily_by_country",
      "country",
      syncedAt
    ),
    ...buildDailySegmentBreakdownRows(
      dailyByCustomerType,
      "funnel_daily_by_customer_type",
      "customer_type",
      syncedAt
    ),
  ]
  const productFunnelRows = buildProductFunnelRows(productData, ctx.from, ctx.to, syncedAt)

  const tables = {
    RAW_SHOPIFY_ANALYTICS_DAILY: dailyRows,
    RAW_SHOPIFY_ANALYTICS_BREAKDOWNS: breakdownRows,
    RAW_GA4_PRODUCT_FUNNEL: productFunnelRows,
  }

  if (sharedSupportTableWritesEnabled) {
    tables.RAW_SHOPIFY_ANALYTICS_CATALOG = buildCatalogRows(syncedAt)
    tables.RAW_SHOPIFY_ANALYTICS_DIMENSIONS_CATALOG =
      buildDimensionsCatalogRows(syncedAt)
  }

  const metadata = {
    property_id: propertyId,
    daily_rows: dailyRows.length,
    breakdown_rows: breakdownRows.length,
    segmented_channel_rows: dailyByChannel.length,
    segmented_device_rows: dailyByDevice.length,
    segmented_country_rows: dailyByCountry.length,
    segmented_customer_type_rows: dailyByCustomerType.length,
    product_funnel_rows: productFunnelRows.length,
    support_table_writes_mode: sharedSupportTableWritesEnabled ? "shared" : "owned",
  }

  return { tables, cursor: ctx.to, metadata }
}

function getGa4ConfigStatus(env) {
  const missing = []

  if (!String(env.GA4_PROPERTY_ID || "").trim()) {
    missing.push("GA4_PROPERTY_ID")
  }

  const hasCredentialsJson = Boolean(String(env.GA4_CREDENTIALS_JSON || "").trim())
  const hasServiceAccountPair =
    Boolean(String(env.GA4_CLIENT_EMAIL || "").trim()) &&
    Boolean(String(env.GA4_PRIVATE_KEY || "").trim())
  const hasRefreshToken = Boolean(String(env.GA4_REFRESH_TOKEN || "").trim())
  const hasRefreshClient =
    (Boolean(String(env.GA4_CLIENT_ID || "").trim()) ||
      Boolean(String(env.GOOGLE_ADS_CLIENT_ID || "").trim())) &&
    (Boolean(String(env.GA4_CLIENT_SECRET || "").trim()) ||
      Boolean(String(env.GOOGLE_ADS_CLIENT_SECRET || "").trim()))

  if (!hasCredentialsJson && !hasServiceAccountPair && !(hasRefreshToken && hasRefreshClient)) {
    missing.push(
      "GA4 auth: GA4_CREDENTIALS_JSON or GA4_CLIENT_EMAIL+GA4_PRIVATE_KEY or GA4_REFRESH_TOKEN+GA4_CLIENT_ID+GA4_CLIENT_SECRET"
    )
  }

  return {
    configured: missing.length === 0,
    missing,
    required: ["GA4_PROPERTY_ID"],
  }
}

const baseGa4Connector = createDirectConnector({
  name: "ga4",
  tableKeys: [
    "RAW_SHOPIFY_ANALYTICS_DAILY",
    "RAW_SHOPIFY_ANALYTICS_BREAKDOWNS",
    "RAW_SHOPIFY_ANALYTICS_CATALOG",
    "RAW_SHOPIFY_ANALYTICS_DIMENSIONS_CATALOG",
    "RAW_GA4_PRODUCT_FUNNEL",
  ],
  requiredEnvKeys: ["GA4_PROPERTY_ID"],
  async syncWindow(ctx) {
    return pullGa4Tables(ctx)
  },
  async backfillWindow(ctx) {
    return pullGa4Tables(ctx)
  },
})

export const ga4Connector = {
  ...baseGa4Connector,
  getConfigStatus(env) {
    return getGa4ConfigStatus(env)
  },
}
