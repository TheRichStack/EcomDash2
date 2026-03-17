import { resolveProviderModel } from "@/lib/agent/providers"
import { loadWorkspaceAgentSettings, resolveWorkspaceAgentCredential } from "@/lib/agent/settings"
import {
  createAgentConversation,
  listAgentConversations,
} from "@/lib/agent/storage"
import { resolveDashboardSession } from "@/lib/dashboard-session"

export const dynamic = "force-dynamic"

function assertWorkspaceMembership(
  session: Awaited<ReturnType<typeof resolveDashboardSession>>,
  workspaceId: string
) {
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

  assertWorkspaceMembership(session, workspaceId)

  const conversations = await listAgentConversations(workspaceId)

  return Response.json({
    conversations,
  })
}

export async function POST(request: Request) {
  const session = await resolveDashboardSession()
  const body = (await request.json()) as {
    title?: string
    workspaceId?: string
  }
  const workspaceId =
    String(body.workspaceId ?? "").trim() || session.defaultWorkspaceId

  assertWorkspaceMembership(session, workspaceId)

  const settings = await loadWorkspaceAgentSettings(workspaceId)
  let provider = settings.provider ?? ""
  let model = settings.model || "auto"

  if (settings.provider && settings.hasKeyByProvider[settings.provider]) {
    try {
      const resolved = await resolveWorkspaceAgentCredential({ workspaceId })
      provider = resolved.provider
      model = await resolveProviderModel({
        apiKey: resolved.apiKey,
        provider: resolved.provider,
        selectedModel: resolved.model,
      })
    } catch {
      provider = settings.provider ?? ""
      model = settings.model || "auto"
    }
  }

  const conversation = await createAgentConversation({
    model,
    provider,
    title: String(body.title ?? "").trim() || "New chat",
    workspaceId,
  })

  return Response.json({
    conversation,
  })
}
