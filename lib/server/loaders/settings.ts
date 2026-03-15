import "server-only"

import { selectRowsFromTable } from "@/lib/db/query"
import {
  parseBackfillRun,
  parseBudgetPlanMonthly,
  parseBudgetTargetsMeta,
  parseConfigEntry,
  parseCostSettings,
  parseJobRun,
  parseSkuCost,
  parseSyncState,
  parseTargetEntry,
  parseTargetsCanonicalRange,
  parseTargetsEffectiveDaily,
  parseTargetsError,
  parseTokenStatus,
} from "@/lib/db/record-parsers"
import { loadMetricsCatalogSource } from "@/lib/metrics/catalog-source"
import { listMetrics } from "@/lib/metrics/registry"
import { buildEcomDash2SettingsSnapshot } from "@/lib/server/dashboard-settings"
import type { SettingsSliceData } from "@/types/backend"
import type { DashboardRequestContext } from "@/types/dashboard"

export async function loadSettingsSlice(
  context: DashboardRequestContext
): Promise<SettingsSliceData> {
  const cacheBuster = context.refresh ?? context.loadedAt
  const [
    configRows,
    targetRows,
    tokenRows,
    syncRows,
    jobRunRows,
    backfillRows,
    costSettingsRows,
    skuCostRows,
    budgetPlanRows,
    budgetTargetsMetaRows,
    targetCanonicalRows,
    targetEffectiveRows,
    targetErrorRows,
    metricsCatalogSource,
  ] = await Promise.all([
    selectRowsFromTable("configEntries", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("targetEntries", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("settingsTokensEncrypted", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("syncState", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("jobRuns", {
      workspaceId: context.workspaceId,
      limit: 30,
      cacheBuster,
    }),
    selectRowsFromTable("backfillRuns", {
      workspaceId: context.workspaceId,
      limit: 30,
      cacheBuster,
    }),
    selectRowsFromTable("costSettings", {
      workspaceId: context.workspaceId,
      limit: 1,
      cacheBuster,
    }),
    selectRowsFromTable("skuCosts", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("budgetPlanMonthly", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("budgetTargetsMeta", {
      workspaceId: context.workspaceId,
      limit: 1,
      cacheBuster,
    }),
    selectRowsFromTable("targetsCanonicalRanges", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("targetsEffectiveDaily", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    selectRowsFromTable("targetsErrors", {
      workspaceId: context.workspaceId,
      limit: null,
      cacheBuster,
    }),
    loadMetricsCatalogSource(),
  ])

  const configEntries = configRows.map(parseConfigEntry)
  const targetEntries = targetRows.map(parseTargetEntry)
  const settings = buildEcomDash2SettingsSnapshot({
    configEntries,
    targetEntries,
  })

  return {
    context,
    workspace: {
      configEntries,
      tokens: tokenRows.map(parseTokenStatus),
      syncState: syncRows.map(parseSyncState),
      recentJobRuns: jobRunRows.map(parseJobRun),
      recentBackfillRuns: backfillRows.map(parseBackfillRun),
    },
    dashboard: {
      settings,
    },
    inputs: {
      costSettings: costSettingsRows[0]
        ? parseCostSettings(costSettingsRows[0])
        : null,
      skuCosts: skuCostRows.map(parseSkuCost),
      budgetPlanMonthly: budgetPlanRows.map(parseBudgetPlanMonthly),
      budgetTargetsMeta: budgetTargetsMetaRows[0]
        ? parseBudgetTargetsMeta(budgetTargetsMetaRows[0])
        : null,
      targetEntries,
      targetCanonicalRanges: targetCanonicalRows.map(parseTargetsCanonicalRange),
      targetEffectiveDaily: targetEffectiveRows.map(parseTargetsEffectiveDaily),
      targetErrors: targetErrorRows.map(parseTargetsError),
    },
    metrics: {
      runtimeRegistry: listMetrics(),
      catalogSource: metricsCatalogSource,
    },
    syncs: {
      syncState: syncRows.map(parseSyncState),
      recentJobRuns: jobRunRows.map(parseJobRun),
      recentBackfillRuns: backfillRows.map(parseBackfillRun),
    },
  }
}
