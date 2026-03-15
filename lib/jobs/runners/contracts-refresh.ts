import { refreshContracts } from "@/lib/jobs/contracts"
import { addDays, isoDate } from "@/lib/jobs/runtime/date"
import type { JobRuntimeContext } from "@/lib/jobs/runtime/context"
import {
  finishJobRun,
  startJobRun,
  upsertSyncState,
} from "@/lib/jobs/status"
import {
  buildSettingsHydrationDetails,
  createRunnerSummary,
  type RunnerStep,
} from "@/lib/jobs/runners/shared"

type RunContractsRefreshOptions = {
  dirtyDates?: readonly string[]
  from?: string
  to?: string
}

type ContractsRefreshDetails = {
  dirty_dates_count: number
  from: string
  settings_hydration: ReturnType<typeof buildSettingsHydrationDetails>
  steps: RunnerStep[]
  to: string
  workspace_id: string
}

function normalizeRange(options: RunContractsRefreshOptions) {
  const todayIso = isoDate(new Date())
  const to = options.to || todayIso
  const from = options.from || addDays(to, -30)

  if (from > to) {
    throw new Error(`Invalid contract refresh range: from=${from} to=${to}`)
  }

  return { from, to }
}

function normalizeDirtyDates(dirtyDates?: readonly string[]) {
  return Array.isArray(dirtyDates)
    ? [...new Set(dirtyDates.map((date) => String(date).trim()).filter(Boolean))].sort()
    : undefined
}

export async function runContractsRefresh(
  context: JobRuntimeContext,
  options: RunContractsRefreshOptions = {}
) {
  const range = normalizeRange(options)
  const dirtyDates = normalizeDirtyDates(options.dirtyDates)
  const details: ContractsRefreshDetails = {
    dirty_dates_count: dirtyDates?.length ?? 0,
    from: range.from,
    settings_hydration: buildSettingsHydrationDetails(context),
    steps: [],
    to: range.to,
    workspace_id: context.workspaceId,
  }
  const runId = await startJobRun(context.client, {
    details,
    jobName: context.jobName,
    workspaceId: context.workspaceId,
  })

  try {
    const result = await refreshContracts(
      context.client,
      context.workspaceId,
      range.from,
      range.to,
      dirtyDates
    )

    details.steps.push({
      ...result,
      status: result.skipped ? "skipped" : "success",
      step: "contract_refresh",
    })

    await upsertSyncState(context.client, {
      sourceKey: "jobs:contracts:refresh",
      stateKey: "last_success_at",
      stateValue: new Date().toISOString(),
      workspaceId: context.workspaceId,
    })

    const message = result.skipped
      ? `Contract refresh skipped for ${range.from}..${range.to}; no dirty dates were found.`
      : `Contract refresh completed for ${result.from}..${result.to}.`

    await finishJobRun(context.client, {
      details,
      message,
      runId,
      status: "success",
    })

    return createRunnerSummary(context, {
      message,
      runId,
      status: "success",
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Contract refresh runner failed."

    details.steps.push({
      message,
      status: "failed",
      step: "fatal",
    })

    await finishJobRun(context.client, {
      details,
      message,
      runId,
      status: "failed",
    })

    throw error
  }
}
