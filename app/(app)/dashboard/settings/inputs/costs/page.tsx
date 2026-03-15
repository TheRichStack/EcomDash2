import { SectionHeader } from "@/components/shared/section-header"
import { loadSettingsCostsWorkflow } from "@/lib/server/settings-costs"

import {
  loadSettingsPageData,
  type SettingsRoutePageProps,
} from "../../settings-data"
import { saveCostsAction } from "../../settings-actions"
import { CostsWorkflow } from "./costs-workflow"

function buildWorkflowKey(input: {
  workspaceId: string
  settings: Awaited<
    ReturnType<typeof loadSettingsCostsWorkflow>
  >["resolvedSettings"]
  rows: Awaited<ReturnType<typeof loadSettingsCostsWorkflow>>["rows"]
}) {
  const serialized = JSON.stringify({
    settings: input.settings,
    rows: input.rows.map((row) => [
      row.rowKey,
      row.shopifyVariantId,
      row.sku,
      row.price,
      row.shopifyCost,
      row.overrideUnitCost,
      row.updatedAt,
    ]),
  })
  let hash = 0

  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 31 + serialized.charCodeAt(index)) >>> 0
  }

  return `${input.workspaceId}:${hash.toString(16)}`
}

export default async function SettingsInputsCostsPage({
  searchParams,
}: SettingsRoutePageProps) {
  const data = await loadSettingsPageData(searchParams)
  const initialData = await loadSettingsCostsWorkflow({
    workspaceId: data.context.workspaceId,
    cacheBuster: data.context.refresh ?? data.context.loadedAt,
    configEntries: data.workspace.configEntries,
    storedSettings: data.inputs.costSettings,
    storedRows: data.inputs.skuCosts,
  })
  const workflowKey = buildWorkflowKey({
    workspaceId: data.context.workspaceId,
    settings: initialData.resolvedSettings,
    rows: initialData.rows,
  })

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SectionHeader
        eyebrow="Inputs - Costs"
        title="Cost defaults and SKU overrides"
        description="Edit the shared fallback cost model and the SKU-level unit cost overrides in one route-local workflow, then save back into the existing shared tables."
      />

      <CostsWorkflow
        key={workflowKey}
        workspaceId={data.context.workspaceId}
        currency={data.dashboard.settings.currency}
        initialData={initialData}
        saveAction={saveCostsAction}
      />
    </div>
  )
}
