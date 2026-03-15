import "server-only"

import {
  listLatestInventorySkuSeedRows,
  listSoldSkuFallbackRows,
  saveCostSettingsAndSkuCosts,
} from "@/lib/db/settings-costs"
import {
  decorateSkuCostRow,
  mergeSkuCostRows,
  normalizeCostSettings,
  normalizeSkuCostRows,
  resolveCostSettings,
  summarizeSkuCostRows,
  type CostSettingsInput,
  type CostValidationIssue,
  type SettingsCostsWorkflowData,
  type SkuCostInputRow,
} from "@/lib/settings/costs"
import type { AppConfigEntry, CostSettings, SkuCost } from "@/types/backend"

export type SaveCostsWorkflowResult =
  | {
      status: "success"
      message: string
      updatedAt: string
      summary: ReturnType<typeof summarizeSkuCostRows>
    }
  | {
      status: "error"
      message: string
      issues: CostValidationIssue[]
    }

export async function loadSettingsCostsWorkflow(input: {
  workspaceId: string
  cacheBuster?: string | null
  configEntries: AppConfigEntry[]
  storedSettings: CostSettings | null
  storedRows: SkuCost[]
}): Promise<SettingsCostsWorkflowData> {
  const [inventorySeeds, soldFallbackSeeds] = await Promise.all([
    listLatestInventorySkuSeedRows(input.workspaceId, {
      cacheBuster: input.cacheBuster,
    }),
    listSoldSkuFallbackRows(input.workspaceId, {
      cacheBuster: input.cacheBuster,
    }),
  ])
  const rows = mergeSkuCostRows(
    inventorySeeds,
    soldFallbackSeeds,
    input.storedRows
  )

  return {
    resolvedSettings: resolveCostSettings(
      input.storedSettings,
      input.configEntries
    ),
    rows,
    summary: summarizeSkuCostRows(rows),
  }
}

export async function saveCostsWorkflow(input: {
  workspaceId: string
  settings: CostSettingsInput
  rows: SkuCostInputRow[]
}): Promise<SaveCostsWorkflowResult> {
  const normalizedSettings = normalizeCostSettings(input.settings)
  const normalizedRows = normalizeSkuCostRows(input.rows)
  const issues = [...normalizedSettings.issues, ...normalizedRows.issues]

  if (issues.length > 0) {
    return {
      status: "error",
      message: "Costs input validation failed.",
      issues,
    }
  }

  const updatedAt = await saveCostSettingsAndSkuCosts({
    workspaceId: input.workspaceId,
    settings: normalizedSettings.values,
    rows: normalizedRows.rows,
  })
  const summary = summarizeSkuCostRows(
    normalizedRows.rows.map((row) =>
      decorateSkuCostRow({
        ...row,
        updatedAt,
      })
    )
  )

  return {
    status: "success",
    message: "Costs saved.",
    updatedAt,
    summary,
  }
}
