import { getConnectorsByName } from "@/lib/connectors"
import {
  isConnectorEnabled,
  isConnectorStrict,
  validateConnectorConfigs,
} from "@/lib/connectors/common"
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

type RunReconcileOptions = {
  adLookbackDays?: number
  contractLookbackDays?: number
  shopifyLookbackDays?: number
  sources?: readonly string[]
  to?: string
}

type ReconcileRunDetails = {
  ad_from: string
  contract_from: string
  enabled_connectors: string[]
  settings_hydration: ReturnType<typeof buildSettingsHydrationDetails>
  shopify_from: string
  steps: RunnerStep[]
  strict: boolean
  stubbed_connectors: string[]
  to: string
  workspace_id: string
}

export async function runDailyReconcile(
  context: JobRuntimeContext,
  options: RunReconcileOptions = {}
) {
  const selectedConnectors = getConnectorsByName(options.sources ?? [])
  const strict = isConnectorStrict(context.runtimeEnv)
  const preflight = validateConnectorConfigs(context.runtimeEnv, selectedConnectors, {
    strict,
  })
  const to = options.to || isoDate(new Date())
  const adFrom = addDays(to, -(options.adLookbackDays ?? 28))
  const shopifyFrom = addDays(to, -(options.shopifyLookbackDays ?? 90))
  const contractFrom = addDays(to, -(options.contractLookbackDays ?? 90))

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

  const details: ReconcileRunDetails = {
    ad_from: adFrom,
    contract_from: contractFrom,
    enabled_connectors: preflight.enabled,
    settings_hydration: buildSettingsHydrationDetails(context),
    shopify_from: shopifyFrom,
    steps: [],
    strict,
    stubbed_connectors: preflight.stubbed,
    to,
    workspace_id: context.workspaceId,
  }
  const runId = await startJobRun(context.client, {
    details,
    jobName: context.jobName,
    workspaceId: context.workspaceId,
  })

  let failureCount = 0

  try {
    for (const connector of selectedConnectors) {
      if (!isConnectorEnabled(connector.name, context.runtimeEnv)) {
        details.steps.push({
          reason: "disabled",
          status: "skipped",
          step: connector.name,
        })
        continue
      }

      if (connector.name === "klaviyo") {
        details.steps.push({
          reason: "reconcile_not_required",
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

      const isShopify = connector.name === "shopify"
      const from = isShopify ? shopifyFrom : adFrom

      try {
        const startedAt = Date.now()
        const result = await connector.backfillWindow({
          chunkDays: options.contractLookbackDays ?? 90,
          client: context.client,
          env: context.runtimeEnv,
          from,
          mode: "reconcile",
          to,
          updatedSince: isShopify ? shopifyFrom : undefined,
          workspaceId: context.workspaceId,
        })
        const stubbed = result.metadata?.stubbed === true

        details.steps.push({
          from,
          metadata: result.metadata,
          ms: Date.now() - startedAt,
          processed: result.processed,
          status: stubbed ? "stubbed" : "success",
          step: connector.name,
          table_counts: result.tableCounts,
          to,
        })
      } catch (error) {
        failureCount += 1
        details.steps.push({
          message:
            error instanceof Error
              ? error.message
              : `Connector ${connector.name} failed during reconcile.`,
          status: "failed",
          step: connector.name,
        })
      }
    }

    try {
      const contractResult = await refreshContracts(
        context.client,
        context.workspaceId,
        contractFrom,
        to
      )

      details.steps.push({
        ...contractResult,
        status: contractResult.skipped ? "skipped" : "success",
        step: "contract_refresh",
      })
    } catch (error) {
      failureCount += 1
      details.steps.push({
        message:
          error instanceof Error
            ? error.message
            : "Contract refresh failed during reconcile.",
        status: "failed",
        step: "contract_refresh",
      })
    }

    const status = failureCount > 0 ? "failed" : "success"
    const message =
      status === "success"
        ? `Daily reconcile completed (${contractFrom}..${to}).`
        : `Daily reconcile completed with ${failureCount} failed step(s).`

    if (status === "success") {
      await upsertSyncState(context.client, {
        sourceKey: "jobs:reconcile",
        stateKey: "last_success_at",
        stateValue: new Date().toISOString(),
        workspaceId: context.workspaceId,
      })
    }

    await finishJobRun(context.client, {
      details,
      message,
      runId,
      status,
    })

    return createRunnerSummary(context, {
      message,
      runId,
      status,
      warnings,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Daily reconcile runner failed."

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
