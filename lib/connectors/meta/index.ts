/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { buildChangedBudgetHistoryRows } from "@/lib/connectors/common/budget-history"
import {
  createDirectConnector,
  nowIso,
  readEnv,
  readRequiredEnv,
} from "@/lib/connectors/common"
import { normalizeDate } from "@/lib/connectors/common/rows"
import { areSharedDbSupportTableWritesEnabled } from "@/lib/jobs/runtime/env"
import {
  fetchMetaCreatives,
  fetchMetaEntitySnapshots,
  fetchMetaInsights,
  fetchMetaStatusMap,
} from "@/lib/connectors/meta/fetch"
import {
  META_DEFAULT_API_VERSION,
  normalizeAccountId,
  parseActionCounts,
  parseBool,
  toNum,
} from "@/lib/connectors/meta/transform"

async function pullMetaTables(ctx) {
  const token = readRequiredEnv(ctx.env, "META_ACCESS_TOKEN")
  const accountId = normalizeAccountId(readRequiredEnv(ctx.env, "META_AD_ACCOUNT_ID"))
  const apiVersion =
    readEnv(ctx.env, "META_API_VERSION", META_DEFAULT_API_VERSION).trim() ||
    META_DEFAULT_API_VERSION
  const syncCreatives = parseBool(readEnv(ctx.env, "META_SYNC_CREATIVES", "1"), true)
  const sharedSupportTableWritesEnabled = areSharedDbSupportTableWritesEnabled(ctx.env)
  const syncedAt = nowIso()
  const syncBatchId = String(ctx.syncBatchId || "").trim() || syncedAt

  const snapshotPayload = await fetchMetaEntitySnapshots({
    apiVersion,
    token,
    accountId,
    syncedAt,
    syncBatchId,
  })

  const campaignBudgetMap = new Map()
  for (const snap of snapshotPayload.rows) {
    if (String(snap?.level || "").toLowerCase() === "campaign") {
      const cid = String(snap?.entity_id || "").trim()
      const budget = toNum(snap?.daily_budget)
      if (cid && budget > 0) campaignBudgetMap.set(cid, budget)
    }
  }
  const budgetHistoryRows = await buildChangedBudgetHistoryRows({
    client: ctx.client,
    workspaceId: ctx.workspaceId,
    platform: "Meta",
    campaignBudgetMap,
    syncedAt,
  })

  const insights = await fetchMetaInsights(apiVersion, token, accountId, ctx.from, ctx.to)

  const campaignIds = []
  const adsetIds = []
  const adIds = []
  for (const row of insights) {
    const campaignId = String(row?.campaign_id || "").trim()
    const adsetId = String(row?.adset_id || "").trim()
    const adId = String(row?.ad_id || "").trim()
    if (campaignId) campaignIds.push(campaignId)
    if (adsetId) adsetIds.push(adsetId)
    if (adId) adIds.push(adId)
  }

  const campaignStatusMap = await fetchMetaStatusMap(apiVersion, token, campaignIds)
  const adsetStatusMap = await fetchMetaStatusMap(apiVersion, token, adsetIds)
  const adStatusMap = await fetchMetaStatusMap(apiVersion, token, adIds)

  const rawDailyRows = []
  const rawSegmentRows = []
  const factDailyRows = []
  const factSegmentRows = []

  for (const row of insights) {
    const date = normalizeDate(row?.date_start)
    const adId = String(row?.ad_id || "").trim()
    if (!date || !adId) continue
    const rowAccountId =
      normalizeAccountId(String(row?.account_id || accountId).trim() || accountId)
    const campaignId = String(row?.campaign_id || "").trim()
    const adsetId = String(row?.adset_id || "").trim()
    const campaignName = String(row?.campaign_name || "")
    const adsetName = String(row?.adset_name || "")
    const adName = String(row?.ad_name || "")
    const metrics = parseActionCounts(row?.actions || [], row?.action_values || [])
    const spend = toNum(row?.spend)
    const impressions = toNum(row?.impressions)
    const clicks = toNum(row?.clicks)
    const cpm = toNum(row?.cpm)
    const cpc = toNum(row?.cpc)
    const ctr = toNum(row?.ctr)
    const dailyBudget = campaignBudgetMap.get(campaignId) ?? 0

    rawDailyRows.push({
      _synced_at: syncedAt,
      date,
      account_id: rowAccountId,
      campaign_id: campaignId,
      campaign_name: campaignName,
      adset_id: adsetId,
      adset_name: adsetName,
      ad_id: adId,
      ad_name: adName,
      impressions,
      clicks,
      spend,
      reach: toNum(row?.reach),
      frequency: toNum(row?.frequency),
      cpm,
      cpc,
      ctr,
      purchases: metrics.purchases,
      purchase_value: metrics.revenue,
      add_to_cart: metrics.addToCart,
      initiate_checkout: metrics.initiateCheckout,
      link_clicks: metrics.linkClicks,
      landing_page_views: metrics.landingPageViews,
      campaign_status: campaignStatusMap.get(campaignId) || "",
      adset_status: adsetStatusMap.get(adsetId) || "",
      ad_status: adStatusMap.get(adId) || "",
      daily_budget: dailyBudget,
      view_content: metrics.viewContent,
      outbound_clicks: metrics.outboundClicks,
      video_3s_views: metrics.video3sViews,
      video_15s_views: metrics.video15sViews,
      video_p25_viewed: metrics.videoP25,
      video_p50_viewed: metrics.videoP50,
      video_p75_viewed: metrics.videoP75,
      video_p100_viewed: metrics.videoP100,
      raw_payload: JSON.stringify(row),
    })

    rawSegmentRows.push({
      _synced_at: syncedAt,
      date,
      account_id: rowAccountId,
      campaign_id: campaignId,
      campaign_name: campaignName,
      adset_id: adsetId,
      adset_name: adsetName,
      ad_id: adId,
      ad_name: adName,
      country: "unknown",
      device: "unknown",
      impressions,
      clicks,
      sessions: clicks,
      add_to_cart: metrics.addToCart,
      initiate_checkout: metrics.initiateCheckout,
      purchases: metrics.purchases,
      revenue: metrics.revenue,
      spend,
      cpm,
      cpc,
      ctr,
    })

    const cpa = metrics.purchases > 0 ? spend / metrics.purchases : 0
    const roas = spend > 0 ? metrics.revenue / spend : 0

    factDailyRows.push({
      date,
      platform: "Meta",
      account_id: rowAccountId,
      campaign_id: campaignId,
      campaign_name: campaignName,
      adset_id: adsetId,
      adset_name: adsetName,
      ad_id: adId,
      ad_name: adName,
      creative_id: adId,
      spend,
      impressions,
      clicks,
      purchases: metrics.purchases,
      revenue: metrics.revenue,
      cpa,
      roas,
      campaign_status: campaignStatusMap.get(campaignId) || "",
      adset_status: adsetStatusMap.get(adsetId) || "",
      ad_status: adStatusMap.get(adId) || "",
      daily_budget: dailyBudget,
      view_content: metrics.viewContent,
      outbound_clicks: metrics.outboundClicks,
      video_3s_views: metrics.video3sViews,
      video_15s_views: metrics.video15sViews,
      video_p25_viewed: metrics.videoP25,
      video_p50_viewed: metrics.videoP50,
      video_p75_viewed: metrics.videoP75,
      video_p100_viewed: metrics.videoP100,
    })

    const cvr = clicks > 0 ? metrics.purchases / clicks : 0
    factSegmentRows.push({
      date,
      platform: "Meta",
      account_id: rowAccountId,
      campaign_id: campaignId,
      campaign_name: campaignName,
      adset_id: adsetId,
      adset_name: adsetName,
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
      add_to_cart: metrics.addToCart,
      initiate_checkout: metrics.initiateCheckout,
      purchases: metrics.purchases,
      revenue: metrics.revenue,
      cpm,
      cpc,
      ctr,
      cvr,
      cpa,
      roas,
    })
  }

  const tables = {
    RAW_META_ADS_DAILY: rawDailyRows,
    RAW_META_ADS_SEGMENTS_DAILY: rawSegmentRows,
    FACT_ADS_DAILY: factDailyRows,
    FACT_ADS_SEGMENTS_DAILY: factSegmentRows,
  }

  if (sharedSupportTableWritesEnabled && snapshotPayload.rows.length) {
    tables.ADS_ENTITY_SNAPSHOT = snapshotPayload.rows
  }
  if (budgetHistoryRows.length) {
    tables.BUDGET_HISTORY = budgetHistoryRows
  }

  let creativeRows = []
  let dimRows = []
  if (syncCreatives) {
    const creativePayload = await fetchMetaCreatives(apiVersion, token, adIds, syncedAt, ctx.to)
    creativeRows = creativePayload.rawRows
    dimRows = creativePayload.dimRows
    if (creativeRows.length) tables.RAW_META_CREATIVES = creativeRows
    if (dimRows.length) tables.DIM_CREATIVE = dimRows
  }

  return {
    tables,
    cursor: ctx.to,
    metadata: {
      api_version: apiVersion,
      account_id: accountId,
      fetched_insights_rows: insights.length,
      fetched_creatives_rows: creativeRows.length,
      fetched_dim_creative_rows: dimRows.length,
      creatives_sync_enabled: syncCreatives,
      snapshot_counts: snapshotPayload.counts,
      snapshot_errors: snapshotPayload.errors,
      budget_history_rows: budgetHistoryRows.length,
      support_table_writes_mode: sharedSupportTableWritesEnabled ? "shared" : "owned",
    },
  }
}

export const metaConnector = createDirectConnector({
  name: "meta",
  tableKeys: [
    "RAW_META_ADS_DAILY",
    "RAW_META_ADS_SEGMENTS_DAILY",
    "RAW_META_CREATIVES",
    "ADS_ENTITY_SNAPSHOT",
    "BUDGET_HISTORY",
    "FACT_ADS_DAILY",
    "FACT_ADS_SEGMENTS_DAILY",
    "DIM_CREATIVE",
  ],
  requiredEnvKeys: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
  async syncWindow(ctx) {
    return pullMetaTables(ctx)
  },
  async backfillWindow(ctx) {
    return pullMetaTables(ctx)
  },
})
