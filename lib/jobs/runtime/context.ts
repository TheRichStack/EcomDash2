import { createJobDatabaseClient, type JobDatabaseClient } from "@/lib/jobs/runtime/db"
import {
  resolveConnectorSupportTablesMode,
  isSettingsEnvHydrationEnabled,
  loadRuntimeEnv,
  resolveSettingsEnvMode,
  resolveWorkspaceId,
  type ConnectorSupportTablesMode,
  type RuntimeEnv,
} from "@/lib/jobs/runtime/env"
import { loadSettingsEnvOverrides } from "@/lib/jobs/runtime/settings-env"

export type JobSettingsHydration = {
  enabled: boolean
  error: string | null
  loadedConfigKeys: number
  loadedTokenKeys: number
  mode: "fallback" | "prefer"
  skippedTokenKeys: string[]
}

export type JobRuntimeContext = {
  baseEnv: RuntimeEnv
  client: JobDatabaseClient
  jobName: string
  runtimeEnv: RuntimeEnv
  settingsHydration: JobSettingsHydration
  supportTableMode: ConnectorSupportTablesMode
  warnings: string[]
  workspaceId: string
}

type CreateJobRuntimeContextOptions = {
  jobName: string
  workspaceId?: string
}

export async function createJobRuntimeContext(
  options: CreateJobRuntimeContextOptions
): Promise<JobRuntimeContext> {
  const baseEnv = loadRuntimeEnv()
  const workspaceId = resolveWorkspaceId(baseEnv, options.workspaceId)
  const client = createJobDatabaseClient(baseEnv)
  const mode = resolveSettingsEnvMode(baseEnv)
  const settingsHydration: JobSettingsHydration = {
    enabled: isSettingsEnvHydrationEnabled(baseEnv),
    error: null,
    loadedConfigKeys: 0,
    loadedTokenKeys: 0,
    mode,
    skippedTokenKeys: [],
  }
  const warnings: string[] = []
  let runtimeEnv = { ...baseEnv }

  if (settingsHydration.enabled) {
    try {
      const loaded = await loadSettingsEnvOverrides(client, workspaceId, baseEnv, {
        preferSettings: mode === "prefer",
      })

      runtimeEnv = {
        ...baseEnv,
        ...loaded.overrides,
      }
      settingsHydration.loadedConfigKeys = loaded.loadedConfigKeys
      settingsHydration.loadedTokenKeys = loaded.loadedTokenKeys
      settingsHydration.skippedTokenKeys = loaded.skippedTokenKeys
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Settings env hydration failed."

      settingsHydration.error = message
      warnings.push(message)
    }
  }

  const supportTableMode = resolveConnectorSupportTablesMode(runtimeEnv)

  if (supportTableMode === "shared") {
    warnings.push(
      "CONNECTOR_SUPPORT_TABLES=shared enables shared-only support-table writes and is not compatible with the owned dedicated-DB schema."
    )
  }

  return {
    baseEnv,
    client,
    jobName: options.jobName,
    runtimeEnv,
    settingsHydration,
    supportTableMode,
    warnings,
    workspaceId,
  }
}
