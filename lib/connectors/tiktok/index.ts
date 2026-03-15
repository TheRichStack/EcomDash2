/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { buildChangedBudgetHistoryRows } from "@/lib/connectors/common/budget-history"
import {
  createDirectConnector,
  fetchJsonWithRetry,
  nowIso,
  readEnv,
  readRequiredEnv,
  sleep,
} from "@/lib/connectors/common"
import { normalizeDate } from "@/lib/connectors/common/rows"

const TIKTOK_DEFAULT_API_VERSION = "v1.3"
const TIKTOK_MAX_DAY_SPAN = 30
const TIKTOK_PAGE_SIZE = 1000

function toNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function parseTikTokAdvertiserId(value) {
  const raw = String(value || "").trim()
  if (!raw) return { advertiserId: "", isScientificNotation: false }
  if (/^\d+$/.test(raw)) {
    return { advertiserId: raw, isScientificNotation: false }
  }
  if (/[eE][+-]?\d+/.test(raw)) {
    return { advertiserId: "", isScientificNotation: true }
  }

  const digitsOnly = raw.replace(/\D+/g, "")
  if (!digitsOnly) {
    return { advertiserId: raw, isScientificNotation: false }
  }
  return { advertiserId: digitsOnly, isScientificNotation: false }
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + Number(days || 0))
  return date.toISOString().slice(0, 10)
}

function chunkDateRange(from, to, maxDays = TIKTOK_MAX_DAY_SPAN) {
  const out = []
  let cursor = String(from || "").trim()
  const end = String(to || "").trim()
  if (!cursor || !end) return out
  while (cursor <= end) {
    const chunkEnd = addDays(cursor, maxDays - 1)
    out.push({
      from: cursor,
      to: chunkEnd < end ? chunkEnd : end,
    })
    cursor = addDays(chunkEnd < end ? chunkEnd : end, 1)
  }
  return out
}

async function fetchTikTokCampaignInventory(apiVersion, token, advertiserId) {
  const map = new Map()
  const url = new URL(`https://business-api.tiktok.com/open_api/${apiVersion}/campaign/get/`)
  url.searchParams.set("advertiser_id", advertiserId)
  url.searchParams.set(
    "fields",
    JSON.stringify(["campaign_id", "campaign_name", "budget_mode", "budget"])
  )
  url.searchParams.set("page_size", "1000")

  let page = 1
  let totalPages = 1
  do {
    url.searchParams.set("page", String(page))
    const payload = await fetchJsonWithRetry({
      url: url.toString(),
      method: "GET",
      headers: { "Access-Token": token },
      retries: 3,
      retryDelayMs: 2500,
      label: "tiktok_campaign_inventory",
    })
    if (toNum(payload?.code) !== 0) {
      console.warn(
        `[tiktok] campaign inventory returned code=${payload?.code} message=${String(payload?.message || "")}`
      )
      return map
    }
    const list = Array.isArray(payload?.data?.list) ? payload.data.list : []
    for (const campaign of list) {
      const cid = String(campaign?.campaign_id || "").trim()
      const budgetMode = String(campaign?.budget_mode || "").trim()
      const budget = budgetMode === "BUDGET_MODE_DAY" ? toNum(campaign?.budget) : 0
      if (cid) map.set(cid, budget)
    }
    totalPages = Math.max(1, toNum(payload?.data?.page_info?.total_page))
    page += 1
    if (page <= totalPages) await sleep(200)
  } while (page <= totalPages)

  return map
}

async function fetchTikTokPage({ apiVersion, token, advertiserId, from, to, page }) {
  const url = new URL(
    `https://business-api.tiktok.com/open_api/${apiVersion}/report/integrated/get/`
  )
  url.searchParams.set("advertiser_id", advertiserId)
  url.searchParams.set("report_type", "BASIC")
  url.searchParams.set("data_level", "AUCTION_AD")
  url.searchParams.set("dimensions", JSON.stringify(["ad_id", "stat_time_day"]))
  url.searchParams.set(
    "metrics",
    JSON.stringify([
      "campaign_id",
      "campaign_name",
      "adgroup_id",
      "adgroup_name",
      "ad_name",
      "spend",
      "impressions",
      "clicks",
      "reach",
      "cpm",
      "cpc",
      "ctr",
      "complete_payment",
      "value_per_complete_payment",
      "conversion",
      "cost_per_conversion",
      "video_play_actions",
      "video_watched_6s",
    ])
  )
  url.searchParams.set("start_date", from)
  url.searchParams.set("end_date", to)
  url.searchParams.set("page", String(page))
  url.searchParams.set("page_size", String(TIKTOK_PAGE_SIZE))

  return fetchJsonWithRetry({
    url: url.toString(),
    method: "GET",
    headers: {
      "Access-Token": token,
    },
    retries: 3,
    retryDelayMs: 2500,
    label: "tiktok_report",
  })
}

async function fetchTikTokWindow(apiVersion, token, advertiserId, from, to) {
  const rows = []
  const chunks = chunkDateRange(from, to, TIKTOK_MAX_DAY_SPAN)
  for (const chunk of chunks) {
    let page = 1
    let totalPages = 1
    do {
      const payload = await fetchTikTokPage({
        apiVersion,
        token,
        advertiserId,
        from: chunk.from,
        to: chunk.to,
        page,
      })
      if (toNum(payload?.code) !== 0) {
        throw new Error(
          `TikTok API returned code=${payload?.code} message=${String(payload?.message || "")}`
        )
      }
      const list = Array.isArray(payload?.data?.list) ? payload.data.list : []
      rows.push(...list)
      totalPages = Math.max(1, toNum(payload?.data?.page_info?.total_page))
      page += 1
      if (page <= totalPages) await sleep(200)
    } while (page <= totalPages)
  }
  return rows
}

async function pullTikTokTables(ctx) {
  const token = readRequiredEnv(ctx.env, "TIKTOK_ACCESS_TOKEN")
  const rawAdvertiserId = readRequiredEnv(ctx.env, "TIKTOK_ADVERTISER_ID")
  const { advertiserId, isScientificNotation } = parseTikTokAdvertiserId(rawAdvertiserId)
  if (isScientificNotation) {
    throw new Error(
      `TIKTOK_ADVERTISER_ID appears to be scientific notation ("${rawAdvertiserId}"). Re-enter the exact integer from TikTok Ads Manager (no exponent/comma formatting).`
    )
  }
  if (!/^\d+$/.test(advertiserId)) {
    throw new Error(
      `TIKTOK_ADVERTISER_ID must resolve to an integer string. Received: "${String(
        readEnv(ctx.env, "TIKTOK_ADVERTISER_ID", "")
      )}"`
    )
  }
  const apiVersion =
    readEnv(ctx.env, "TIKTOK_API_VERSION", TIKTOK_DEFAULT_API_VERSION).trim() ||
    TIKTOK_DEFAULT_API_VERSION
  const syncedAt = nowIso()

  let campaignBudgetMap = new Map()
  try {
    campaignBudgetMap = await fetchTikTokCampaignInventory(apiVersion, token, advertiserId)
  } catch (error) {
    console.warn(
      `[tiktok] campaign inventory fetch failed (budget will be 0): ${error.message || String(error)}`
    )
  }
  const budgetHistoryRows = await buildChangedBudgetHistoryRows({
    client: ctx.client,
    workspaceId: ctx.workspaceId,
    platform: "TikTok",
    campaignBudgetMap,
    syncedAt,
  })

  const payloadRows = await fetchTikTokWindow(apiVersion, token, advertiserId, ctx.from, ctx.to)

  const rawDailyRows = []
  const rawSegmentRows = []
  const factDailyRows = []
  const factSegmentRows = []

  for (const item of payloadRows) {
    const dims = item?.dimensions || {}
    const metrics = item?.metrics || {}
    const date = normalizeDate(String(dims?.stat_time_day || "").slice(0, 10))
    const adId = String(dims?.ad_id || "").trim()
    if (!date || !adId) continue

    const campaignId = String(metrics?.campaign_id || "").trim()
    const campaignName = String(metrics?.campaign_name || "")
    const adgroupId = String(metrics?.adgroup_id || "").trim()
    const adgroupName = String(metrics?.adgroup_name || "")
    const adName = String(metrics?.ad_name || "")
    const spend = toNum(metrics?.spend)
    const impressions = toNum(metrics?.impressions)
    const clicks = toNum(metrics?.clicks)
    const reach = toNum(metrics?.reach)
    const cpm = toNum(metrics?.cpm)
    const cpc = toNum(metrics?.cpc)
    const ctr = toNum(metrics?.ctr)
    const purchases = toNum(metrics?.complete_payment)
    const avgPurchaseValue = toNum(metrics?.value_per_complete_payment)
    const purchaseValue = purchases > 0 ? purchases * avgPurchaseValue : 0
    const conversions = toNum(metrics?.conversion)
    const costPerConversion = toNum(metrics?.cost_per_conversion)

    rawDailyRows.push({
      _synced_at: syncedAt,
      date,
      advertiser_id: advertiserId,
      campaign_id: campaignId,
      campaign_name: campaignName,
      adgroup_id: adgroupId,
      adgroup_name: adgroupName,
      ad_id: adId,
      ad_name: adName,
      impressions,
      clicks,
      spend,
      reach,
      cpm,
      cpc,
      ctr,
      purchases,
      purchase_value: purchaseValue,
      conversions,
      cost_per_conversion: costPerConversion,
      daily_budget: campaignBudgetMap.get(campaignId) ?? 0,
      video_3s_views: toNum(metrics?.video_play_actions),
      video_15s_views: toNum(metrics?.video_watched_6s),
      raw_payload: JSON.stringify(metrics),
    })

    rawSegmentRows.push({
      _synced_at: syncedAt,
      date,
      advertiser_id: advertiserId,
      campaign_id: campaignId,
      campaign_name: campaignName,
      adgroup_id: adgroupId,
      adgroup_name: adgroupName,
      ad_id: adId,
      ad_name: adName,
      country: "unknown",
      device: "unknown",
      impressions,
      clicks,
      sessions: clicks,
      add_to_cart: 0,
      initiate_checkout: 0,
      purchases,
      purchase_value: purchaseValue,
      spend,
      cpm,
      cpc,
      ctr,
    })

    const cpa = purchases > 0 ? spend / purchases : 0
    const roas = spend > 0 ? purchaseValue / spend : 0
    const cvr = clicks > 0 ? purchases / clicks : 0

    factDailyRows.push({
      date,
      platform: "TikTok",
      account_id: advertiserId,
      campaign_id: campaignId,
      campaign_name: campaignName,
      adset_id: adgroupId,
      adset_name: adgroupName,
      ad_id: adId,
      ad_name: adName,
      creative_id: adId,
      spend,
      impressions,
      clicks,
      purchases,
      revenue: purchaseValue,
      cpa,
      roas,
      campaign_status: "",
      adset_status: "",
      ad_status: "",
      daily_budget: campaignBudgetMap.get(campaignId) ?? 0,
      video_3s_views: toNum(metrics?.video_play_actions),
      video_15s_views: toNum(metrics?.video_watched_6s),
    })

    factSegmentRows.push({
      date,
      platform: "TikTok",
      account_id: advertiserId,
      campaign_id: campaignId,
      campaign_name: campaignName,
      adset_id: adgroupId,
      adset_name: adgroupName,
      ad_id: adId,
      ad_name: adName,
      country: "unknown",
      device: "unknown",
      audience_segment: "",
      brand_segment: "",
      spend,
      impressions,
      clicks,
      sessions: clicks,
      add_to_cart: 0,
      initiate_checkout: 0,
      purchases,
      revenue: purchaseValue,
      cpm,
      cpc,
      ctr,
      cvr,
      cpa,
      roas,
    })
  }

  const tables = {
    RAW_TIKTOK_ADS_DAILY: rawDailyRows,
    RAW_TIKTOK_ADS_SEGMENTS_DAILY: rawSegmentRows,
    FACT_ADS_DAILY: factDailyRows,
    FACT_ADS_SEGMENTS_DAILY: factSegmentRows,
  }
  if (budgetHistoryRows.length) {
    tables.BUDGET_HISTORY = budgetHistoryRows
  }

  return {
    tables,
    cursor: ctx.to,
    metadata: {
      api_version: apiVersion,
      advertiser_id: advertiserId,
      fetched_rows: payloadRows.length,
      budget_history_rows: budgetHistoryRows.length,
    },
  }
}

export const tiktokConnector = createDirectConnector({
  name: "tiktok",
  tableKeys: [
    "RAW_TIKTOK_ADS_DAILY",
    "RAW_TIKTOK_ADS_SEGMENTS_DAILY",
    "BUDGET_HISTORY",
    "FACT_ADS_DAILY",
    "FACT_ADS_SEGMENTS_DAILY",
  ],
  requiredEnvKeys: ["TIKTOK_ACCESS_TOKEN", "TIKTOK_ADVERTISER_ID"],
  async syncWindow(ctx) {
    return pullTikTokTables(ctx)
  },
  async backfillWindow(ctx) {
    return pullTikTokTables(ctx)
  },
})
