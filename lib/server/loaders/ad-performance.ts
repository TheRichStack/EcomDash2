import "server-only"

import { selectRowsFromTable } from "@/lib/db/query"
import { parseFactAdsDailyRow } from "@/lib/db/record-parsers"
import type { DashboardRequestContext } from "@/types/dashboard"

export type AdPerformanceRow = {
  platform: string
  campaignId: string
  campaignName: string
  adsetId: string
  adsetName: string
  adId: string
  adName: string
  spend: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
  roas: number
  cpa: number
  ctr: number
  hookRate: number
  video3sViews: number
  video15sViews: number
  videoP25: number
  videoP50: number
  videoP100: number
  outboundClicks: number
}

export type AdPerformanceSlice = {
  range: { from: string; to: string }
  kpis: {
    totalSpend: number
    totalRevenue: number
    totalImpressions: number
    totalClicks: number
    totalPurchases: number
    blendedRoas: number
    blendedCpa: number
  }
  rows: AdPerformanceRow[]
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b
}

type AdGroupAccumulator = {
  platform: string
  campaignId: string
  campaignName: string
  adsetId: string
  adsetName: string
  adId: string
  adName: string
  spend: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
  video3sViews: number
  video15sViews: number
  videoP25: number
  videoP50: number
  videoP100: number
  outboundClicks: number
  viewContent: number
  allConversions: number
}

export async function loadAdPerformanceSlice(
  context: DashboardRequestContext
): Promise<AdPerformanceSlice> {
  const cacheBuster = context.refresh ?? context.loadedAt
  const rawRows = await selectRowsFromTable("factAdsDaily", {
    workspaceId: context.workspaceId,
    from: context.from,
    to: context.to,
    cacheBuster,
  })

  const parsedRows = rawRows.map(parseFactAdsDailyRow)

  // Group by composite key
  const groups = new Map<string, AdGroupAccumulator>()

  for (const row of parsedRows) {
    const key = [
      row.platform,
      row.campaignId,
      row.campaignName,
      row.adsetId,
      row.adsetName,
      row.adId,
      row.adName,
    ].join("\0")

    const existing = groups.get(key)

    if (!existing) {
      groups.set(key, {
        platform: row.platform,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        adsetId: row.adsetId,
        adsetName: row.adsetName,
        adId: row.adId,
        adName: row.adName,
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
        purchases: row.purchases,
        revenue: row.revenue,
        video3sViews: row.extraMetrics["video_3s_views"] ?? 0,
        video15sViews: row.extraMetrics["video_15s_views"] ?? 0,
        videoP25: row.extraMetrics["video_p25_viewed"] ?? 0,
        videoP50: row.extraMetrics["video_p50_viewed"] ?? 0,
        videoP100: row.extraMetrics["video_p100_viewed"] ?? 0,
        outboundClicks: row.extraMetrics["outbound_clicks"] ?? 0,
        viewContent: row.extraMetrics["view_content"] ?? 0,
        allConversions: row.extraMetrics["all_conversions"] ?? 0,
      })
    } else {
      existing.spend += row.spend
      existing.impressions += row.impressions
      existing.clicks += row.clicks
      existing.purchases += row.purchases
      existing.revenue += row.revenue
      existing.video3sViews += row.extraMetrics["video_3s_views"] ?? 0
      existing.video15sViews += row.extraMetrics["video_15s_views"] ?? 0
      existing.videoP25 += row.extraMetrics["video_p25_viewed"] ?? 0
      existing.videoP50 += row.extraMetrics["video_p50_viewed"] ?? 0
      existing.videoP100 += row.extraMetrics["video_p100_viewed"] ?? 0
      existing.outboundClicks += row.extraMetrics["outbound_clicks"] ?? 0
      existing.viewContent += row.extraMetrics["view_content"] ?? 0
      existing.allConversions += row.extraMetrics["all_conversions"] ?? 0
    }
  }

  // Build final rows with derived metrics, sort by spend desc, take top 30
  const allRows: AdPerformanceRow[] = Array.from(groups.values())
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 30)
    .map((group) => ({
      platform: group.platform,
      campaignId: group.campaignId,
      campaignName: group.campaignName,
      adsetId: group.adsetId,
      adsetName: group.adsetName,
      adId: group.adId,
      adName: group.adName,
      spend: group.spend,
      impressions: group.impressions,
      clicks: group.clicks,
      purchases: group.purchases,
      revenue: group.revenue,
      roas: safeDivide(group.revenue, group.spend),
      cpa: safeDivide(group.spend, group.purchases),
      ctr: safeDivide(group.clicks, group.impressions),
      hookRate: safeDivide(group.video3sViews, group.impressions),
      video3sViews: group.video3sViews,
      video15sViews: group.video15sViews,
      videoP25: group.videoP25,
      videoP50: group.videoP50,
      videoP100: group.videoP100,
      outboundClicks: group.outboundClicks,
    }))

  // Compute KPIs across all groups (not just top 30)
  let totalSpend = 0
  let totalRevenue = 0
  let totalImpressions = 0
  let totalClicks = 0
  let totalPurchases = 0

  for (const group of groups.values()) {
    totalSpend += group.spend
    totalRevenue += group.revenue
    totalImpressions += group.impressions
    totalClicks += group.clicks
    totalPurchases += group.purchases
  }

  return {
    range: { from: context.from, to: context.to },
    kpis: {
      totalSpend,
      totalRevenue,
      totalImpressions,
      totalClicks,
      totalPurchases,
      blendedRoas: safeDivide(totalRevenue, totalSpend),
      blendedCpa: safeDivide(totalSpend, totalPurchases),
    },
    rows: allRows,
  }
}
