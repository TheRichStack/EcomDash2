import type { JobDatabaseClient } from "@/lib/jobs/runtime/db"

import { insertChannelRows } from "@/lib/jobs/contracts/channel"
import { insertCreativeRows } from "@/lib/jobs/contracts/creative"
import { deleteContractRows } from "@/lib/jobs/contracts/helpers"
import { insertOverviewRows } from "@/lib/jobs/contracts/overview"

export type ContractRefreshResult = {
  channelRows: number
  creativeRows: number
  dirtyDateCount: number
  from: string
  mode: "dirty" | "range"
  overviewRows: number
  skipped: boolean
  to: string
}

function normalizeDirtyDates(dirtyDates?: readonly string[]) {
  if (!Array.isArray(dirtyDates)) {
    return null
  }

  return [...new Set(dirtyDates.map((date) => String(date).trim()).filter(Boolean))].sort()
}

export async function loadDirtyContractDates(
  client: JobDatabaseClient,
  workspaceId: string,
  from: string,
  to: string
) {
  const result = await client.execute({
    args: [workspaceId, from, to, workspaceId, from, to],
    sql: `
      SELECT DISTINCT date
      FROM fact_ads_daily
      WHERE workspace_id = ? AND date >= ? AND date <= ?
      UNION
      SELECT DISTINCT order_date AS date
      FROM fact_orders
      WHERE workspace_id = ? AND order_date >= ? AND order_date <= ?
      ORDER BY date
    `,
  })

  return (result.rows ?? [])
    .map((row) => String(row.date ?? "").trim())
    .filter(Boolean)
}

export async function refreshContracts(
  client: JobDatabaseClient,
  workspaceId: string,
  from: string,
  to: string,
  dirtyDates?: readonly string[]
): Promise<ContractRefreshResult> {
  const normalizedDirtyDates = normalizeDirtyDates(dirtyDates)

  if (Array.isArray(normalizedDirtyDates) && normalizedDirtyDates.length === 0) {
    return {
      channelRows: 0,
      creativeRows: 0,
      dirtyDateCount: 0,
      from,
      mode: "dirty",
      overviewRows: 0,
      skipped: true,
      to,
    }
  }

  const insertFrom = normalizedDirtyDates?.[0] ?? from
  const insertTo = normalizedDirtyDates?.[normalizedDirtyDates.length - 1] ?? to
  const updatedAt = new Date().toISOString()

  await deleteContractRows(client, workspaceId, from, to, normalizedDirtyDates ?? undefined)

  const [overviewRows, channelRows, creativeRows] = await Promise.all([
    insertOverviewRows(client, workspaceId, insertFrom, insertTo, updatedAt),
    insertChannelRows(client, workspaceId, insertFrom, insertTo, updatedAt),
    insertCreativeRows(client, workspaceId, insertFrom, insertTo, updatedAt),
  ])

  return {
    channelRows,
    creativeRows,
    dirtyDateCount: normalizedDirtyDates?.length ?? 0,
    from: insertFrom,
    mode: normalizedDirtyDates ? "dirty" : "range",
    overviewRows,
    skipped: false,
    to: insertTo,
  }
}
