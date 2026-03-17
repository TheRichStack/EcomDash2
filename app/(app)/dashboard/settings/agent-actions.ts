"use server"

import { revalidatePath } from "next/cache"

import { listProviderModels } from "@/lib/agent/providers"
import { loadWorkspaceAgentSettings, saveWorkspaceAgentSettings } from "@/lib/agent/settings"
import type { AgentProvider } from "@/lib/agent/types"
import { ROUTES } from "@/lib/constants"
import { resolveDashboardSession } from "@/lib/dashboard-session"

type SaveAgentSettingsInput = {
  apiKey?: string
  businessProfile?: string
  model: string
  provider: AgentProvider
  workspaceId: string
}

export type SaveAgentSettingsResult =
  | {
      state: Awaited<ReturnType<typeof loadWorkspaceAgentSettings>>
      status: "success"
    }
  | {
      message: string
      status: "error"
    }

function resolveWritableWorkspaceId(
  session: Awaited<ReturnType<typeof resolveDashboardSession>>,
  preferredWorkspaceId: string
) {
  const workspaceMembershipIds = new Set(
    session.workspaceMemberships
      .map((workspace) => String(workspace.id ?? "").trim())
      .filter(Boolean)
  )
  const requestedWorkspaceId = String(preferredWorkspaceId ?? "").trim()

  if (requestedWorkspaceId && workspaceMembershipIds.has(requestedWorkspaceId)) {
    return requestedWorkspaceId
  }

  const fallback = String(session.defaultWorkspaceId ?? "").trim()

  if (fallback && workspaceMembershipIds.has(fallback)) {
    return fallback
  }

  throw new Error("No writable workspace is available in the current session.")
}

export async function saveAgentWorkspaceSettingsAction(
  input: SaveAgentSettingsInput
): Promise<SaveAgentSettingsResult> {
  try {
    const session = await resolveDashboardSession()
    const workspaceId = resolveWritableWorkspaceId(session, input.workspaceId)
    const settings = await loadWorkspaceAgentSettings(workspaceId)
    const candidateApiKey =
      String(input.apiKey ?? "").trim() ||
      String(settings.apiKeyByProvider[input.provider] ?? "").trim()

    if (!candidateApiKey) {
      return {
        message: `A ${input.provider} API key is required before this provider can be saved.`,
        status: "error",
      }
    }

    await listProviderModels(input.provider, candidateApiKey)
    await saveWorkspaceAgentSettings({
      apiKey: String(input.apiKey ?? "").trim() || undefined,
      businessProfile: String(input.businessProfile ?? "").trim(),
      model: String(input.model ?? "auto").trim() || "auto",
      provider: input.provider,
      workspaceId,
    })

    revalidatePath(ROUTES.settingsWorkspace)

    return {
      state: await loadWorkspaceAgentSettings(workspaceId),
      status: "success",
    }
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : "Unable to save the agent settings.",
      status: "error",
    }
  }
}
