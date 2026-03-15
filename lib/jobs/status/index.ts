import { randomUUID } from "node:crypto"

import type { JobDatabaseClient } from "@/lib/jobs/runtime/db"

export type JobRunStatus = "failed" | "running" | "skipped" | "success"

export type SyncStateRecord = {
  sourceKey: string
  stateKey: string
  stateValue: string
  updatedAt: string
  workspaceId: string
}

export type BackfillRunRecord = {
  cursorDate: string
  detailsJson: string
  finishedAt: string
  message: string
  runId: string
  sourceKey: string
  startedAt: string
  status: string
  workspaceId: string
}

function nowIsoTimestamp() {
  return new Date().toISOString()
}

function readString(value: unknown, trim = true) {
  const normalized = String(value ?? "")
  return trim ? normalized.trim() : normalized
}

function serializeDetails(details?: Record<string, unknown>) {
  return JSON.stringify(details ?? {})
}

async function queryFirstRow<T extends Record<string, unknown>>(
  client: JobDatabaseClient,
  sql: string,
  args: readonly unknown[]
) {
  const result = await client.execute({ args, sql })

  return ((result.rows ?? [])[0] as T | undefined) ?? null
}

export async function startJobRun(
  client: JobDatabaseClient,
  input: {
    details?: Record<string, unknown>
    jobName: string
    workspaceId: string
  }
) {
  const runId = randomUUID()

  await client.execute({
    args: [
      runId,
      input.workspaceId,
      input.jobName,
      nowIsoTimestamp(),
      serializeDetails(input.details),
    ],
    sql: `
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
  })

  return runId
}

export async function finishJobRun(
  client: JobDatabaseClient,
  input: {
    details?: Record<string, unknown>
    message?: string
    runId: string
    status: JobRunStatus
  }
) {
  await client.execute({
    args: [
      input.status,
      nowIsoTimestamp(),
      String(input.message ?? ""),
      serializeDetails(input.details),
      input.runId,
    ],
    sql: `
      UPDATE job_runs
      SET status = ?, finished_at = ?, message = ?, details_json = ?
      WHERE run_id = ?
    `,
  })
}

export async function getSyncState(
  client: JobDatabaseClient,
  input: {
    sourceKey: string
    stateKey?: string
    workspaceId: string
  }
): Promise<SyncStateRecord | null> {
  const row = await queryFirstRow<Record<string, unknown>>(
    client,
    `
      SELECT workspace_id, source_key, state_key, state_value, updated_at
      FROM sync_state
      WHERE workspace_id = ? AND source_key = ? AND state_key = ?
      LIMIT 1
    `,
    [input.workspaceId, input.sourceKey, input.stateKey ?? "cursor"]
  )

  if (!row) {
    return null
  }

  return {
    sourceKey: readString(row.source_key),
    stateKey: readString(row.state_key),
    stateValue: readString(row.state_value, false),
    updatedAt: readString(row.updated_at),
    workspaceId: readString(row.workspace_id),
  }
}

export async function upsertSyncState(
  client: JobDatabaseClient,
  input: {
    sourceKey: string
    stateKey?: string
    stateValue: string
    workspaceId: string
  }
) {
  await client.execute({
    args: [
      input.workspaceId,
      input.sourceKey,
      input.stateKey ?? "cursor",
      input.stateValue,
      nowIsoTimestamp(),
    ],
    sql: `
      INSERT INTO sync_state (
        workspace_id,
        source_key,
        state_key,
        state_value,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id, source_key, state_key)
      DO UPDATE SET
        state_value = excluded.state_value,
        updated_at = excluded.updated_at
    `,
  })
}

export async function createBackfillRun(
  client: JobDatabaseClient,
  input: {
    details?: Record<string, unknown>
    sourceKey: string
    workspaceId: string
  }
) {
  const runId = randomUUID()

  await client.execute({
    args: [
      runId,
      input.workspaceId,
      nowIsoTimestamp(),
      input.sourceKey,
      serializeDetails(input.details),
    ],
    sql: `
      INSERT INTO backfill_runs (
        run_id,
        workspace_id,
        status,
        started_at,
        finished_at,
        cursor_date,
        source_key,
        message,
        details_json
      ) VALUES (?, ?, 'running', ?, '', '', ?, '', ?)
    `,
  })

  return runId
}

export async function findLatestBackfillRun(
  client: JobDatabaseClient,
  input: {
    sourceKey: string
    workspaceId: string
  }
): Promise<BackfillRunRecord | null> {
  const row = await queryFirstRow<Record<string, unknown>>(
    client,
    `
      SELECT
        run_id,
        workspace_id,
        status,
        started_at,
        finished_at,
        cursor_date,
        source_key,
        message,
        details_json
      FROM backfill_runs
      WHERE workspace_id = ? AND source_key = ?
      ORDER BY started_at DESC
      LIMIT 1
    `,
    [input.workspaceId, input.sourceKey]
  )

  if (!row) {
    return null
  }

  return {
    cursorDate: readString(row.cursor_date),
    detailsJson: readString(row.details_json, false),
    finishedAt: readString(row.finished_at),
    message: readString(row.message, false),
    runId: readString(row.run_id),
    sourceKey: readString(row.source_key),
    startedAt: readString(row.started_at),
    status: readString(row.status),
    workspaceId: readString(row.workspace_id),
  }
}

export async function updateBackfillRun(
  client: JobDatabaseClient,
  input: {
    cursorDate?: string
    details?: Record<string, unknown>
    finishedAt?: string
    message?: string
    runId: string
    sourceKey?: string
    status?: JobRunStatus
  }
) {
  const existing = await queryFirstRow<Record<string, unknown>>(
    client,
    `
      SELECT
        status,
        finished_at,
        cursor_date,
        source_key,
        message,
        details_json
      FROM backfill_runs
      WHERE run_id = ?
      LIMIT 1
    `,
    [input.runId]
  )

  if (!existing) {
    return
  }

  await client.execute({
    args: [
      input.status ?? readString(existing.status),
      input.finishedAt ?? readString(existing.finished_at),
      input.cursorDate ?? readString(existing.cursor_date),
      input.sourceKey ?? readString(existing.source_key),
      input.message ?? readString(existing.message, false),
      input.details
        ? serializeDetails(input.details)
        : readString(existing.details_json, false) || "{}",
      input.runId,
    ],
    sql: `
      UPDATE backfill_runs
      SET status = ?,
          finished_at = ?,
          cursor_date = ?,
          source_key = ?,
          message = ?,
          details_json = ?
      WHERE run_id = ?
    `,
  })
}

export { nowIsoTimestamp }
