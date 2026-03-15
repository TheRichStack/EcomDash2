import type { JobRunnerSummary } from "@/lib/jobs/runtime/cli"
import type { JobRuntimeContext } from "@/lib/jobs/runtime/context"

export type RunnerStep = Record<string, unknown> & {
  status: string
  step: string
}

export function buildSettingsHydrationDetails(context: JobRuntimeContext) {
  return {
    enabled: context.settingsHydration.enabled,
    error: context.settingsHydration.error,
    loaded_config_keys: context.settingsHydration.loadedConfigKeys,
    loaded_token_keys: context.settingsHydration.loadedTokenKeys,
    mode: context.settingsHydration.mode,
    skipped_token_keys: context.settingsHydration.skippedTokenKeys,
  }
}

export function createRunnerSummary(
  context: JobRuntimeContext,
  input: Omit<JobRunnerSummary, "jobName" | "warnings" | "workspaceId"> & {
    warnings?: string[]
  }
): JobRunnerSummary {
  return {
    jobName: context.jobName,
    message: input.message,
    runId: input.runId,
    status: input.status,
    warnings: [...context.warnings, ...(input.warnings ?? [])],
    workspaceId: context.workspaceId,
  }
}

export function parseJsonObject(text: string) {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}
