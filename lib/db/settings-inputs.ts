import "server-only"

import { randomUUID } from "node:crypto"

import { getTursoClient } from "@/lib/db/client"
import { clearQueryRowsCache, queryFirst } from "@/lib/db/query"

type BudgetPlanMonthlyWriteRow = {
  month: string
  channel: string
  budget: number | string
  notes: string
}

type TargetEntryWriteRow = {
  settingKey: string
  settingValue: string
  description: string
}

type BudgetTargetsMetaRow = {
  workspace_id: string
  validation_status: string
  last_applied_at: string
  last_run_at: string
  last_run_result: string
  message: string
  updated_at: string
}

type BudgetTargetsMetaPatch = Partial<{
  validationStatus: string
  lastAppliedAt: string
  lastRunAt: string
  lastRunResult: string
  message: string
}>

type TargetCanonicalWriteRow = {
  rangeId: string
  rangeType: string
  priority: number
  startDate: string
  endDate: string
  currency: string
  revenueTarget: number | string
  adBudget: number | string
  profitTarget: number | string
  targetMer: number | string
  targetAdCostPct: number | string
  notes: string
  sourceSheet: string
  sourceRow: number
  updatedAt: string
}

type TargetEffectiveWriteRow = {
  date: string
  currency: string
  revenueTarget: number | string
  adBudget: number | string
  profitTarget: number | string
  targetMer: number | string
  targetAdCostPct: number | string
  appliedRangeIds: string
  modeRevenue: string
  modeAdBudget: string
  modeProfit: string
  updatedAt: string
}

type TargetErrorWriteRow = {
  sheetName: string
  sourceRow: number
  field: string
  message: string
  value: string
  createdAt?: string
}

type JobRunStatus = "running" | "success" | "failed" | "skipped"

const SQLITE_PARAM_LIMIT = 900

function nowIsoTimestamp() {
  return new Date().toISOString()
}

function chunkRows<T>(rows: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize))
  }

  return chunks
}

function getChunkSize(columnCount: number) {
  return Math.max(1, Math.floor(SQLITE_PARAM_LIMIT / columnCount))
}

async function executeWithClient(sql: string, args: readonly unknown[] = []) {
  const client = await getTursoClient()
  return client.execute({ sql, args })
}

async function replaceWorkspaceRows(
  workspaceId: string,
  tableName: string,
  columns: string[],
  rows: unknown[][]
) {
  const client = await getTursoClient()

  await client.execute({
    sql: `DELETE FROM ${tableName} WHERE workspace_id = ?`,
    args: [workspaceId],
  })

  if (!rows.length) {
    clearQueryRowsCache()
    return
  }

  const chunkSize = getChunkSize(columns.length)

  for (const chunk of chunkRows(rows, chunkSize)) {
    const placeholders = chunk
      .map(() => `(${columns.map(() => "?").join(", ")})`)
      .join(", ")

    await client.execute({
      sql: `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES ${placeholders}`,
      args: chunk.flat(),
    })
  }

  clearQueryRowsCache()
}

export async function startJobRun(
  workspaceId: string,
  jobName: string,
  details?: Record<string, unknown>
) {
  const runId = randomUUID()
  const timestamp = nowIsoTimestamp()

  await executeWithClient(
    `
      INSERT INTO job_runs (
        run_id,
        workspace_id,
        job_name,
        status,
        started_at,
        finished_at,
        message,
        details_json
      ) VALUES (?, ?, ?, 'running', ?, '', '', ?)
    `,
    [runId, workspaceId, jobName, timestamp, JSON.stringify(details ?? {})]
  )

  clearQueryRowsCache()

  return runId
}

export async function finishJobRun(
  runId: string,
  status: JobRunStatus,
  message = "",
  details?: Record<string, unknown>
) {
  await executeWithClient(
    `
      UPDATE job_runs
      SET status = ?, finished_at = ?, message = ?, details_json = ?
      WHERE run_id = ?
    `,
    [status, nowIsoTimestamp(), message, JSON.stringify(details ?? {}), runId]
  )

  clearQueryRowsCache()
}

export async function replaceBudgetPlanMonthlyRows(
  workspaceId: string,
  rows: BudgetPlanMonthlyWriteRow[]
) {
  await replaceWorkspaceRows(
    workspaceId,
    "budget_plan_monthly",
    ["workspace_id", "month", "channel", "budget", "notes"],
    rows
      .filter((row) => String(row.month).trim() && String(row.channel).trim())
      .map((row) => [
        workspaceId,
        row.month,
        row.channel,
        row.budget,
        row.notes || "",
      ])
  )
}

export async function upsertTargetEntriesRows(
  workspaceId: string,
  rows: TargetEntryWriteRow[]
) {
  if (!rows.length) {
    return
  }

  const client = await getTursoClient()
  const updatedAt = nowIsoTimestamp()

  for (const row of rows) {
    const settingKey = String(row.settingKey ?? "").trim()

    if (!settingKey) {
      continue
    }

    await client.execute({
      sql: `
        INSERT INTO targets_entries (
          workspace_id,
          setting_key,
          setting_value,
          description,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, setting_key)
        DO UPDATE SET
          setting_value = excluded.setting_value,
          description = excluded.description,
          updated_at = excluded.updated_at
      `,
      args: [
        workspaceId,
        settingKey,
        String(row.settingValue ?? ""),
        String(row.description ?? ""),
        updatedAt,
      ],
    })
  }

  clearQueryRowsCache()
}

export async function upsertBudgetTargetsMetaRow(
  workspaceId: string,
  patch: BudgetTargetsMetaPatch
) {
  const existing = await queryFirst<BudgetTargetsMetaRow>(
    `
      SELECT
        workspace_id,
        validation_status,
        last_applied_at,
        last_run_at,
        last_run_result,
        message,
        updated_at
      FROM budget_targets_meta
      WHERE workspace_id = ?
      LIMIT 1
    `,
    [workspaceId],
    {
      bypassCache: true,
    }
  )
  const updatedAt = nowIsoTimestamp()

  await executeWithClient(
    `
      INSERT INTO budget_targets_meta (
        workspace_id,
        validation_status,
        last_applied_at,
        last_run_at,
        last_run_result,
        message,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id)
      DO UPDATE SET
        validation_status = excluded.validation_status,
        last_applied_at = excluded.last_applied_at,
        last_run_at = excluded.last_run_at,
        last_run_result = excluded.last_run_result,
        message = excluded.message,
        updated_at = excluded.updated_at
    `,
    [
      workspaceId,
      patch.validationStatus || existing?.validation_status || "",
      patch.lastAppliedAt || existing?.last_applied_at || "",
      patch.lastRunAt || existing?.last_run_at || "",
      patch.lastRunResult || existing?.last_run_result || "",
      patch.message || existing?.message || "",
      updatedAt,
    ]
  )

  clearQueryRowsCache()
}

export async function replaceTargetsCanonicalRows(
  workspaceId: string,
  rows: TargetCanonicalWriteRow[]
) {
  await replaceWorkspaceRows(
    workspaceId,
    "targets_canonical_ranges",
    [
      "workspace_id",
      "range_id",
      "range_type",
      "priority",
      "start_date",
      "end_date",
      "currency",
      "revenue_target",
      "ad_budget",
      "profit_target",
      "target_mer",
      "target_ad_cost_pct",
      "notes",
      "source_sheet",
      "source_row",
      "updated_at",
    ],
    rows.map((row) => [
      workspaceId,
      row.rangeId,
      row.rangeType,
      row.priority,
      row.startDate,
      row.endDate,
      row.currency,
      row.revenueTarget,
      row.adBudget,
      row.profitTarget,
      row.targetMer,
      row.targetAdCostPct,
      row.notes || "",
      row.sourceSheet || "settings_inputs",
      row.sourceRow || 0,
      row.updatedAt || nowIsoTimestamp(),
    ])
  )
}

export async function replaceTargetsEffectiveRows(
  workspaceId: string,
  rows: TargetEffectiveWriteRow[]
) {
  await replaceWorkspaceRows(
    workspaceId,
    "targets_effective_daily",
    [
      "workspace_id",
      "date",
      "currency",
      "revenue_target",
      "ad_budget",
      "profit_target",
      "target_mer",
      "target_ad_cost_pct",
      "applied_range_ids",
      "mode_revenue",
      "mode_ad_budget",
      "mode_profit",
      "updated_at",
    ],
    rows.map((row) => [
      workspaceId,
      row.date,
      row.currency || "GBP",
      row.revenueTarget,
      row.adBudget,
      row.profitTarget,
      row.targetMer,
      row.targetAdCostPct,
      row.appliedRangeIds || "",
      row.modeRevenue || "",
      row.modeAdBudget || "",
      row.modeProfit || "",
      row.updatedAt || nowIsoTimestamp(),
    ])
  )
}

export async function replaceTargetsErrorRows(
  workspaceId: string,
  rows: TargetErrorWriteRow[]
) {
  await replaceWorkspaceRows(
    workspaceId,
    "targets_errors",
    [
      "workspace_id",
      "sheet_name",
      "source_row",
      "field",
      "message",
      "value",
      "created_at",
    ],
    rows.map((row) => [
      workspaceId,
      row.sheetName || "Settings",
      row.sourceRow || 0,
      row.field || "",
      row.message || "",
      row.value || "",
      row.createdAt || nowIsoTimestamp(),
    ])
  )
}
