import { SectionHeader } from "@/components/shared/section-header"
import {
  ECOMDASH2_TARGET_KEYS,
  OVERVIEW_PACING_MAX_ROWS,
} from "@/lib/server/dashboard-settings"
import {
  parseMonthlyTargetPlanRows,
  synthesizeMonthlyTargetPlanRowsFromCanonical,
} from "@/lib/settings/monthly-target-plan"

import {
  loadSettingsPageData,
  type SettingsRoutePageProps,
} from "../../settings-data"
import {
  saveOverviewPacingMetricSelectionAction,
  saveTargetPlanAndApplyAction,
} from "../../settings-actions"
import { formatSettingsDateTime, humanizeToken } from "../../settings-utils"
import { OverviewPacingEditor } from "./overview-pacing-editor"
import { TargetsWorkflow } from "./targets-workflow"

export default async function SettingsInputsTargetsPage({
  searchParams,
}: SettingsRoutePageProps) {
  const data = await loadSettingsPageData(searchParams)
  const runtimeMetricMap = new Map(
    data.metrics.runtimeRegistry.map((metric) => [metric.id, metric] as const)
  )
  const pacingMetricOptions = data.dashboard.settings.overviewPacing.allowedMetricIds.map(
    (metricId) => ({
      id: metricId,
      label: runtimeMetricMap.get(metricId)?.label ?? humanizeToken(metricId),
      description:
        runtimeMetricMap.get(metricId)?.description ||
        "No description available.",
    })
  )
  const pacingSavedAt =
    data.dashboard.settings.targetEntries.find(
      (entry) => entry.settingKey === ECOMDASH2_TARGET_KEYS.overviewPacingMetrics
    )?.updatedAt ?? null
  const targetPlanEntry = data.inputs.targetEntries.find(
    (entry) => entry.settingKey === ECOMDASH2_TARGET_KEYS.monthlyPlan
  )
  const parsedTargetPlanRows = parseMonthlyTargetPlanRows(
    targetPlanEntry?.settingValue || ""
  )
  const initialRows =
    parsedTargetPlanRows.length > 0
      ? parsedTargetPlanRows
      : synthesizeMonthlyTargetPlanRowsFromCanonical(
          data.inputs.targetCanonicalRanges.map((row) => ({
            rangeType: row.rangeType,
            priority: row.priority,
            startDate: row.startDate,
            endDate: row.endDate,
            revenueTarget: row.revenueTarget,
            profitTarget: row.profitTarget,
            notes: row.notes,
            updatedAt: row.updatedAt,
          }))
        )
  const currentCoverageStart = data.inputs.targetEffectiveDaily[0]?.date ?? null
  const currentCoverageEnd =
    data.inputs.targetEffectiveDaily[data.inputs.targetEffectiveDaily.length - 1]?.date ??
    null
  const workflowKey = `${data.context.workspaceId}:${initialRows
    .map(
      (row) =>
        `${row.month}:${row.revenueTarget ?? ""}:${row.profitTarget ?? ""}:${row.notes}`
    )
    .join("|")}`

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SectionHeader
        eyebrow="Inputs - Targets"
        title="Target planning"
        description="Keep Overview pacing configuration here while importing, generating, editing, previewing, and applying the monthly explicit target plan."
      />

      <OverviewPacingEditor
        key={`${data.context.workspaceId}:${data.dashboard.settings.overviewPacing.selectedMetricIds.join("|")}`}
        workspaceId={data.context.workspaceId}
        currentMetricIds={data.dashboard.settings.overviewPacing.selectedMetricIds}
        defaultMetricIds={data.dashboard.settings.overviewPacing.defaultMetricIds}
        metricOptions={pacingMetricOptions}
        maxRows={OVERVIEW_PACING_MAX_ROWS}
        savedAtLabel={pacingSavedAt ? formatSettingsDateTime(pacingSavedAt) : null}
        saveAction={saveOverviewPacingMetricSelectionAction}
      />

      <TargetsWorkflow
        key={workflowKey}
        workspaceId={data.context.workspaceId}
        currency={data.dashboard.settings.currency}
        initialRows={initialRows}
        meta={data.inputs.budgetTargetsMeta}
        currentIssues={data.inputs.targetErrors}
        currentCanonicalRowCount={data.inputs.targetCanonicalRanges.length}
        currentEffectiveRowCount={data.inputs.targetEffectiveDaily.length}
        currentCoverageStart={currentCoverageStart}
        currentCoverageEnd={currentCoverageEnd}
        saveAction={saveTargetPlanAndApplyAction}
      />
    </div>
  )
}
