import "server-only"

import { executeStatement, queryFirst, queryRows } from "@/lib/db/query"
import type {
  AgentRunStatus,
  AgentStorageConversation,
  AgentStorageMessage,
} from "@/lib/agent/types"
import {
  compactText,
  generateAgentId,
  nowIso,
  parseJsonRecord,
  stringifyJson,
} from "@/lib/agent/utils"

type ConversationRow = {
  conversation_id?: string
  created_at?: string
  last_message_at?: string
  model?: string
  provider?: string
  summary_text?: string
  summary_updated_at?: string
  title?: string
  updated_at?: string
  workspace_id?: string
}

type MessageRow = {
  content_text?: string
  created_at?: string
  message_id?: string
  metadata_json?: string
  role?: "user" | "assistant" | "system"
}

type PendingWorkerPlanRow = {
  run_id?: string
  payload_json?: string
}

type ArtifactRow = {
  created_at?: string
  payload_json?: string
}

function parseConversation(row: ConversationRow): AgentStorageConversation {
  return {
    createdAt: String(row.created_at ?? ""),
    id: String(row.conversation_id ?? ""),
    lastMessageAt: String(row.last_message_at ?? ""),
    model: String(row.model ?? ""),
    provider: String(row.provider ?? ""),
    summaryText: String(row.summary_text ?? "").trim() || null,
    summaryUpdatedAt: String(row.summary_updated_at ?? "").trim() || null,
    title: String(row.title ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
  }
}

function parseMessage(row: MessageRow): AgentStorageMessage {
  return {
    content: String(row.content_text ?? ""),
    createdAt: String(row.created_at ?? ""),
    id: String(row.message_id ?? ""),
    metadata: parseJsonRecord(String(row.metadata_json ?? "{}")),
    role: (String(row.role ?? "assistant") as AgentStorageMessage["role"]) ?? "assistant",
  }
}

async function touchConversation(input: {
  conversationId: string
  lastMessageAt: string
  model?: string
  provider?: string
  title?: string
}) {
  await executeStatement(
    `
      UPDATE agent_conversations
      SET
        last_message_at = ?,
        updated_at = ?,
        provider = CASE WHEN ? <> '' THEN ? ELSE provider END,
        model = CASE WHEN ? <> '' THEN ? ELSE model END,
        title = CASE WHEN ? <> '' THEN ? ELSE title END
      WHERE conversation_id = ?
    `,
    [
      input.lastMessageAt,
      input.lastMessageAt,
      input.provider ?? "",
      input.provider ?? "",
      input.model ?? "",
      input.model ?? "",
      input.title ?? "",
      input.title ?? "",
      input.conversationId,
    ]
  )
}

export async function getLatestAgentConversation(workspaceId: string) {
  const row = await queryFirst<ConversationRow>(
    `
      SELECT conversation_id, workspace_id, title, summary_text, summary_updated_at, provider, model, created_at, updated_at, last_message_at
      FROM agent_conversations
      WHERE workspace_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [workspaceId],
    { bypassCache: true }
  )

  return row ? parseConversation(row) : null
}

export async function getAgentConversationById(conversationId: string) {
  const row = await queryFirst<ConversationRow>(
    `
      SELECT conversation_id, workspace_id, title, summary_text, summary_updated_at, provider, model, created_at, updated_at, last_message_at
      FROM agent_conversations
      WHERE conversation_id = ?
      LIMIT 1
    `,
    [conversationId],
    { bypassCache: true }
  )

  return row ? parseConversation(row) : null
}

export async function listAgentConversations(workspaceId: string, limit = 24) {
  const rows = await queryRows<ConversationRow>(
    `
      SELECT conversation_id, workspace_id, title, summary_text, summary_updated_at, provider, model, created_at, updated_at, last_message_at
      FROM agent_conversations
      WHERE workspace_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `,
    [workspaceId, limit],
    { bypassCache: true }
  )

  return rows.map(parseConversation)
}

export async function createAgentConversation(input: {
  workspaceId: string
  provider: string
  model: string
  title: string
}) {
  const conversationId = generateAgentId("conv")
  const timestamp = nowIso()

  await executeStatement(
    `
      INSERT INTO agent_conversations (
        conversation_id,
        workspace_id,
        title,
        summary_text,
        summary_updated_at,
        provider,
        model,
        created_at,
        updated_at,
        last_message_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      conversationId,
      input.workspaceId,
      compactText(input.title, 96),
      "",
      "",
      input.provider,
      input.model,
      timestamp,
      timestamp,
      timestamp,
    ]
  )

  return {
    createdAt: timestamp,
    id: conversationId,
    lastMessageAt: timestamp,
    model: input.model,
    provider: input.provider,
    summaryText: null,
    summaryUpdatedAt: null,
    title: compactText(input.title, 96),
    updatedAt: timestamp,
    workspaceId: input.workspaceId,
  } satisfies AgentStorageConversation
}

export async function updateAgentConversationTitle(input: {
  conversationId: string
  title: string
}) {
  const title = compactText(input.title, 96)

  await executeStatement(
    `
      UPDATE agent_conversations
      SET
        title = ?,
        updated_at = ?
      WHERE conversation_id = ?
    `,
    [title, nowIso(), input.conversationId]
  )
}

export async function deleteAgentConversation(conversationId: string) {
  await executeStatement(
    `
      DELETE FROM agent_artifacts
      WHERE conversation_id = ?
    `,
    [conversationId]
  )

  await executeStatement(
    `
      DELETE FROM agent_runs
      WHERE conversation_id = ?
    `,
    [conversationId]
  )

  await executeStatement(
    `
      DELETE FROM agent_messages
      WHERE conversation_id = ?
    `,
    [conversationId]
  )

  await executeStatement(
    `
      DELETE FROM agent_conversations
      WHERE conversation_id = ?
    `,
    [conversationId]
  )
}

export async function updateAgentConversationSummary(input: {
  conversationId: string
  summaryText: string
}) {
  const updatedAt = nowIso()

  await executeStatement(
    `
      UPDATE agent_conversations
      SET
        summary_text = ?,
        summary_updated_at = ?,
        updated_at = ?
      WHERE conversation_id = ?
    `,
    [compactText(input.summaryText, 1200), updatedAt, updatedAt, input.conversationId]
  )

  return updatedAt
}

export async function listAgentMessages(conversationId: string) {
  const rows = await queryRows<MessageRow>(
    `
      SELECT message_id, role, content_text, metadata_json, created_at
      FROM agent_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `,
    [conversationId],
    { bypassCache: true }
  )

  return rows.map(parseMessage)
}

export async function getLatestPendingWorkerPlan(conversationId: string) {
  const row = await queryFirst<PendingWorkerPlanRow>(
    `
      SELECT r.run_id, a.payload_json
      FROM agent_runs r
      JOIN agent_artifacts a
        ON a.run_id = r.run_id
       AND a.artifact_type = 'worker_plan'
      WHERE r.conversation_id = ?
        AND r.execution_mode = 'worker'
        AND r.status = 'needs_confirmation'
      ORDER BY r.started_at DESC, a.created_at DESC
      LIMIT 1
    `,
    [conversationId],
    { bypassCache: true }
  )

  if (!row) {
    return null
  }

  const runId = String(row.run_id ?? "").trim()

  if (!runId) {
    return null
  }

  return {
    payload: parseJsonRecord(String(row.payload_json ?? "{}")),
    runId,
  }
}

export async function getLatestAgentArtifactByLabel(input: {
  artifactType: string
  label: string
  workspaceId: string
}) {
  const row = await queryFirst<ArtifactRow>(
    `
      SELECT payload_json, created_at
      FROM agent_artifacts
      WHERE workspace_id = ?
        AND artifact_type = ?
        AND label = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [input.workspaceId, input.artifactType, input.label],
    { bypassCache: true }
  )

  if (!row) {
    return null
  }

  return {
    createdAt: String(row.created_at ?? "").trim(),
    payload: parseJsonRecord(String(row.payload_json ?? "{}")),
  }
}

export async function getAgentWorkspaceUsageTotals(input: {
  workspaceId: string
  from: string
}) {
  const row = await queryFirst<{
    estimated_cost_usd?: number
    run_count?: number
  }>(
    `
      SELECT
        COALESCE(SUM(CAST(json_extract(metadata_json, '$.usage.estimatedCostUsd') AS REAL)), 0) AS estimated_cost_usd,
        COUNT(*) AS run_count
      FROM agent_messages
      WHERE workspace_id = ?
        AND role = 'assistant'
        AND created_at >= ?
    `,
    [input.workspaceId, input.from],
    { bypassCache: true }
  )

  return {
    estimatedCostUsd: Number(row?.estimated_cost_usd ?? 0),
    runCount: Number(row?.run_count ?? 0),
  }
}

export async function createAgentMessage(input: {
  conversationId: string
  workspaceId: string
  role: AgentStorageMessage["role"]
  content: string
  metadata?: Record<string, unknown>
}) {
  const messageId = generateAgentId("msg")
  const createdAt = nowIso()

  await executeStatement(
    `
      INSERT INTO agent_messages (
        message_id,
        conversation_id,
        workspace_id,
        role,
        content_text,
        metadata_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      messageId,
      input.conversationId,
      input.workspaceId,
      input.role,
      input.content,
      stringifyJson(input.metadata ?? {}),
      createdAt,
    ]
  )

  await touchConversation({
    conversationId: input.conversationId,
    lastMessageAt: createdAt,
  })

  return {
    content: input.content,
    createdAt,
    id: messageId,
    metadata: input.metadata ?? {},
    role: input.role,
  } satisfies AgentStorageMessage
}

export async function createAgentRun(input: {
  conversationId: string
  workspaceId: string
  userMessageId: string
  provider: string
  model: string
  executionMode: string
  requestedOps: string[]
  usedTools: string[]
}) {
  const runId = generateAgentId("run")
  const startedAt = nowIso()

  await executeStatement(
    `
      INSERT INTO agent_runs (
        run_id,
        conversation_id,
        workspace_id,
        user_message_id,
        provider,
        model,
        execution_mode,
        status,
        requested_ops_json,
        used_tools_json,
        warnings_json,
        message,
        started_at,
        finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      runId,
      input.conversationId,
      input.workspaceId,
      input.userMessageId,
      input.provider,
      input.model,
      input.executionMode,
      "running",
      stringifyJson(input.requestedOps),
      stringifyJson(input.usedTools),
      stringifyJson([]),
      "",
      startedAt,
      "",
    ]
  )

  return {
    runId,
    startedAt,
  }
}

export async function finishAgentRun(input: {
  runId: string
  assistantMessageId?: string
  status: AgentRunStatus
  warnings: string[]
  message: string
}) {
  await executeStatement(
    `
      UPDATE agent_runs
      SET
        assistant_message_id = CASE WHEN ? <> '' THEN ? ELSE assistant_message_id END,
        status = ?,
        warnings_json = ?,
        message = ?,
        finished_at = ?
      WHERE run_id = ?
    `,
    [
      input.assistantMessageId ?? "",
      input.assistantMessageId ?? "",
      input.status,
      stringifyJson(input.warnings),
      input.message,
      nowIso(),
      input.runId,
    ]
  )
}

export async function createAgentArtifact(input: {
  runId: string
  conversationId: string
  workspaceId: string
  artifactType: string
  label?: string
  payload: unknown
}) {
  await executeStatement(
    `
      INSERT INTO agent_artifacts (
        artifact_id,
        run_id,
        conversation_id,
        workspace_id,
        artifact_type,
        label,
        payload_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      generateAgentId("artifact"),
      input.runId,
      input.conversationId,
      input.workspaceId,
      input.artifactType,
      input.label ?? "",
      stringifyJson(input.payload),
      nowIso(),
    ]
  )
}
