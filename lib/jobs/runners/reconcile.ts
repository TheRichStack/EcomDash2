import { getConnectorsByName } from "@/lib/connectors"
import {
  isConnectorEnabled,
  isConnectorStrict,
  validateConnectorConfigs,
} from "@/lib/connectors/common"
import { refreshContracts } from "@/lib/jobs/contracts"
import { addDays, isoDate } from "@/lib/jobs/runtime/date"
import { executeStatement, queryRows } from "@/lib/db/query"
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

type CohortRow = {
  cohort_month: string
  months_since_acquisition: number
  new_customers: number
  returning_orders: number
  returning_revenue: number
  total_revenue: number
}

async function computeCustomerCohorts(
  workspaceId: string,
  cohortFrom: string
): Promise<{ processed: number; skipped: boolean }> {
  const firstOrders = await queryRows<{
    customer_id: string
    cohort_month: string
    revenue: number
  }>(
    `SELECT customer_id, strftime('%Y-%m', order_date) AS cohort_month, revenue
     FROM fact_orders
     WHERE workspace_id = ? AND is_first_order = 1
     ORDER BY customer_id`,
    [workspaceId],
    { bypassCache: true }
  )

  if (firstOrders.length === 0) {
    return { processed: 0, skipped: true }
  }

  const customerCohort = new Map<string, string>()
  const cohortM0 = new Map<string, { newCustomers: number; totalRevenue: number }>()

  for (const row of firstOrders) {
    customerCohort.set(String(row.customer_id), String(row.cohort_month))
    const existing = cohortM0.get(String(row.cohort_month)) ?? {
      newCustomers: 0,
      totalRevenue: 0,
    }
    existing.newCustomers += 1
    existing.totalRevenue += Number(row.revenue ?? 0)
    cohortM0.set(String(row.cohort_month), existing)
  }

  const allOrders = await queryRows<{
    customer_id: string
    order_month: string
    revenue: number
    is_first_order: number
  }>(
    `SELECT customer_id, strftime('%Y-%m', order_date) AS order_month, revenue, is_first_order
     FROM fact_orders
     WHERE workspace_id = ? AND order_date >= ?
     ORDER BY customer_id, order_date`,
    [workspaceId, cohortFrom],
    { bypassCache: true }
  )

  const stats = new Map<string, CohortRow>()

  for (const [cohortMonth, m0] of cohortM0) {
    stats.set(`${cohortMonth}|0`, {
      cohort_month: cohortMonth,
      months_since_acquisition: 0,
      new_customers: m0.newCustomers,
      returning_orders: 0,
      returning_revenue: 0,
      total_revenue: m0.totalRevenue,
    })
  }

  for (const order of allOrders) {
    const cohortMonth = customerCohort.get(String(order.customer_id))
    if (!cohortMonth) continue

    const orderMonth = String(order.order_month)
    const [cohortYear, cohortMo] = cohortMonth.split("-").map(Number)
    const [orderYear, orderMo] = orderMonth.split("-").map(Number)

    if (
      !Number.isFinite(cohortYear) ||
      !Number.isFinite(cohortMo) ||
      !Number.isFinite(orderYear) ||
      !Number.isFinite(orderMo)
    ) {
      continue
    }

    const monthsSince = (orderYear - cohortYear) * 12 + (orderMo - cohortMo)
    if (monthsSince < 0) continue

    const key = `${cohortMonth}|${monthsSince}`
    const existing = stats.get(key) ?? {
      cohort_month: cohortMonth,
      months_since_acquisition: monthsSince,
      new_customers: 0,
      returning_orders: 0,
      returning_revenue: 0,
      total_revenue: 0,
    }

    const revenue = Number(order.revenue ?? 0)
    existing.total_revenue += revenue

    if (Number(order.is_first_order) === 0) {
      existing.returning_orders += 1
      existing.returning_revenue += revenue
    }

    stats.set(key, existing)
  }

  const now = new Date().toISOString()

  for (const row of stats.values()) {
    await executeStatement(
      `INSERT OR REPLACE INTO contract_customer_cohorts
         (workspace_id, cohort_month, months_since_acquisition, new_customers,
          returning_orders, returning_revenue, total_revenue, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workspaceId,
        row.cohort_month,
        row.months_since_acquisition,
        row.new_customers,
        row.returning_orders,
        row.returning_revenue,
        row.total_revenue,
        now,
      ]
    )
  }

  return { processed: stats.size, skipped: false }
}

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
  const cohortFrom = addDays(to, -1095)

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

    try {
      const cohortResult = await computeCustomerCohorts(context.workspaceId, cohortFrom)
      details.steps.push({
        processed: cohortResult.processed,
        status: cohortResult.skipped ? "skipped" : "success",
        step: "cohort_computation",
      })
    } catch (error) {
      failureCount += 1
      details.steps.push({
        message:
          error instanceof Error
            ? error.message
            : "Cohort computation failed during reconcile.",
        status: "failed",
        step: "cohort_computation",
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
