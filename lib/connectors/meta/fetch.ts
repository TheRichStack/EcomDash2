/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import {
  budgetFor,
  bidStrategyFor,
  inferFormat,
  pickBestImageUrl,
  targetFor,
} from "@/lib/connectors/meta/transform"
import {
  fetchJsonWithRetry,
  sleep,
} from "@/lib/connectors/common"
import { normalizeDate } from "@/lib/connectors/common/rows"
import { snapshotRow } from "@/lib/connectors/common/snapshot-row"

async function metaJsonRequest(url, label) {
  return fetchJsonWithRetry({
    url,
    method: "GET",
    retries: 3,
    retryDelayMs: 2500,
    label,
  })
}

export async function fetchMetaStatusMap(apiVersion, token, ids) {
  const map = new Map()
  const list = Array.from(
    new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))
  )
  if (!list.length) return map
  for (let index = 0; index < list.length; index += 50) {
    const chunk = list.slice(index, index + 50)
    const url = new URL(`https://graph.facebook.com/${apiVersion}/`)
    url.searchParams.set("ids", chunk.join(","))
    url.searchParams.set("fields", "effective_status")
    url.searchParams.set("access_token", token)
    const payload = await metaJsonRequest(url.toString(), "meta_status")
    for (const id of chunk) {
      const status = String(payload?.[id]?.effective_status || "").trim().toUpperCase()
      map.set(id, status)
    }
    await sleep(150)
  }
  return map
}

export async function fetchMetaInsights(apiVersion, token, accountId, from, to) {
  const out = []
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${accountId}/insights`)
  url.searchParams.set("access_token", token)
  url.searchParams.set("level", "ad")
  url.searchParams.set("time_increment", "1")
  url.searchParams.set("time_range", JSON.stringify({ since: from, until: to }))
  url.searchParams.set(
    "fields",
    [
      "account_id",
      "date_start",
      "date_stop",
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "impressions",
      "clicks",
      "spend",
      "reach",
      "frequency",
      "cpm",
      "cpc",
      "ctr",
      "action_values",
      "actions",
    ].join(",")
  )
  url.searchParams.set("limit", "500")

  let next = url.toString()
  let guard = 0
  while (next) {
    guard += 1
    if (guard > 4000) throw new Error("Meta insights pagination exceeded hard limit (4000 pages)")
    const payload = await metaJsonRequest(next, "meta_insights")
    if (payload?.error) {
      throw new Error(String(payload.error?.message || "Meta API returned error payload"))
    }
    const rows = Array.isArray(payload?.data) ? payload.data : []
    out.push(...rows)
    next = String(payload?.paging?.next || "").trim()
    if (next) await sleep(200)
  }
  return out
}

export async function fetchMetaEdgeRows(apiVersion, token, accountId, edge, fields, label) {
  const out = []
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${accountId}/${edge}`)
  url.searchParams.set("access_token", token)
  url.searchParams.set("fields", fields.join(","))
  url.searchParams.set("limit", "500")
  let next = url.toString()
  let guard = 0
  while (next) {
    guard += 1
    if (guard > 2000) throw new Error(`Meta ${label} pagination exceeded hard limit (2000 pages)`)
    const payload = await metaJsonRequest(next, label)
    if (payload?.error) {
      throw new Error(String(payload.error?.message || `Meta API error in ${label}`))
    }
    const rows = Array.isArray(payload?.data) ? payload.data : []
    out.push(...rows)
    next = String(payload?.paging?.next || "").trim()
    if (next) await sleep(200)
  }
  return out
}

export async function fetchMetaEntitySnapshots({
  apiVersion,
  token,
  accountId,
  syncedAt,
  syncBatchId,
}) {
  const snapshots = []

  let campaigns = []
  let adsets = []
  let ads = []
  const errors = []

  try {
    campaigns = await fetchMetaEdgeRows(
      apiVersion,
      token,
      accountId,
      "campaigns",
      ["id", "name", "effective_status", "daily_budget", "lifetime_budget", "bid_strategy"],
      "meta_campaign_inventory"
    )
  } catch (error) {
    errors.push(`campaigns: ${error.message || String(error)}`)
  }

  try {
    adsets = await fetchMetaEdgeRows(
      apiVersion,
      token,
      accountId,
      "adsets",
      [
        "id",
        "name",
        "effective_status",
        "campaign_id",
        "daily_budget",
        "lifetime_budget",
        "bid_strategy",
        "bid_amount",
        "optimization_goal",
      ],
      "meta_adset_inventory"
    )
  } catch (error) {
    errors.push(`adsets: ${error.message || String(error)}`)
  }

  try {
    ads = await fetchMetaEdgeRows(
      apiVersion,
      token,
      accountId,
      "ads",
      ["id", "name", "effective_status", "adset_id", "campaign_id"],
      "meta_ad_inventory"
    )
  } catch (error) {
    errors.push(`ads: ${error.message || String(error)}`)
  }

  for (const campaign of campaigns) {
    const campaignId = String(campaign?.id || "").trim()
    if (!campaignId) continue
    snapshots.push(
      snapshotRow({
        syncedAt,
        syncBatchId,
        channel: "meta",
        level: "campaign",
        entityId: campaignId,
        parentId: accountId,
        campaignId,
        name: String(campaign?.name || "").trim(),
        status: String(campaign?.effective_status || "").trim(),
        dailyBudget: budgetFor(campaign),
        bidStrategy: bidStrategyFor(campaign),
        targetValue: targetFor(campaign),
        raw: campaign,
      })
    )
  }

  for (const adset of adsets) {
    const adsetId = String(adset?.id || "").trim()
    const campaignId = String(adset?.campaign_id || "").trim()
    if (!adsetId) continue
    snapshots.push(
      snapshotRow({
        syncedAt,
        syncBatchId,
        channel: "meta",
        level: "adset",
        entityId: adsetId,
        parentId: campaignId,
        campaignId,
        name: String(adset?.name || "").trim(),
        status: String(adset?.effective_status || "").trim(),
        dailyBudget: budgetFor(adset),
        bidStrategy: bidStrategyFor(adset),
        targetValue: targetFor(adset),
        raw: adset,
      })
    )
  }

  for (const ad of ads) {
    const adId = String(ad?.id || "").trim()
    const adsetId = String(ad?.adset_id || "").trim()
    const campaignId = String(ad?.campaign_id || "").trim()
    if (!adId) continue
    snapshots.push(
      snapshotRow({
        syncedAt,
        syncBatchId,
        channel: "meta",
        level: "ad",
        entityId: adId,
        parentId: adsetId,
        campaignId,
        name: String(ad?.name || "").trim(),
        status: String(ad?.effective_status || "").trim(),
        raw: ad,
      })
    )
  }

  return {
    rows: snapshots,
    counts: {
      campaign: campaigns.length,
      adset: adsets.length,
      ad: ads.length,
      total: snapshots.length,
    },
    errors,
  }
}

export async function fetchMetaCreatives(apiVersion, token, adIds, syncedAt, ctxTo) {
  const rawRows = []
  const dimRows = []
  const ids = Array.from(
    new Set((adIds || []).map((id) => String(id || "").trim()).filter(Boolean))
  )
  if (!ids.length) return { rawRows, dimRows }

  const fields =
    "creative{thumbnail_url,image_url,image_hash,video_id,body,title,object_story_spec,effective_object_story_id,name,call_to_action_type,link_url,asset_feed_spec}"
  for (let index = 0; index < ids.length; index += 40) {
    const chunk = ids.slice(index, index + 40)
    const url = new URL(`https://graph.facebook.com/${apiVersion}/`)
    url.searchParams.set("ids", chunk.join(","))
    url.searchParams.set("fields", fields)
    url.searchParams.set("access_token", token)
    const payload = await metaJsonRequest(url.toString(), "meta_creatives")
    for (const adId of chunk) {
      const creative = payload?.[adId]?.creative
      if (!creative || typeof creative !== "object") continue
      const creativeId = String(creative?.id || `${adId}_creative`).trim()
      if (!creativeId) continue
      const bestImage = pickBestImageUrl(creative)
      const imageUrl = String(creative?.image_url || "").trim()
      const thumbnail = String(creative?.thumbnail_url || "").trim() || bestImage
      const videoUrl = creative?.video_id ? `https://facebook.com/video/${creative.video_id}` : ""
      const headline = String(creative?.title || "").trim()
      const primaryText = String(creative?.body || "").trim().slice(0, 500)
      const destinationUrl = String(creative?.link_url || "").trim()
      const format = inferFormat(creative)

      rawRows.push({
        _synced_at: syncedAt,
        creative_id: creativeId,
        ad_id: adId,
        thumbnail_url: thumbnail,
        image_url: imageUrl || bestImage,
        video_url: videoUrl,
        headline,
        primary_text: primaryText,
        description: "",
        call_to_action: String(creative?.call_to_action_type || "").trim(),
        destination_url: destinationUrl,
        format,
      })

      dimRows.push({
        creative_id: creativeId,
        ad_id: adId,
        platform: "Meta",
        thumbnail_url: thumbnail,
        image_url: imageUrl || bestImage,
        video_url: videoUrl,
        headline,
        primary_text: primaryText,
        format,
        landing_page: destinationUrl,
        first_seen: normalizeDate(ctxTo) || "",
        last_seen: normalizeDate(ctxTo) || "",
      })
    }
    await sleep(200)
  }

  return { rawRows, dimRows }
}
