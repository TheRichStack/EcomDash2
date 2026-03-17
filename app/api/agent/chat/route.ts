import { AGENT_EVENT_CONTENT_TYPE } from "@/lib/agent/constants"
import { runAgentTurn } from "@/lib/agent/orchestrator"
import { getAgentPreset } from "@/lib/agent/presets"
import { loadWorkspaceAgentSettings } from "@/lib/agent/settings"
import type { AgentPresetId } from "@/lib/agent/types"
import {
  getAgentConversationById,
  getLatestAgentConversation,
  listAgentMessages,
} from "@/lib/agent/storage"
import { resolveDashboardSession } from "@/lib/dashboard-session"

export const dynamic = "force-dynamic"

function buildNdjsonStream(
  producer: (send: (event: Record<string, unknown>) => void) => Promise<void>
) {
  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }

      try {
        await producer(send)
      } catch (error) {
        send({
          message:
            error instanceof Error ? error.message : "Agent request failed.",
          type: "error",
        })
      } finally {
        controller.close()
      }
    },
  })
}

function assertWorkspaceMembership(session: Awaited<ReturnType<typeof resolveDashboardSession>>, workspaceId: string) {
  const allowed = session.workspaceMemberships.some(
    (workspace) => workspace.id === workspaceId
  )

  if (!allowed) {
    throw new Error("The selected workspace is not available in the current session.")
  }
}

export async function GET(request: Request) {
  const session = await resolveDashboardSession()
  const { searchParams } = new URL(request.url)
  const workspaceId =
    searchParams.get("workspaceId")?.trim() || session.defaultWorkspaceId
  const conversationId = searchParams.get("conversationId")?.trim() || ""

  assertWorkspaceMembership(session, workspaceId)

  const setup = await loadWorkspaceAgentSettings(workspaceId)
  let conversation = null
  let messages: Awaited<ReturnType<typeof listAgentMessages>> = []

  try {
    conversation = conversationId
      ? await getAgentConversationById(conversationId)
      : await getLatestAgentConversation(workspaceId)

    if (conversation && conversation.workspaceId === workspaceId) {
      messages = await listAgentMessages(conversation.id)
    }
  } catch {
    conversation = null
    messages = []
  }

  if (!conversation || conversation.workspaceId !== workspaceId) {
    return Response.json({
      conversation: null,
      messages: [],
      setup: {
        businessProfile: setup.businessProfile,
        hasKeyByProvider: setup.hasKeyByProvider,
        isConfigured:
          Boolean(setup.provider) &&
          setup.hasKeyByProvider[setup.provider ?? "openai"],
        model: setup.model,
        provider: setup.provider,
        updatedAt: setup.updatedAt,
      },
    })
  }

  return Response.json({
    conversation,
    messages,
    setup: {
      businessProfile: setup.businessProfile,
      hasKeyByProvider: setup.hasKeyByProvider,
      isConfigured:
        Boolean(setup.provider) &&
        setup.hasKeyByProvider[setup.provider ?? "openai"],
      model: setup.model,
      provider: setup.provider,
      updatedAt: setup.updatedAt,
    },
  })
}

export async function POST(request: Request) {
  const session = await resolveDashboardSession()
  const body = (await request.json()) as {
    confirmedOps?: string[]
    context?: {
      compare?: "none" | "previous_period" | "previous_year"
      from?: string
      to?: string
      workspaceId?: string
    }
    conversationId?: string
    forceNewConversation?: boolean
    message?: string
    presetId?: AgentPresetId
  }
  const workspaceId =
    String(body.context?.workspaceId ?? "").trim() || session.defaultWorkspaceId

  assertWorkspaceMembership(session, workspaceId)

  const stream = buildNdjsonStream(async (send) => {
    const preset = body.presetId ? getAgentPreset(body.presetId) : null
    const message = String(body.message ?? preset?.defaultMessage ?? "").trim()

    if (!message) {
      send({
        message: "Message is required.",
        type: "error",
      })
      return
    }

    send({
      type: "status",
      value: "running",
    })

    const result = await runAgentTurn({
      confirmedOps: Array.isArray(body.confirmedOps) ? body.confirmedOps : undefined,
      context: {
        compare: body.context?.compare ?? "previous_period",
        from: String(body.context?.from ?? "").trim(),
        session,
        to: String(body.context?.to ?? "").trim(),
        workspaceId,
      },
      conversationId: body.forceNewConversation
        ? undefined
        : String(body.conversationId ?? "").trim() || undefined,
      message,
      presetId: preset?.id,
      titleSeed: preset?.titleSeed,
    })

    send({
      conversationId: result.conversationId,
      message: result.assistantMessage,
      requestedOps: result.requestedOps,
      runId: result.runId,
      type: "message",
    })
    send({
      executionMode: result.executionMode,
      requestedOps: result.requestedOps,
      runId: result.runId,
      type: "complete",
      usedTools: result.usedTools,
      warnings: result.warnings,
    })
  })

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": AGENT_EVENT_CONTENT_TYPE,
    },
  })
}
