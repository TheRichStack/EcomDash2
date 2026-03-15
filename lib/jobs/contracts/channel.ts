import type { JobDatabaseClient } from "@/lib/jobs/runtime/db"

import { toRowsAffected } from "@/lib/jobs/contracts/helpers"

export async function insertChannelRows(
  client: JobDatabaseClient,
  workspaceId: string,
  from: string,
  to: string,
  updatedAt: string
) {
  const result = await client.execute({
    args: [updatedAt, workspaceId, from, to],
    sql: `
      INSERT OR REPLACE INTO contract_daily_channel_campaign (
        workspace_id,
        date,
        platform,
        campaign_id,
        campaign_name,
        spend,
        impressions,
        clicks,
        purchases,
        revenue,
        daily_budget,
        view_content,
        outbound_clicks,
        video_3s_views,
        video_15s_views,
        video_p25_viewed,
        video_p50_viewed,
        video_p75_viewed,
        video_p100_viewed,
        all_conversions,
        updated_at
      )
      SELECT
        f.workspace_id,
        f.date,
        f.platform,
        f.campaign_id,
        MAX(f.campaign_name) AS campaign_name,
        SUM(f.spend) AS spend,
        SUM(f.impressions) AS impressions,
        SUM(f.clicks) AS clicks,
        SUM(f.purchases) AS purchases,
        SUM(f.revenue) AS revenue,
        MAX(
          COALESCE(
            (
              SELECT bh.daily_budget
              FROM budget_history bh
              WHERE bh.workspace_id = f.workspace_id
                AND bh.platform = f.platform
                AND bh.campaign_id = f.campaign_id
                AND bh.effective_date <= f.date
              ORDER BY bh.effective_date DESC, bh.synced_at DESC
              LIMIT 1
            ),
            f.daily_budget
          )
        ) AS daily_budget,
        SUM(f.view_content) AS view_content,
        SUM(f.outbound_clicks) AS outbound_clicks,
        SUM(f.video_3s_views) AS video_3s_views,
        SUM(f.video_15s_views) AS video_15s_views,
        SUM(f.video_p25_viewed) AS video_p25_viewed,
        SUM(f.video_p50_viewed) AS video_p50_viewed,
        SUM(f.video_p75_viewed) AS video_p75_viewed,
        SUM(f.video_p100_viewed) AS video_p100_viewed,
        SUM(f.all_conversions) AS all_conversions,
        ? AS updated_at
      FROM fact_ads_daily f
      WHERE f.workspace_id = ? AND f.date >= ? AND f.date <= ?
      GROUP BY f.workspace_id, f.date, f.platform, f.campaign_id
    `,
  })

  return toRowsAffected(result.rowsAffected)
}
