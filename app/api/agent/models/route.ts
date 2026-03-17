import { listProviderModels } from "@/lib/agent/providers"
import { loadWorkspaceAgentSettings } from "@/lib/agent/settings"
import type { AgentProvider } from "@/lib/agent/types"
import { resolveDashboardSession } from "@/lib/dashboard-session"

export const dynamic = "force-dynamic"

function isAgentProvider(value: string): value is AgentProvider {
  return value === "openai" || value === "anthropic"
}

export async function POST(request: Request) {
  const session = await resolveDashboardSession()
  const body = (await request.json()) as {
    candidateApiKey?: string
    provider?: string
    workspaceId?: string
  }
  const workspaceId =
    String(body.workspaceId ?? "").trim() || session.defaultWorkspaceId
  const provider = String(body.provider ?? "").trim()
  const hasWorkspace = session.workspaceMemberships.some(
    (workspace) => workspace.id === workspaceId
  )

  if (!hasWorkspace) {
    return Response.json(
      {
        message: "The selected workspace is not available in the current session.",
      },
      { status: 403 }
    )
  }

  if (!isAgentProvider(provider)) {
    return Response.json(
      {
        message: "Provider must be openai or anthropic.",
      },
      { status: 400 }
    )
  }

  const settings = await loadWorkspaceAgentSettings(workspaceId)
  const candidateApiKey =
    String(body.candidateApiKey ?? "").trim() ||
    String(settings.apiKeyByProvider[provider] ?? "").trim()

  if (!candidateApiKey) {
    return Response.json(
      {
        message: `No ${provider} API key is available to verify.`,
      },
      { status: 400 }
    )
  }

  try {
    const models = await listProviderModels(provider, candidateApiKey)
    return Response.json({
      models,
      provider,
      verified: true,
    })
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to verify the candidate API key.",
        models: [],
        provider,
        verified: false,
      },
      { status: 400 }
    )
  }
}
