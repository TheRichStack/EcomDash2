import "server-only"

import { queryFirst } from "@/lib/db/query"
import type { DashboardRefreshStatusData } from "@/types/backend"

type LatestSuccessfulHourlyJobRow = {
  finished_at?: string | null
  started_at?: string | null
}

type HourlyCursorRow = {
  updated_at?: string | null
}

function readString(value: unknown) {
  const normalized = String(value ?? "").trim()

  return normalized || null
}

export async function loadDashboardRefreshStatus(
  workspaceId: string
): Promise<DashboardRefreshStatusData> {
  const [latestSuccessfulHourlyJob, hourlyCursor] = await Promise.all([
    queryFirst<LatestSuccessfulHourlyJobRow>(
      `
        SELECT finished_at, started_at
        FROM job_runs
        WHERE workspace_id = ?
          AND job_name = 'jobs:sync:hourly'
          AND LOWER(status) = 'success'
        ORDER BY COALESCE(NULLIF(finished_at, ''), NULLIF(started_at, '')) DESC
        LIMIT 1
      `,
      [workspaceId],
      { bypassCache: true }
    ),
    queryFirst<HourlyCursorRow>(
      `
        SELECT updated_at
        FROM sync_state
        WHERE workspace_id = ?
          AND source_key = 'hourly_sync'
          AND state_key = 'cursor'
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [workspaceId],
      { bypassCache: true }
    ),
  ])

  const latestSuccessfulHourlyJobAt =
    readString(latestSuccessfulHourlyJob?.finished_at) ??
    readString(latestSuccessfulHourlyJob?.started_at)
  const hourlyCursorUpdatedAt = readString(hourlyCursor?.updated_at)
  const lastSuccessfulHourlySyncAt =
    latestSuccessfulHourlyJobAt ?? hourlyCursorUpdatedAt

  return {
    workspaceId,
    lastSuccessfulHourlySyncAt,
    lastSuccessfulHourlySyncSource: lastSuccessfulHourlySyncAt
      ? latestSuccessfulHourlyJobAt
        ? "job_runs"
        : "sync_state"
      : "unknown",
    hourlyCursorUpdatedAt,
  }
}
