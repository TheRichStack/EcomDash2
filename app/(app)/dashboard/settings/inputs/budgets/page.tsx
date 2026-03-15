import { SectionHeader } from "@/components/shared/section-header"
import { synthesizeBudgetRowsFromCanonical } from "@/lib/settings/budget-plan"

import {
  loadSettingsPageData,
  type SettingsRoutePageProps,
} from "../../settings-data"
import { saveBudgetPlanAndApplyAction } from "../../settings-actions"
import { BudgetsWorkflow } from "./budgets-workflow"

export default async function SettingsInputsBudgetsPage({
  searchParams,
}: SettingsRoutePageProps) {
  const data = await loadSettingsPageData(searchParams)
  const initialRows =
    data.inputs.budgetPlanMonthly.length > 0
      ? data.inputs.budgetPlanMonthly.map((row) => ({
          month: row.month,
          channel: row.channel,
          budget: row.budget,
          notes: row.notes,
        }))
      : synthesizeBudgetRowsFromCanonical(
          data.inputs.targetCanonicalRanges.map((row) => ({
            rangeType: row.rangeType,
            priority: row.priority,
            startDate: row.startDate,
            endDate: row.endDate,
            adBudget: row.adBudget,
            notes: row.notes,
            updatedAt: row.updatedAt,
          }))
        )
  const currentCoverageStart = data.inputs.targetEffectiveDaily[0]?.date ?? null
  const currentCoverageEnd =
    data.inputs.targetEffectiveDaily[data.inputs.targetEffectiveDaily.length - 1]?.date ??
    null
  const workflowKey = `${data.context.workspaceId}:${initialRows
    .map((row) => `${row.month}:${row.channel}:${row.budget}:${row.notes}`)
    .join("|")}`

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SectionHeader
        eyebrow="Inputs - Budgets"
        title="Monthly budget planning"
        description="Import, generate, edit, preview, and apply the channel-aware monthly budget plan without recreating the old settings console shell."
      />

      <BudgetsWorkflow
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
        saveAction={saveBudgetPlanAndApplyAction}
      />
    </div>
  )
}
