import { CONNECTORS } from "@/lib/connectors"
import {
  isConnectorEnabled,
  isConnectorStrict,
  validateConnectorConfigs,
} from "@/lib/connectors/common"
import { loadDirtyContractDates, refreshContracts } from "@/lib/jobs/contracts"
import {
  addDays,
  buildConnectorWindow,
  buildHourlyWindow,
  isoDate,
  isoHourBucket,
} from "@/lib/jobs/runtime/date"
import type { JobRuntimeContext } from "@/lib/jobs/runtime/context"
import {
  finishJobRun,
  getSyncState,
  startJobRun,
  upsertSyncState,
} from "@/lib/jobs/status"
import {
  buildSettingsHydrationDetails,
  createRunnerSummary,
  type RunnerStep,
} from "@/lib/jobs/runners/shared"

type RunHourlySyncOptions = {
  from?: string
  onlyContracts?: boolean
  to?: string
}

type HourlyRunDetails = {
  enabled_connectors: string[]
  from: string
  settings_hydration: ReturnType<typeof buildSettingsHydrationDetails>
  steps: RunnerStep[]
  strict: boolean
  stubbed_connectors: string[]
  sync_batch_id: string
  to: string
  workspace_id: string
}

function isStubbedResult(metadata: Record<string, unknown> | undefined) {
  return metadata?.stubbed === true
}

function buildHourlyWindowFromOptions(
  options: RunHourlySyncOptions,
  todayIso: string,
  cursorIso: string
) {
  if (options.from || options.to) {
    return {
      from: options.from || addDays(options.to || todayIso, -7),
      to: options.to || todayIso,
    }
  }

  return buildHourlyWindow(todayIso, cursorIso)
}

export async function runHourlySync(
  context: JobRuntimeContext,
  options: RunHourlySyncOptions = {}
) {
  const todayIso = isoDate(new Date())
  const strict = isConnectorStrict(context.runtimeEnv)
  const hourlyCursor =
    (await getSyncState(context.client, {
      sourceKey: "hourly_sync",
      workspaceId: context.workspaceId,
    }))?.stateValue ?? ""
  const window = buildHourlyWindowFromOptions(options, todayIso, hourlyCursor)
  const preflight = validateConnectorConfigs(context.runtimeEnv, CONNECTORS, {
    strict,
  })

  if (window.from > window.to) {
    throw new Error(`Invalid hourly sync range: from=${window.from} to=${window.to}`)
  }

  if (!options.onlyContracts && strict && preflight.enabled.length === 0) {
    throw new Error(
      "CONNECTOR_STRICT=1 but no connectors are enabled. Set CONNECTORS_ENABLED."
    )
  }

  const warnings: string[] = []

  if (!options.onlyContracts && preflight.failures.length > 0 && !strict) {
    warnings.push(
      `Missing connector config: ${preflight.failures
        .map((entry) => `${entry.connector}: ${entry.missing.join(", ")}`)
        .join("; ")}`
    )
  }

  const details: HourlyRunDetails = {
    enabled_connectors: preflight.enabled,
    from: window.from,
    settings_hydration: buildSettingsHydrationDetails(context),
    steps: [],
    strict,
    stubbed_connectors: preflight.stubbed,
    sync_batch_id: isoHourBucket(new Date()),
    to: window.to,
    workspace_id: context.workspaceId,
  }

  const runId = await startJobRun(context.client, {
    details,
    jobName: context.jobName,
    workspaceId: context.workspaceId,
  })

  let advancedConnectorCursorCount = 0

  try {
    if (!options.onlyContracts) {
      for (const connector of CONNECTORS) {
        if (!isConnectorEnabled(connector.name, context.runtimeEnv)) {
          details.steps.push({
            reason: "disabled",
            status: "skipped",
            step: connector.name,
          })
          continue
        }

        const configStatus = connector.getConfigStatus(context.runtimeEnv)

        if (!configStatus.configured && !strict) {
          details.steps.push({
            missing: configStatus.missing,
            reason: "missing_credentials",
            status: "skipped",
            step: connector.name,
          })
          continue
        }

        const connectorCursor =
          (await getSyncState(context.client, {
            sourceKey: `connector:${connector.name}`,
            workspaceId: context.workspaceId,
          }))?.stateValue ?? ""
        const connectorWindow = buildConnectorWindow(window, connectorCursor)
        const startedAt = Date.now()
        const result = await connector.syncWindow({
          chunkDays: 7,
          client: context.client,
          cursor: connectorCursor,
          env: context.runtimeEnv,
          from: connectorWindow.from,
          mode: "hourly",
          syncBatchId: details.sync_batch_id,
          to: connectorWindow.to,
          workspaceId: context.workspaceId,
        })
        const stubbed = isStubbedResult(result.metadata)

        details.steps.push({
          cursor: result.cursor,
          from: connectorWindow.from,
          metadata: result.metadata,
          ms: Date.now() - startedAt,
          processed: result.processed,
          status: stubbed ? "stubbed" : "success",
          step: connector.name,
          table_counts: result.tableCounts,
          to: connectorWindow.to,
        })

        if (!stubbed) {
          advancedConnectorCursorCount += 1
          await upsertSyncState(context.client, {
            sourceKey: `connector:${connector.name}`,
            stateValue: String(result.cursor || connectorWindow.to),
            workspaceId: context.workspaceId,
          })
          await upsertSyncState(context.client, {
            sourceKey: `connector:${connector.name}`,
            stateKey: "last_success_at",
            stateValue: new Date().toISOString(),
            workspaceId: context.workspaceId,
          })
        }
      }

      details.steps.push({
        message:
          "Normalization remains connector-owned in the EcomDash2 standalone runtime.",
        status: "skipped",
        step: "normalize",
      })
    }

    const dirtyDates = await loadDirtyContractDates(
      context.client,
      context.workspaceId,
      window.from,
      window.to
    )
    const contractResult = await refreshContracts(
      context.client,
      context.workspaceId,
      window.from,
      window.to,
      dirtyDates
    )

    details.steps.push({
      ...contractResult,
      status: contractResult.skipped ? "skipped" : "success",
      step: "contract_refresh",
    })

    if (!options.onlyContracts && advancedConnectorCursorCount > 0) {
      await upsertSyncState(context.client, {
        sourceKey: "hourly_sync",
        stateValue: todayIso,
        workspaceId: context.workspaceId,
      })
      await upsertSyncState(context.client, {
        sourceKey: "hourly_sync",
        stateKey: "last_success_at",
        stateValue: new Date().toISOString(),
        workspaceId: context.workspaceId,
      })
    }

    const message = options.onlyContracts
      ? `Contract refresh completed from hourly entrypoint (${contractResult.from}..${contractResult.to}).`
      : advancedConnectorCursorCount > 0
        ? `Hourly sync completed for ${window.from}..${window.to}.`
        : `Hourly sync completed for ${window.from}..${window.to} without advancing connector cursors.`

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
      warnings,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hourly sync failed."

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
