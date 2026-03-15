import "server-only"

import { selectRowsFromTable } from "@/lib/db/query"
import {
  finishJobRun,
  replaceBudgetPlanMonthlyRows,
  replaceTargetsCanonicalRows,
  replaceTargetsEffectiveRows,
  replaceTargetsErrorRows,
  startJobRun,
  upsertBudgetTargetsMetaRow,
  upsertTargetEntriesRows,
} from "@/lib/db/settings-inputs"
import {
  parseBudgetPlanMonthly,
  parseTargetEntry,
  parseTargetsCanonicalRange,
} from "@/lib/db/record-parsers"
import {
  buildBudgetPreview,
  deriveBudgetHorizon,
  normalizeBudgetRows,
  synthesizeBudgetRowsFromCanonical,
  type BudgetPlanInputRow,
} from "@/lib/settings/budget-plan"
import {
  buildUnifiedMonthlyTargetRanges,
  deriveMonthlyTargetPlanHorizon,
  deriveTargetRangeHorizon,
  normalizeMonthlyTargetPlanRows,
  parseMonthlyTargetPlanRows,
  serializeMonthlyTargetPlanRows,
  synthesizeMonthlyTargetPlanRowsFromCanonical,
  ECOMDASH2_TARGETS_MONTHLY_PLAN_ENTRY_KEY,
  type MonthlyTargetPlanInputRow,
} from "@/lib/settings/monthly-target-plan"
import {
  validateAndMaterializeTargets,
  type TargetValidationError,
} from "@/lib/settings/targets-validation"

export type PlanningIssue = {
  source: "draft" | "materialization"
  row: number
  field: string
  message: string
  value: string
}

export type SaveAndApplyPlanningResult =
  | {
      status: "success"
      message: string
      savedRowCount: number
      canonicalRowCount: number
      effectiveRowCount: number
      appliedAt: string
    }
  | {
      status: "error"
      message: string
      issues: PlanningIssue[]
    }

function mapValidationErrors(
  source: PlanningIssue["source"],
  errors: Array<{
    row?: number
    sourceRow?: number
    field: string
    message: string
    value: string
  }>
) {
  return errors.map((error) => ({
    source,
    row: error.row ?? error.sourceRow ?? 0,
    field: error.field,
    message: error.message,
    value: error.value,
  }))
}

function mapTargetValidationErrors(errors: TargetValidationError[]) {
  return mapValidationErrors(
    "materialization",
    errors.map((error) => ({
      sourceRow: error.sourceRow,
      field: error.field,
      message: error.message,
      value: error.value,
    }))
  )
}

async function loadCurrentTargetPlanRows(workspaceId: string) {
  const [targetEntryRows, canonicalRows] = await Promise.all([
    selectRowsFromTable("targetEntries", {
      workspaceId,
      limit: null,
      bypassCache: true,
    }),
    selectRowsFromTable("targetsCanonicalRanges", {
      workspaceId,
      limit: null,
      bypassCache: true,
    }),
  ])
  const targetEntries = targetEntryRows.map(parseTargetEntry)
  const parsedTargetPlanRows = parseMonthlyTargetPlanRows(
    targetEntries.find(
      (entry) => entry.settingKey === ECOMDASH2_TARGETS_MONTHLY_PLAN_ENTRY_KEY
    )?.settingValue || ""
  )

  if (parsedTargetPlanRows.length > 0) {
    return parsedTargetPlanRows
  }

  return synthesizeMonthlyTargetPlanRowsFromCanonical(
    canonicalRows.map((row) => {
      const parsed = parseTargetsCanonicalRange(row)
      return {
        rangeType: parsed.rangeType,
        priority: parsed.priority,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        revenueTarget: parsed.revenueTarget,
        profitTarget: parsed.profitTarget,
        notes: parsed.notes,
        updatedAt: parsed.updatedAt,
      }
    })
  )
}

async function loadCurrentBudgetPlanRows(workspaceId: string) {
  const [budgetRows, canonicalRows] = await Promise.all([
    selectRowsFromTable("budgetPlanMonthly", {
      workspaceId,
      limit: null,
      bypassCache: true,
    }),
    selectRowsFromTable("targetsCanonicalRanges", {
      workspaceId,
      limit: null,
      bypassCache: true,
    }),
  ])
  const parsedBudgetRows = budgetRows.map(parseBudgetPlanMonthly)

  if (parsedBudgetRows.length > 0) {
    return parsedBudgetRows
  }

  return synthesizeBudgetRowsFromCanonical(
    canonicalRows.map((row) => {
      const parsed = parseTargetsCanonicalRange(row)
      return {
        rangeType: parsed.rangeType,
        priority: parsed.priority,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        adBudget: parsed.adBudget,
        notes: parsed.notes,
        updatedAt: parsed.updatedAt,
      }
    })
  )
}

async function materializeSharedTargets(input: {
  workspaceId: string
  currency: string
  ranges: ReturnType<typeof buildUnifiedMonthlyTargetRanges>
  jobName: string
  successMessage: string
  failureMessage: string
}) {
  const runId = await startJobRun(input.workspaceId, input.jobName)
  const appliedAt = new Date().toISOString()

  try {
    const horizon = deriveTargetRangeHorizon(input.ranges)

    if (!input.ranges.length || !horizon.horizonStart || !horizon.horizonEnd) {
      const message = "No monthly planning rows are available to apply."

      await upsertBudgetTargetsMetaRow(input.workspaceId, {
        validationStatus: "failure",
        lastRunAt: appliedAt,
        lastRunResult: "failure",
        message,
      })
      await finishJobRun(runId, "failed", message)

      return {
        status: "error" as const,
        message,
        issues: [] as PlanningIssue[],
      }
    }

    const materialized = validateAndMaterializeTargets({
      ranges: input.ranges,
      horizonStart: horizon.horizonStart,
      horizonEnd: horizon.horizonEnd,
      defaultCurrency: input.currency,
      updatedAtIso: appliedAt,
    })

    if (materialized.errors.length > 0) {
      await replaceTargetsErrorRows(
        input.workspaceId,
        materialized.errors.map((error) => ({
          sheetName: error.sheetName,
          sourceRow: error.sourceRow,
          field: error.field,
          message: error.message,
          value: error.value,
          createdAt: appliedAt,
        }))
      )
      await upsertBudgetTargetsMetaRow(input.workspaceId, {
        validationStatus: "failure",
        lastRunAt: appliedAt,
        lastRunResult: "failure",
        message: input.failureMessage,
      })
      await finishJobRun(runId, "failed", input.failureMessage, {
        errorCount: materialized.errors.length,
      })

      return {
        status: "error" as const,
        message: input.failureMessage,
        issues: mapTargetValidationErrors(materialized.errors),
      }
    }

    await replaceTargetsCanonicalRows(
      input.workspaceId,
      materialized.canonical.map((row) => ({
        rangeId: row.rangeId,
        rangeType: row.rangeType,
        priority: row.priority,
        startDate: row.startDate,
        endDate: row.endDate,
        currency: row.currency,
        revenueTarget: row.revenueTarget === null ? "" : row.revenueTarget,
        adBudget: row.adBudget === null ? "" : row.adBudget,
        profitTarget: row.profitTarget === null ? "" : row.profitTarget,
        targetMer: row.targetMer === null ? "" : row.targetMer,
        targetAdCostPct: row.targetAdCostPct === null ? "" : row.targetAdCostPct,
        notes: row.notes,
        sourceSheet: row.sourceSheet,
        sourceRow: row.sourceRow,
        updatedAt: row.updatedAt,
      }))
    )
    await replaceTargetsEffectiveRows(
      input.workspaceId,
      materialized.effective.map((row) => ({
        date: row.date,
        currency: row.currency,
        revenueTarget: row.revenueTarget,
        adBudget: row.adBudget,
        profitTarget: row.profitTarget,
        targetMer: row.targetMer,
        targetAdCostPct: row.targetAdCostPct,
        appliedRangeIds: row.appliedRangeIds,
        modeRevenue: row.modeRevenue,
        modeAdBudget: row.modeAdBudget,
        modeProfit: row.modeProfit,
        updatedAt: row.updatedAt,
      }))
    )
    await replaceTargetsErrorRows(input.workspaceId, [])
    await upsertBudgetTargetsMetaRow(input.workspaceId, {
      validationStatus: "success",
      lastAppliedAt: appliedAt,
      lastRunAt: appliedAt,
      lastRunResult: "success",
      message: input.successMessage,
    })
    await finishJobRun(runId, "success", input.successMessage, {
      canonicalRows: materialized.canonical.length,
      effectiveRows: materialized.effective.length,
    })

    return {
      status: "success" as const,
      message: input.successMessage,
      savedRowCount: 0,
      canonicalRowCount: materialized.canonical.length,
      effectiveRowCount: materialized.effective.length,
      appliedAt,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to apply planning changes."

    await upsertBudgetTargetsMetaRow(input.workspaceId, {
      validationStatus: "failure",
      lastRunAt: appliedAt,
      lastRunResult: "failure",
      message,
    })
    await finishJobRun(runId, "failed", message)

    return {
      status: "error" as const,
      message,
      issues: [] as PlanningIssue[],
    }
  }
}

export async function saveBudgetPlanAndApply(input: {
  workspaceId: string
  currency: string
  rows: BudgetPlanInputRow[]
}): Promise<SaveAndApplyPlanningResult> {
  const normalized = normalizeBudgetRows(input.rows)

  if (normalized.errors.length > 0) {
    return {
      status: "error",
      message: "Budget rows contain validation errors.",
      issues: mapValidationErrors("draft", normalized.errors),
    }
  }

  if (!normalized.rows.length) {
    return {
      status: "error",
      message: "Add at least one budget row before saving and applying.",
      issues: [],
    }
  }

  await replaceBudgetPlanMonthlyRows(input.workspaceId, normalized.rows)

  const currentTargetPlanRows = await loadCurrentTargetPlanRows(input.workspaceId)
  const ranges = buildUnifiedMonthlyTargetRanges(
    normalized.rows,
    currentTargetPlanRows,
    input.currency
  )
  const materialized = await materializeSharedTargets({
    workspaceId: input.workspaceId,
    currency: input.currency,
    ranges,
    jobName: "settings:budgets:validate-apply",
    successMessage: "Budget plan applied.",
    failureMessage: "Budget validation failed.",
  })

  if (materialized.status === "error") {
    return materialized
  }

  return {
    ...materialized,
    savedRowCount: normalized.rows.length,
  }
}

export async function saveTargetPlanAndApply(input: {
  workspaceId: string
  currency: string
  rows: MonthlyTargetPlanInputRow[]
}): Promise<SaveAndApplyPlanningResult> {
  const normalized = normalizeMonthlyTargetPlanRows(input.rows)

  if (normalized.errors.length > 0) {
    return {
      status: "error",
      message: "Target rows contain validation errors.",
      issues: mapValidationErrors("draft", normalized.errors),
    }
  }

  if (!normalized.rows.length) {
    return {
      status: "error",
      message: "Add at least one target row before saving and applying.",
      issues: [],
    }
  }

  await upsertTargetEntriesRows(input.workspaceId, [
    {
      settingKey: ECOMDASH2_TARGETS_MONTHLY_PLAN_ENTRY_KEY,
      settingValue: serializeMonthlyTargetPlanRows(normalized.rows),
      description: "EcomDash2 monthly revenue and profit target plan JSON.",
    },
  ])

  const budgetRows = await loadCurrentBudgetPlanRows(input.workspaceId)
  const ranges = buildUnifiedMonthlyTargetRanges(budgetRows, normalized.rows, input.currency)
  const materialized = await materializeSharedTargets({
    workspaceId: input.workspaceId,
    currency: input.currency,
    ranges,
    jobName: "settings:targets-plan:validate-apply",
    successMessage: "Targets plan applied.",
    failureMessage: "Target validation failed.",
  })

  if (materialized.status === "error") {
    return materialized
  }

  return {
    ...materialized,
    savedRowCount: normalized.rows.length,
  }
}

export function deriveBudgetPreviewFromInput(rows: BudgetPlanInputRow[]) {
  const normalized = normalizeBudgetRows(rows)
  return {
    rows: normalized.rows,
    errors: normalized.errors,
    preview: buildBudgetPreview(normalized.rows),
    horizon: deriveBudgetHorizon(normalized.rows),
  }
}

export function deriveTargetPreviewFromInput(rows: MonthlyTargetPlanInputRow[]) {
  const normalized = normalizeMonthlyTargetPlanRows(rows)
  return {
    rows: normalized.rows,
    errors: normalized.errors,
    horizon: deriveMonthlyTargetPlanHorizon(normalized.rows),
  }
}
