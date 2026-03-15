import type { JobDatabaseClient } from "@/lib/jobs/runtime/db"
import type { RuntimeEnv } from "@/lib/jobs/runtime/env"

export type ConnectorMode = "backfill" | "hourly" | "reconcile"

export type ConnectorContext = {
  chunkDays?: number
  client: JobDatabaseClient
  cursor?: string
  env: RuntimeEnv
  from: string
  mode: ConnectorMode
  scope?: string
  syncBatchId?: string
  to: string
  updatedSince?: string
  workspaceId: string
}

export type ConnectorResult = {
  cursor: string
  metadata?: Record<string, unknown>
  processed: number
  tableCounts: Record<string, number>
}

export type ConnectorConfigStatus = {
  configured: boolean
  missing: string[]
  required?: string[]
}

export type AppConnector = {
  backfillWindow(context: ConnectorContext): Promise<ConnectorResult>
  getConfigStatus(runtimeEnv: RuntimeEnv): ConnectorConfigStatus
  implemented: boolean
  name: string
  syncWindow(context: ConnectorContext): Promise<ConnectorResult>
  tableKeys: string[]
}
