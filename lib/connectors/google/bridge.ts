/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import {
  buildChangedBudgetHistoryRows,
  loadLatestCampaignBudgets,
} from "@/lib/connectors/common/budget-history"
import { nowIso } from "@/lib/connectors/common"
import { normalizeDate } from "@/lib/connectors/common/rows"
import {
  applyGoogleCampaignBudgets,
  buildGoogleCampaignBudgetMapFromRawRows,
  deriveGoogleFactDailyRows,
  deriveGoogleFactSegmentRows,
  deriveGoogleSegmentRows,
  normalizeGoogleCustomerId,
  normalizeGoogleEntityId,
} from "@/lib/connectors/google/transform"

function toNum(value) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

async function queryGoogleBridgeRawRows(client, workspaceId, from, to) {
  const result = await client.execute({
    args: [workspaceId, from, to],
    sql: `
      SELECT
        date,
        customer_id,
        campaign_id,
        campaign_name,
        ad_group_id,
        ad_group_name,
        ad_id,
        impressions,
        clicks,
        cost,
        conversions,
        conversion_value,
        daily_budget,
        all_conversions,
        raw_payload
      FROM raw_google_ads_daily
      WHERE workspace_id = ? AND date >= ? AND date <= ?
      ORDER BY date ASC, customer_id ASC, ad_id ASC
    `,
  })

  return (result.rows || [])
    .map((row) => ({
      date: normalizeDate(row?.date),
      customer_id: normalizeGoogleCustomerId(row?.customer_id),
      campaign_id: normalizeGoogleEntityId(row?.campaign_id),
      campaign_name: String(row?.campaign_name || ""),
      ad_group_id: normalizeGoogleEntityId(row?.ad_group_id),
      ad_group_name: String(row?.ad_group_name || ""),
      ad_id: normalizeGoogleEntityId(row?.ad_id),
      impressions: toNum(row?.impressions),
      clicks: toNum(row?.clicks),
      cost: toNum(row?.cost),
      conversions: toNum(row?.conversions),
      conversion_value: toNum(row?.conversion_value),
      daily_budget: toNum(row?.daily_budget),
      all_conversions: toNum(row?.all_conversions),
      raw_payload: String(row?.raw_payload || ""),
    }))
    .filter(
      (row) =>
        row.date &&
        row.customer_id &&
        row.campaign_id &&
        row.ad_group_id &&
        row.ad_id
    )
}

export async function pullGoogleBridgeTables(ctx) {
  const syncedAt = nowIso()
  const rawRows = await queryGoogleBridgeRawRows(ctx.client, ctx.workspaceId, ctx.from, ctx.to)
  const rawBudgetMap = buildGoogleCampaignBudgetMapFromRawRows(rawRows)
  const latestBudgetMap = await loadLatestCampaignBudgets(ctx.client, ctx.workspaceId, "Google")
  const campaignBudgetMap = new Map(latestBudgetMap)

  for (const [campaignId, budget] of rawBudgetMap.entries()) {
    campaignBudgetMap.set(campaignId, budget)
  }

  const rawDailyRows = applyGoogleCampaignBudgets(
    rawRows.map((row) => ({
      ...row,
      _synced_at: syncedAt,
    })),
    campaignBudgetMap
  )
  const rawSegmentRows = deriveGoogleSegmentRows(rawDailyRows, syncedAt)
  const factDailyRows = deriveGoogleFactDailyRows(rawDailyRows)
  const factSegmentRows = deriveGoogleFactSegmentRows(rawSegmentRows)
  const budgetHistoryRows = await buildChangedBudgetHistoryRows({
    campaignBudgetMap,
    client: ctx.client,
    platform: "Google",
    syncedAt,
    workspaceId: ctx.workspaceId,
  })

  const tables = {
    RAW_GOOGLE_ADS_DAILY: rawDailyRows,
    RAW_GOOGLE_ADS_SEGMENTS_DAILY: rawSegmentRows,
    FACT_ADS_DAILY: factDailyRows,
    FACT_ADS_SEGMENTS_DAILY: factSegmentRows,
  }

  if (budgetHistoryRows.length) {
    tables.BUDGET_HISTORY = budgetHistoryRows
  }

  return {
    cursor: ctx.to,
    metadata: {
      budget_history_rows: budgetHistoryRows.length,
      fetched_raw_daily_rows: rawRows.length,
      note: "Compatibility fallback rebuilds keep-boundary Google tables from existing raw_google_ads_daily rows only.",
      transport: "bridge",
    },
    tables,
  }
}
