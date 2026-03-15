"use server"

import { revalidatePath } from "next/cache"

import { ROUTES } from "@/lib/constants"
import { resolveDashboardSession } from "@/lib/dashboard-session"
import type {
  CostSettingsInput,
  CostValidationIssue,
  SkuCostInputRow,
} from "@/lib/settings/costs"
import {
  saveOverviewKpiStripSelection,
  saveOverviewPacingMetricSelection,
  saveShopifyProfitKpiStripSelection,
} from "@/lib/server/dashboard-settings"
import {
  saveCostsWorkflow,
  type SaveCostsWorkflowResult,
} from "@/lib/server/settings-costs"
import {
  saveBudgetPlanAndApply,
  saveTargetPlanAndApply,
  type PlanningIssue,
  type SaveAndApplyPlanningResult,
} from "@/lib/server/settings-inputs"
import type { DashboardSession } from "@/types/dashboard"
import type { EcomDashMetricId } from "@/types/metrics"

type SaveMetricSelectionInput = {
  workspaceId: string
  metricIds: readonly string[]
}

export type SaveMetricSelectionResult =
  | {
      status: "success"
      metricIds: EcomDashMetricId[]
      updatedAt: string
    }
  | {
      status: "error"
      message: string
    }

export type SavePlanningResult = SaveAndApplyPlanningResult
export type SavePlanningIssue = PlanningIssue
export type SaveCostsIssue = CostValidationIssue
export type SaveCostsResult = SaveCostsWorkflowResult

type SaveBudgetPlanInput = {
  workspaceId: string
  currency: string
  rows: Array<{
    month?: string
    channel?: string
    budget?: string
    notes?: string
  }>
}

type SaveTargetPlanInput = {
  workspaceId: string
  currency: string
  rows: Array<{
    month?: string
    revenueTarget?: string
    profitTarget?: string
    notes?: string
  }>
}

type SaveCostsInput = {
  workspaceId: string
  settings: CostSettingsInput
  rows: SkuCostInputRow[]
}

function resolveWritableWorkspaceId(
  session: DashboardSession,
  preferredWorkspaceId: string
) {
  const workspaceMembershipIds = new Set(
    session.workspaceMemberships
      .map((workspace) => String(workspace.id ?? "").trim())
      .filter(Boolean)
  )
  const requestedWorkspaceId = String(preferredWorkspaceId ?? "").trim()

  if (
    requestedWorkspaceId &&
    workspaceMembershipIds.has(requestedWorkspaceId)
  ) {
    return {
      status: "success" as const,
      workspaceId: requestedWorkspaceId,
    }
  }

  const defaultWorkspaceId = String(session.defaultWorkspaceId ?? "").trim()

  if (defaultWorkspaceId && workspaceMembershipIds.has(defaultWorkspaceId)) {
    return {
      status: "success" as const,
      workspaceId: defaultWorkspaceId,
    }
  }

  return {
    status: "error" as const,
    message:
      "Unable to save settings because the current session has no valid writable workspace.",
  }
}

function revalidateSettingsRoutes() {
  revalidatePath(ROUTES.dashboard)
  revalidatePath(ROUTES.paidMediaAll)
  revalidatePath(ROUTES.paidMediaMeta)
  revalidatePath(ROUTES.paidMediaGoogle)
  revalidatePath(ROUTES.paidMediaTiktok)
  revalidatePath(ROUTES.shopifyProfit)
  revalidatePath(ROUTES.settings)
  revalidatePath(ROUTES.settingsDashboard)
  revalidatePath(ROUTES.settingsInputsCosts)
  revalidatePath(ROUTES.settingsInputsBudgets)
  revalidatePath(ROUTES.settingsInputsTargets)
}

async function runMetricSelectionSave(
  input: SaveMetricSelectionInput,
  saveSelection: (input: SaveMetricSelectionInput) => Promise<{
    metricIds: EcomDashMetricId[]
    updatedAt: string
  }>
): Promise<SaveMetricSelectionResult> {
  const session = await resolveDashboardSession()
  const workspaceResolution = resolveWritableWorkspaceId(
    session,
    input.workspaceId
  )

  if (workspaceResolution.status === "error") {
    return {
      status: "error",
      message: workspaceResolution.message,
    }
  }

  try {
    const result = await saveSelection({
      workspaceId: workspaceResolution.workspaceId,
      metricIds: input.metricIds,
    })

    revalidateSettingsRoutes()

    return {
      status: "success",
      metricIds: result.metricIds,
      updatedAt: result.updatedAt,
    }
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unable to save the requested settings selection.",
    }
  }
}

export async function saveOverviewKpiStripAction(
  input: SaveMetricSelectionInput
) {
  return runMetricSelectionSave(input, saveOverviewKpiStripSelection)
}

export async function saveShopifyProfitKpiStripAction(
  input: SaveMetricSelectionInput
) {
  return runMetricSelectionSave(input, saveShopifyProfitKpiStripSelection)
}

export async function saveOverviewPacingMetricSelectionAction(
  input: SaveMetricSelectionInput
) {
  return runMetricSelectionSave(input, saveOverviewPacingMetricSelection)
}

async function runPlanningSave(
  workspaceId: string,
  savePlanning: (workspaceId: string) => Promise<SavePlanningResult>
) {
  const session = await resolveDashboardSession()
  const workspaceResolution = resolveWritableWorkspaceId(session, workspaceId)

  if (workspaceResolution.status === "error") {
    return {
      status: "error" as const,
      message: workspaceResolution.message,
      issues: [] as PlanningIssue[],
    }
  }

  try {
    const result = await savePlanning(workspaceResolution.workspaceId)

    if (result.status === "success") {
      revalidateSettingsRoutes()
    }

    return result
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to save the requested planning changes.",
      issues: [] as PlanningIssue[],
    }
  }
}

export async function saveBudgetPlanAndApplyAction(input: SaveBudgetPlanInput) {
  return runPlanningSave(input.workspaceId, (workspaceId) =>
    saveBudgetPlanAndApply({
      workspaceId,
      currency: input.currency,
      rows: input.rows,
    })
  )
}

export async function saveTargetPlanAndApplyAction(input: SaveTargetPlanInput) {
  return runPlanningSave(input.workspaceId, (workspaceId) =>
    saveTargetPlanAndApply({
      workspaceId,
      currency: input.currency,
      rows: input.rows,
    })
  )
}

export async function saveCostsAction(input: SaveCostsInput) {
  const session = await resolveDashboardSession()
  const workspaceResolution = resolveWritableWorkspaceId(
    session,
    input.workspaceId
  )

  if (workspaceResolution.status === "error") {
    return {
      status: "error" as const,
      message: workspaceResolution.message,
      issues: [] as CostValidationIssue[],
    }
  }

  try {
    const result = await saveCostsWorkflow({
      workspaceId: workspaceResolution.workspaceId,
      settings: input.settings,
      rows: input.rows,
    })

    if (result.status === "success") {
      revalidateSettingsRoutes()
    }

    return result
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to save the requested costs changes.",
      issues: [] as CostValidationIssue[],
    }
  }
}
