import type { JobDatabaseClient } from "@/lib/jobs/runtime/db"

import { toRowsAffected } from "@/lib/jobs/contracts/helpers"

export async function insertCreativeRows(
  client: JobDatabaseClient,
  workspaceId: string,
  from: string,
  to: string,
  updatedAt: string
) {
  const result = await client.execute({
    args: [updatedAt, workspaceId, from, to],
    sql: `
      INSERT OR REPLACE INTO contract_creative_performance (
        workspace_id,
        date,
        creative_id,
        thumbnail_url,
        image_url,
        video_url,
        format,
        headline,
        ad_name,
        platform,
        total_spend,
        total_purchases,
        revenue,
        impressions,
        view_content,
        outbound_clicks,
        video_3s_views,
        video_15s_views,
        video_p25_viewed,
        video_p50_viewed,
        video_p75_viewed,
        video_p100_viewed,
        updated_at
      )
      SELECT
        f.workspace_id,
        f.date,
        COALESCE(NULLIF(f.creative_id, ''), NULLIF(f.ad_id, ''), 'unknown') AS creative_id,
        COALESCE(MAX(d.thumbnail_url), '') AS thumbnail_url,
        COALESCE(MAX(d.image_url), '') AS image_url,
        COALESCE(MAX(d.video_url), '') AS video_url,
        COALESCE(MAX(d.format), '') AS format,
        COALESCE(MAX(d.headline), '') AS headline,
        f.ad_name,
        COALESCE(MAX(d.platform), f.platform) AS platform,
        SUM(f.spend) AS total_spend,
        SUM(f.purchases) AS total_purchases,
        SUM(f.revenue) AS revenue,
        SUM(f.impressions) AS impressions,
        SUM(f.view_content) AS view_content,
        SUM(f.outbound_clicks) AS outbound_clicks,
        SUM(f.video_3s_views) AS video_3s_views,
        SUM(f.video_15s_views) AS video_15s_views,
        SUM(f.video_p25_viewed) AS video_p25_viewed,
        SUM(f.video_p50_viewed) AS video_p50_viewed,
        SUM(f.video_p75_viewed) AS video_p75_viewed,
        SUM(f.video_p100_viewed) AS video_p100_viewed,
        ? AS updated_at
      FROM fact_ads_daily f
      LEFT JOIN dim_creative d
        ON d.workspace_id = f.workspace_id
       AND d.creative_id = COALESCE(NULLIF(f.creative_id, ''), NULLIF(f.ad_id, ''), 'unknown')
      WHERE f.workspace_id = ? AND f.date >= ? AND f.date <= ?
      GROUP BY
        f.workspace_id,
        f.date,
        COALESCE(NULLIF(f.creative_id, ''), NULLIF(f.ad_id, ''), 'unknown'),
        f.ad_name,
        f.platform
    `,
  })

  return toRowsAffected(result.rowsAffected)
}
