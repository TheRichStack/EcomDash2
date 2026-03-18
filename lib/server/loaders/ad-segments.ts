import "server-only"

import { selectRowsFromTable } from "@/lib/db/query"
import type { DashboardRequestContext } from "@/types/dashboard"

export type AdSegmentRow = {
  platform: string
  dimension: string
  value: string
  spend: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
  roas: number
  cpa: number
  ctr: number
}

export type AdSegmentsSlice = {
  range: { from: string; to: string }
  kpis: {
    totalSpend: number
    totalRevenue: number
    totalImpressions: number
    blendedRoas: number
  }
  byCountry: AdSegmentRow[]
  byDevice: AdSegmentRow[]
  byAudience: AdSegmentRow[]
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b
}

type SegmentAccumulator = {
  platform: string
  dimension: string
  value: string
  spend: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
}

export async function loadAdSegmentsSlice(
  context: DashboardRequestContext
): Promise<AdSegmentsSlice> {
  const { workspaceId, from, to } = context
  const cacheBuster = context.refresh ?? context.loadedAt

  const rows = await selectRowsFromTable("factAdsSegmentsDaily", {
    workspaceId,
    from,
    to,
    cacheBuster,
  })

  const countryMap = new Map<string, SegmentAccumulator>()
  const deviceMap = new Map<string, SegmentAccumulator>()
  const audienceMap = new Map<string, SegmentAccumulator>()

  let totalSpend = 0
  let totalRevenue = 0
  let totalImpressions = 0

  for (const row of rows) {
    const platform = String(row.platform ?? "")
    const country = String(row.country ?? "")
    const device = String(row.device ?? "")
    const audienceSegment = String(row.audience_segment ?? "")
    const spend = Number(row.spend ?? 0)
    const impressions = Number(row.impressions ?? 0)
    const clicks = Number(row.clicks ?? 0)
    const purchases = Number(row.purchases ?? 0)
    const revenue = Number(row.revenue ?? 0)

    totalSpend += spend
    totalRevenue += revenue
    totalImpressions += impressions

    // Country accumulation
    const countryKey = platform + "\0" + country
    const existingCountry = countryMap.get(countryKey)
    if (existingCountry) {
      existingCountry.spend += spend
      existingCountry.impressions += impressions
      existingCountry.clicks += clicks
      existingCountry.purchases += purchases
      existingCountry.revenue += revenue
    } else {
      countryMap.set(countryKey, {
        platform,
        dimension: "country",
        value: country,
        spend,
        impressions,
        clicks,
        purchases,
        revenue,
      })
    }

    // Device accumulation
    const deviceKey = platform + "\0" + device
    const existingDevice = deviceMap.get(deviceKey)
    if (existingDevice) {
      existingDevice.spend += spend
      existingDevice.impressions += impressions
      existingDevice.clicks += clicks
      existingDevice.purchases += purchases
      existingDevice.revenue += revenue
    } else {
      deviceMap.set(deviceKey, {
        platform,
        dimension: "device",
        value: device,
        spend,
        impressions,
        clicks,
        purchases,
        revenue,
      })
    }

    // Audience accumulation
    const audienceKey = platform + "\0" + audienceSegment
    const existingAudience = audienceMap.get(audienceKey)
    if (existingAudience) {
      existingAudience.spend += spend
      existingAudience.impressions += impressions
      existingAudience.clicks += clicks
      existingAudience.purchases += purchases
      existingAudience.revenue += revenue
    } else {
      audienceMap.set(audienceKey, {
        platform,
        dimension: "audience",
        value: audienceSegment,
        spend,
        impressions,
        clicks,
        purchases,
        revenue,
      })
    }
  }

  function toSegmentRows(
    map: Map<string, SegmentAccumulator>,
    cap: number
  ): AdSegmentRow[] {
    return Array.from(map.values())
      .sort((a, b) => b.spend - a.spend)
      .slice(0, cap)
      .map((acc) => ({
        platform: acc.platform,
        dimension: acc.dimension,
        value: acc.value,
        spend: acc.spend,
        impressions: acc.impressions,
        clicks: acc.clicks,
        purchases: acc.purchases,
        revenue: acc.revenue,
        roas: safeDivide(acc.revenue, acc.spend),
        cpa: safeDivide(acc.spend, acc.purchases),
        ctr: safeDivide(acc.clicks, acc.impressions),
      }))
  }

  const byCountry = toSegmentRows(countryMap, 12)
  const byDevice = toSegmentRows(deviceMap, 6)
  const byAudience = toSegmentRows(audienceMap, 10)

  const blendedRoas = safeDivide(totalRevenue, totalSpend)

  return {
    range: { from, to },
    kpis: {
      totalSpend,
      totalRevenue,
      totalImpressions,
      blendedRoas,
    },
    byCountry,
    byDevice,
    byAudience,
  }
}
