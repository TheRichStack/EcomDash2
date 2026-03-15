import { getConnectorsByName } from "@/lib/connectors"
import {
  isConnectorEnabled,
  isConnectorStrict,
  validateConnectorConfigs,
} from "@/lib/connectors/common"
import { refreshContracts } from "@/lib/jobs/contracts"
import {
  addDays,
  getDefaultBackfillFrom,
  isoDate,
  minIso,
} from "@/lib/jobs/runtime/date"
import type { JobRuntimeContext } from "@/lib/jobs/runtime/context"
import {
  createBackfillRun,
  findLatestBackfillRun,
  updateBackfillRun,
} from "@/lib/jobs/status"
import {
  buildSettingsHydrationDetails,
  createRunnerSummary,
  parseJsonObject,
  type RunnerStep,
} from "@/lib/jobs/runners/shared"

type RunBackfillOptions = {
  chunkDays?: number
  from?: string
  resume?: boolean
  scope?: string
  sources?: readonly string[]
  to?: string
}

type BackfillRunDetails = {
  checkpoints: Record<string, string>
  chunk_days: number
  chunks_completed: number
  enabled_connectors: string[]
  from: string
  last_chunk?: {
    from: string
    per_source: Record<string, unknown>
    to: string
  }
  normalize?: string
  scope: string
  selected_sources: string[]
  settings_hydration: ReturnType<typeof buildSettingsHydrationDetails>
  source_rows: Record<string, number>
  steps: RunnerStep[]
  strict: boolean
  stubbed_connectors: string[]
  to: string
  workspace_id: string
}

function normalizeSourceRows(value: unknown) {
  if (!value || typeof value !== "object") {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, rawValue]) => [key, Number(rawValue) || 0])
  ) as Record<string, number>
}

function normalizeCheckpoints(value: unknown) {
  if (!value || typeof value !== "object") {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, rawValue]) => [key, String(rawValue ?? "")])
  ) as Record<string, string>
}

export async function runBackfill(
  context: JobRuntimeContext,
  options: RunBackfillOptions = {}
) {
  const chunkDays = options.chunkDays ?? 30
  const selectedConnectors = getConnectorsByName(options.sources ?? [])
  const strict = isConnectorStrict(context.runtimeEnv)
  const preflight = validateConnectorConfigs(context.runtimeEnv, selectedConnectors, {
    strict,
  })
  const to = options.to || isoDate(new Date())
  const from = options.from || getDefaultBackfillFrom()

  if (from > to) {
    throw new Error(`Invalid backfill range: from=${from} to=${to}`)
  }

  if (strict && preflight.enabled.length === 0) {
    throw new Error(
      "CONNECTOR_STRICT=1 but no selected connectors are enabled. Check CONNECTORS_ENABLED."
    )
  }

  const warnings: string[] = []

  if (preflight.failures.length > 0 && !strict) {
    warnings.push(
      `Missing connector config: ${preflight.failures
        .map((entry) => `${entry.connector}: ${entry.missing.join(", ")}`)
        .join("; ")}`
    )
  }

  const details: BackfillRunDetails = {
    checkpoints: {},
    chunk_days: chunkDays,
    chunks_completed: 0,
    enabled_connectors: preflight.enabled,
    from,
    scope: String(options.scope ?? "default").trim() || "default",
    selected_sources: selectedConnectors.map((connector) => connector.name),
    settings_hydration: buildSettingsHydrationDetails(context),
    source_rows: {},
    steps: [],
    strict,
    stubbed_connectors: preflight.stubbed,
    to,
    workspace_id: context.workspaceId,
  }

  let runId = ""
  let cursor = from

  if (options.resume) {
    const latest = await findLatestBackfillRun(context.client, {
      sourceKey: context.jobName,
      workspaceId: context.workspaceId,
    })

    if (latest?.cursorDate) {
      runId = latest.runId
      cursor = addDays(latest.cursorDate, 1)

      const previousDetails = parseJsonObject(latest.detailsJson)
      details.checkpoints = normalizeCheckpoints(previousDetails.checkpoints)
      details.chunks_completed = Number(previousDetails.chunks_completed) || 0
      details.source_rows = normalizeSourceRows(previousDetails.source_rows)

      await updateBackfillRun(context.client, {
        details,
        message: "Resumed",
        runId,
        status: "running",
      })
    }
  }

  if (!runId) {
    runId = await createBackfillRun(context.client, {
      details,
      sourceKey: context.jobName,
      workspaceId: context.workspaceId,
    })
  }

  try {
    while (cursor <= to) {
      const chunkEnd = minIso(addDays(cursor, chunkDays - 1), to)
      const perSource: Record<string, unknown> = {}

      for (const connector of selectedConnectors) {
        if (!isConnectorEnabled(connector.name, context.runtimeEnv)) {
          perSource[connector.name] = {
            reason: "disabled",
            status: "skipped",
          }
          continue
        }

        const configStatus = connector.getConfigStatus(context.runtimeEnv)

        if (!configStatus.configured && !strict) {
          perSource[connector.name] = {
            missing: configStatus.missing,
            reason: "missing_credentials",
            status: "skipped",
          }
          continue
        }

        const connectorCursor = details.checkpoints[connector.name] || ""
        const result = await connector.backfillWindow({
          chunkDays,
          client: context.client,
          cursor: connectorCursor,
          env: context.runtimeEnv,
          from: cursor,
          mode: "backfill",
          scope: details.scope,
          to: chunkEnd,
          workspaceId: context.workspaceId,
        })
        const stubbed = result.metadata?.stubbed === true

        details.checkpoints[connector.name] = String(result.cursor || chunkEnd)

        if (!stubbed) {
          details.source_rows[connector.name] =
            Number(details.source_rows[connector.name] || 0) + result.processed
        }

        perSource[connector.name] = {
          cursor: details.checkpoints[connector.name],
          metadata: result.metadata,
          processed: result.processed,
          status: stubbed ? "stubbed" : "success",
          table_counts: result.tableCounts,
        }
      }

      details.chunks_completed += 1
      details.last_chunk = {
        from: cursor,
        per_source: perSource,
        to: chunkEnd,
      }
      details.steps.push({
        from: cursor,
        status: "success",
        step: `chunk:${cursor}..${chunkEnd}`,
        to: chunkEnd,
      })

      await updateBackfillRun(context.client, {
        cursorDate: chunkEnd,
        details,
        message: `Chunk complete ${cursor}..${chunkEnd}`,
        runId,
      })

      cursor = addDays(chunkEnd, 1)
    }

    details.normalize =
      "Normalization remains connector-owned in the EcomDash2 standalone runtime."

    const contractResult = await refreshContracts(
      context.client,
      context.workspaceId,
      from,
      to
    )

    details.steps.push({
      ...contractResult,
      status: contractResult.skipped ? "skipped" : "success",
      step: "contract_refresh",
    })

    const message = `Backfill completed (${from}..${to}).`

    await updateBackfillRun(context.client, {
      details,
      finishedAt: new Date().toISOString(),
      message,
      runId,
      status: "success",
    })

    return createRunnerSummary(context, {
      message,
      runId,
      status: "success",
      warnings,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backfill failed."

    details.steps.push({
      message,
      status: "failed",
      step: "fatal",
    })

    await updateBackfillRun(context.client, {
      details,
      finishedAt: new Date().toISOString(),
      message,
      runId,
      status: "failed",
    })

    throw error
  }
}
