/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { normalizeDate } from "@/lib/connectors/common/rows"

function toNum(value) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeGoogleCustomerId(value) {
  return String(value || "")
    .trim()
    .replace(/[^0-9]/g, "")
}

export function normalizeGoogleEntityId(value) {
  const raw = String(value || "").trim()

  if (!raw) {
    return ""
  }

  if (/^\d+$/.test(raw)) {
    return raw
  }

  if (/^\d+\.0+$/.test(raw)) {
    return raw.replace(/\.0+$/, "")
  }

  return ""
}

function normalizeGoogleStatus(value) {
  return String(value || "").trim().toUpperCase()
}

export function buildGoogleInventoryMaps({
  adGroupRows,
  adRows,
  campaignRows,
}) {
  const campaignBudgetMap = new Map()
  const campaignStatusMap = new Map()
  const adsetStatusMap = new Map()
  const adStatusMap = new Map()
  const adNameMap = new Map()

  for (const row of campaignRows || []) {
    const campaignId = normalizeGoogleEntityId(row?.campaign?.id)

    if (!campaignId) {
      continue
    }

    const budget =
      toNum(row?.campaignBudget?.amountMicros || row?.campaign_budget?.amount_micros) / 1_000_000
    const status = normalizeGoogleStatus(row?.campaign?.status)

    if (budget > 0) {
      campaignBudgetMap.set(campaignId, budget)
    }

    if (status) {
      campaignStatusMap.set(campaignId, status)
    }
  }

  for (const row of adGroupRows || []) {
    const adGroupId = normalizeGoogleEntityId(row?.adGroup?.id || row?.ad_group?.id)
    const status = normalizeGoogleStatus(row?.adGroup?.status || row?.ad_group?.status)

    if (adGroupId && status) {
      adsetStatusMap.set(adGroupId, status)
    }
  }

  for (const row of adRows || []) {
    const adId = normalizeGoogleEntityId(row?.adGroupAd?.ad?.id || row?.ad_group_ad?.ad?.id)
    const status = normalizeGoogleStatus(row?.adGroupAd?.status || row?.ad_group_ad?.status)
    const adName = String(row?.adGroupAd?.ad?.name || row?.ad_group_ad?.ad?.name || "").trim()

    if (adId && status) {
      adStatusMap.set(adId, status)
    }

    if (adId && adName) {
      adNameMap.set(adId, adName)
    }
  }

  return {
    adNameMap,
    campaignBudgetMap,
    statusMaps: {
      ad: adStatusMap,
      adset: adsetStatusMap,
      campaign: campaignStatusMap,
    },
  }
}

export function mapGoogleApiRows(rawRows, syncedAt, campaignBudgetMap) {
  return (rawRows || [])
    .map((row) => {
      const date = normalizeDate(row?.segments?.date)
      const customerId = normalizeGoogleCustomerId(row?.customer?.id)
      const campaignId = normalizeGoogleEntityId(row?.campaign?.id)
      const adGroupId = normalizeGoogleEntityId(row?.adGroup?.id || row?.ad_group?.id)
      const adId = normalizeGoogleEntityId(row?.adGroupAd?.ad?.id || row?.ad_group_ad?.ad?.id)

      if (!date || !customerId || !campaignId || !adGroupId || !adId) {
        return null
      }

      return {
        _synced_at: syncedAt,
        date,
        customer_id: customerId,
        campaign_id: campaignId,
        campaign_name: String(row?.campaign?.name || ""),
        ad_group_id: adGroupId,
        ad_group_name: String(row?.adGroup?.name || row?.ad_group?.name || ""),
        ad_id: adId,
        impressions: toNum(row?.metrics?.impressions),
        clicks: toNum(row?.metrics?.clicks),
        cost: toNum(row?.metrics?.costMicros || row?.metrics?.cost_micros) / 1_000_000,
        conversions: toNum(row?.metrics?.conversions),
        conversion_value: toNum(row?.metrics?.conversionsValue || row?.metrics?.conversions_value),
        daily_budget: campaignBudgetMap.get(campaignId) ?? 0,
        all_conversions: toNum(row?.metrics?.allConversions || row?.metrics?.all_conversions),
        raw_payload: JSON.stringify(row || {}),
      }
    })
    .filter(Boolean)
}

export function buildGoogleCampaignBudgetMapFromRawRows(rows) {
  const map = new Map()

  for (const row of rows || []) {
    const campaignId = normalizeGoogleEntityId(row?.campaign_id)
    const budget = toNum(row?.daily_budget)

    if (campaignId && budget > 0) {
      map.set(campaignId, budget)
    }
  }

  return map
}

export function applyGoogleCampaignBudgets(rows, campaignBudgetMap) {
  return (rows || []).map((row) => ({
    ...row,
    daily_budget:
      campaignBudgetMap.get(normalizeGoogleEntityId(row?.campaign_id)) ?? toNum(row?.daily_budget),
  }))
}

export function deriveGoogleSegmentRows(rawDailyRows, syncedAt) {
  return (rawDailyRows || []).map((row) => {
    const impressions = toNum(row?.impressions)
    const clicks = toNum(row?.clicks)
    const cost = toNum(row?.cost)
    const cpm = impressions > 0 ? (cost * 1000) / impressions : 0
    const cpc = clicks > 0 ? cost / clicks : 0
    const ctr = impressions > 0 ? clicks / impressions : 0

    return {
      _synced_at: syncedAt,
      date: String(row?.date || ""),
      customer_id: String(row?.customer_id || ""),
      campaign_id: String(row?.campaign_id || ""),
      campaign_name: String(row?.campaign_name || ""),
      ad_group_id: String(row?.ad_group_id || ""),
      ad_group_name: String(row?.ad_group_name || ""),
      ad_id: String(row?.ad_id || ""),
      country: "unknown",
      device: "unknown",
      impressions,
      clicks,
      sessions: clicks,
      add_to_cart: 0,
      initiate_checkout: 0,
      conversions: toNum(row?.conversions),
      conversion_value: toNum(row?.conversion_value),
      cost,
      cpm,
      cpc,
      ctr,
    }
  })
}

export function deriveGoogleFactDailyRows(rawDailyRows, inventoryMaps = {}) {
  return (rawDailyRows || []).map((row) => {
    const adId = normalizeGoogleEntityId(row?.ad_id)
    const campaignId = normalizeGoogleEntityId(row?.campaign_id)
    const adsetId = normalizeGoogleEntityId(row?.ad_group_id)
    const spend = toNum(row?.cost)
    const purchases = toNum(row?.conversions)
    const revenue = toNum(row?.conversion_value)

    return {
      date: String(row?.date || ""),
      platform: "Google",
      account_id: String(row?.customer_id || ""),
      campaign_id: String(row?.campaign_id || ""),
      campaign_name: String(row?.campaign_name || ""),
      adset_id: String(row?.ad_group_id || ""),
      adset_name: String(row?.ad_group_name || ""),
      ad_id: String(row?.ad_id || ""),
      ad_name: inventoryMaps.adNameMap?.get(adId) || "",
      creative_id: String(row?.ad_id || ""),
      spend,
      impressions: toNum(row?.impressions),
      clicks: toNum(row?.clicks),
      purchases,
      revenue,
      cpa: purchases > 0 ? spend / purchases : 0,
      roas: spend > 0 ? revenue / spend : 0,
      campaign_status: inventoryMaps.statusMaps?.campaign?.get(campaignId) || "",
      adset_status: inventoryMaps.statusMaps?.adset?.get(adsetId) || "",
      ad_status: inventoryMaps.statusMaps?.ad?.get(adId) || "",
      daily_budget: toNum(row?.daily_budget),
      all_conversions: toNum(row?.all_conversions),
    }
  })
}

export function deriveGoogleFactSegmentRows(rawSegmentRows, inventoryMaps = {}) {
  return (rawSegmentRows || []).map((row) => {
    const adId = normalizeGoogleEntityId(row?.ad_id)
    const spend = toNum(row?.cost)
    const purchases = toNum(row?.conversions)
    const revenue = toNum(row?.conversion_value)
    const sessions = toNum(row?.sessions)

    return {
      date: String(row?.date || ""),
      platform: "Google",
      account_id: String(row?.customer_id || ""),
      campaign_id: String(row?.campaign_id || ""),
      campaign_name: String(row?.campaign_name || ""),
      adset_id: String(row?.ad_group_id || ""),
      adset_name: String(row?.ad_group_name || ""),
      ad_id: String(row?.ad_id || ""),
      ad_name: inventoryMaps.adNameMap?.get(adId) || "",
      country: String(row?.country || "unknown"),
      device: String(row?.device || "unknown"),
      audience_segment: "",
      brand_segment: "",
      spend,
      impressions: toNum(row?.impressions),
      clicks: toNum(row?.clicks),
      sessions,
      add_to_cart: toNum(row?.add_to_cart),
      initiate_checkout: toNum(row?.initiate_checkout),
      purchases,
      revenue,
      cpm: toNum(row?.cpm),
      cpc: toNum(row?.cpc),
      ctr: toNum(row?.ctr),
      cvr: sessions > 0 ? purchases / sessions : 0,
      cpa: purchases > 0 ? spend / purchases : 0,
      roas: spend > 0 ? revenue / spend : 0,
    }
  })
}
