import "server-only"

import { env } from "@/lib/env"
import { AGENT_ALLOWED_OPS } from "@/lib/agent/constants"
import { getAgentDataset } from "@/lib/agent/tools"
import type {
  AgentBrokerTokenPayload,
  AgentDashboardContext,
} from "@/lib/agent/types"
import { createSignedToken, verifySignedToken } from "@/lib/agent/utils"
import { ECOMDASH2_TABLE_BOUNDARY } from "@/lib/db/boundary"
import { queryRows } from "@/lib/db/query"
import { createJobRuntimeContext } from "@/lib/jobs/runtime/context"
import { runContractsRefresh } from "@/lib/jobs/runners/contracts-refresh"
import { runHourlySync } from "@/lib/jobs/runners/hourly"
import { runDailyReconcile } from "@/lib/jobs/runners/reconcile"
import type { DashboardRequestContext, DashboardSession } from "@/types/dashboard"

const ALLOWED_SQL_TABLES: string[] = Object.values(ECOMDASH2_TABLE_BOUNDARY).map(
  (entry) => entry.tableName
)

function requireAgentSecret() {
  const secret = String(env.agent.sharedSecret ?? "").trim()

  if (!secret) {
    throw new Error("Missing ECOMDASH2_AGENT_SHARED_SECRET or DATA_ENCRYPTION_KEY.")
  }

  return secret
}

function normalizeAllowedOps(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((op) => String(op ?? "").trim())
    .filter(Boolean)
}

export function createAgentBrokerToken(
  payload: Omit<AgentBrokerTokenPayload, "allowedOps"> & {
    allowedOps?: string[]
  }
) {
  return createSignedToken(
    {
      ...payload,
      allowedOps: normalizeAllowedOps(payload.allowedOps),
    },
    requireAgentSecret()
  )
}

export function verifyAgentBrokerToken(token: string) {
  const payload = verifySignedToken<
    Omit<AgentBrokerTokenPayload, "allowedOps"> & {
      allowedOps?: string[]
    }
  >(
    token,
    requireAgentSecret()
  )

  if (!payload) {
    throw new Error("Invalid broker token.")
  }

  if (payload.expiresAt < Date.now()) {
    throw new Error("Expired broker token.")
  }

  return {
    ...payload,
    allowedOps: normalizeAllowedOps(payload.allowedOps),
  }
}

export function buildBrokerDashboardContext(input: {
  dashboardContext: AgentDashboardContext
  session: DashboardSession
}): DashboardRequestContext {
  return {
    compare: input.dashboardContext.compare,
    from: input.dashboardContext.from,
    session: input.session,
    to: input.dashboardContext.to,
    workspaceId: input.dashboardContext.workspaceId,
  }
}

function sanitizeSingleTableQuery(sql: string, workspaceId: string) {
  const normalized = String(sql ?? "").trim().replace(/;+\s*$/, "")

  if (!/^(select|with)\b/i.test(normalized)) {
    throw new Error("Only SELECT queries are allowed.")
  }

  if (
    /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|begin|commit)\b/i.test(
      normalized
    )
  ) {
    throw new Error("Mutating SQL is not allowed.")
  }

  const tables = Array.from(
    normalized.matchAll(/\b(?:from|join)\s+([a-zA-Z0-9_]+)/gi)
  ).map((match) => String(match[1] ?? "").trim())

  if (tables.length !== 1) {
    throw new Error("SQL broker currently supports single-table queries only.")
  }

  if (!ALLOWED_SQL_TABLES.includes(tables[0])) {
    throw new Error(`Table "${tables[0]}" is not in the allowed boundary.`)
  }

  const match = normalized.match(
    /^select\s+([\s\S]+?)\s+from\s+([a-zA-Z0-9_]+)([\s\S]*)$/i
  )

  if (!match) {
    throw new Error("Unable to parse the SQL query.")
  }

  const [, selectClause, tableName, tailRaw] = match
  const tail = String(tailRaw ?? "")
  const whereMatch = tail.match(
    /^\s*where\s+([\s\S]*?)(\s+order\s+by[\s\S]*|\s+limit\s+[\s\S]*|)$/i
  )
  const enforceSqlLimit = (statement: string) => {
    const limitMatch = statement.match(/\blimit\s+(\d+)\b/i)

    if (!limitMatch) {
      return `${statement} LIMIT ${env.agent.sqlMaxRows}`
    }

    const requestedLimit = Number.parseInt(String(limitMatch[1] ?? ""), 10)

    if (!Number.isFinite(requestedLimit) || requestedLimit <= 0) {
      return statement.replace(/\blimit\s+\d+\b/i, `LIMIT ${env.agent.sqlMaxRows}`)
    }

    if (requestedLimit > env.agent.sqlMaxRows) {
      return statement.replace(/\blimit\s+\d+\b/i, `LIMIT ${env.agent.sqlMaxRows}`)
    }

    return statement
  }

  if (whereMatch) {
    const whereBody = String(whereMatch[1] ?? "").trim()
    const suffix = String(whereMatch[2] ?? "")
    const statement = `SELECT ${selectClause} FROM ${tableName} WHERE workspace_id = ? AND (${whereBody})${suffix}`

    return {
      args: [workspaceId],
      sql: enforceSqlLimit(statement),
    }
  }

  const statement = `SELECT ${selectClause} FROM ${tableName} WHERE workspace_id = ?${tail}`

  return {
    args: [workspaceId],
    sql: enforceSqlLimit(statement),
  }
}

export async function runAgentDatasetBroker(input: {
  context: DashboardRequestContext
  dataset: string
}) {
  return getAgentDataset(input)
}

export async function runAgentSqlBroker(input: {
  sql: string
  workspaceId: string
}) {
  const statement = sanitizeSingleTableQuery(input.sql, input.workspaceId)

  return queryRows<Record<string, unknown>>(statement.sql, statement.args, {
    bypassCache: true,
  })
}

export async function runAgentOpsBroker(input: {
  op: (typeof AGENT_ALLOWED_OPS)[number]
  workspaceId: string
}) {
  if (!AGENT_ALLOWED_OPS.includes(input.op)) {
    throw new Error(`Operation "${input.op}" is not allowed.`)
  }

  if (!env.agent.allowInlineOps) {
    throw new Error(
      "Inline ops dispatch is disabled. Set ECOMDASH2_AGENT_ALLOW_INLINE_OPS=1 to enable it."
    )
  }

  const context = await createJobRuntimeContext({
    jobName: input.op,
    workspaceId: input.workspaceId,
  })

  switch (input.op) {
    case "jobs:contracts:refresh":
      return runContractsRefresh(context)
    case "jobs:hourly":
      return runHourlySync(context)
    case "jobs:reconcile":
      return runDailyReconcile(context)
  }
}
