import { type BudgetImportTable } from "@/lib/settings/budget-import"
import {
  normalizeBudgetMonth,
  parseBudgetNumber,
} from "@/lib/settings/budget-plan"
import type { TargetRangeInput } from "@/lib/settings/targets-validation"

export const ECOMDASH2_TARGETS_MONTHLY_PLAN_ENTRY_KEY =
  "ecomdash2.targets.monthly_plan_json"

export type MonthlyTargetPlanInputRow = {
  month?: unknown
  revenueTarget?: unknown
  revenue_target?: unknown
  profitTarget?: unknown
  profit_target?: unknown
  notes?: unknown
}

export type MonthlyTargetPlanRow = {
  month: string
  revenueTarget: number | null
  profitTarget: number | null
  notes: string
}

export type MonthlyTargetPlanValidationError = {
  row: number
  field: string
  message: string
  value: string
}

export type MonthlyTargetPreviewRow = {
  month: string
  revenueTarget: number | null
  profitTarget: number | null
}

export type MonthlyTargetImportMapping = {
  monthColumn: string
  revenueColumn: string
  profitColumn: string
  notesColumn: string
}

export type MonthlyTargetImportPlan = {
  table: BudgetImportTable
  mapping: MonthlyTargetImportMapping
  requiresMapping: boolean
  errors: string[]
}

type CanonicalTargetLikeRow = {
  rangeType?: unknown
  priority?: unknown
  startDate?: unknown
  endDate?: unknown
  revenueTarget?: unknown
  profitTarget?: unknown
  notes?: unknown
  updatedAt?: unknown
}

const TARGET_MONTH_ALIASES = new Set([
  "month",
  "period",
  "date",
  "monthstart",
  "targetmonth",
])

const TARGET_REVENUE_ALIASES = new Set([
  "revenue",
  "revenuetarget",
  "targetrevenue",
  "sales",
  "salesgoal",
])

const TARGET_PROFIT_ALIASES = new Set([
  "profit",
  "profittarget",
  "targetprofit",
  "contributionprofit",
])

const TARGET_NOTES_ALIASES = new Set(["notes", "note", "comment", "comments", "memo"])

function toText(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim()
}

function toMonthIso(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`
}

function getMonthParts(monthIso: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthIso)

  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }

  return {
    year,
    month,
  }
}

function getMonthStartIso(monthIso: string) {
  return getMonthParts(monthIso) ? `${monthIso}-01` : ""
}

function getMonthEndIso(monthIso: string) {
  const parts = getMonthParts(monthIso)

  if (!parts) {
    return ""
  }

  const end = new Date(Date.UTC(parts.year, parts.month, 0))
  return end.toISOString().slice(0, 10)
}

function listMonthRange(startMonth: string, endMonth: string) {
  const start = normalizeBudgetMonth(startMonth)
  const end = normalizeBudgetMonth(endMonth)

  if (!start || !end || start > end) {
    return [] as string[]
  }

  const months: string[] = []
  let year = Number(start.slice(0, 4))
  let month = Number(start.slice(5, 7))
  let cursor = toMonthIso(year, month)

  while (cursor <= end) {
    months.push(cursor)
    month += 1

    if (month > 12) {
      month = 1
      year += 1
    }

    cursor = toMonthIso(year, month)
  }

  return months
}

function getInclusiveDayCount(startIso: string, endIso: string) {
  const start = new Date(`${startIso}T00:00:00.000Z`).getTime()
  const end = new Date(`${endIso}T00:00:00.000Z`).getTime()

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0
  }

  return Math.floor((end - start) / 86_400_000) + 1
}

function roundTo6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function readRevenueTargetValue(row: MonthlyTargetPlanInputRow) {
  return row.revenueTarget ?? row.revenue_target
}

function readProfitTargetValue(row: MonthlyTargetPlanInputRow) {
  return row.profitTarget ?? row.profit_target
}

function normalizeHeader(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function findHeaderByAlias(headers: string[], aliases: Set<string>) {
  return headers.find((header) => aliases.has(normalizeHeader(header))) ?? ""
}

function getCellValue(table: BudgetImportTable, row: string[], header: string) {
  const index = table.headers.indexOf(header)
  return index >= 0 ? String(row[index] ?? "").trim() : ""
}

export function mergeMonthlyTargetPlanRows(rows: MonthlyTargetPlanRow[]) {
  const rowsByMonth = new Map<string, MonthlyTargetPlanRow>()

  for (const row of rows) {
    const month = normalizeBudgetMonth(row.month)
    const revenueTarget =
      row.revenueTarget === null ? null : parseBudgetNumber(row.revenueTarget)
    const profitTarget =
      row.profitTarget === null ? null : parseBudgetNumber(row.profitTarget)
    const notes = toText(row.notes)

    if (!month || (revenueTarget === null && profitTarget === null)) {
      continue
    }

    const existing = rowsByMonth.get(month)

    if (!existing) {
      rowsByMonth.set(month, {
        month,
        revenueTarget: revenueTarget === null ? null : roundTo6(revenueTarget),
        profitTarget: profitTarget === null ? null : roundTo6(profitTarget),
        notes,
      })
      continue
    }

    const mergedNotes = [existing.notes, notes]
      .filter(Boolean)
      .filter((value, index, items) => items.indexOf(value) === index)
      .join(" | ")

    rowsByMonth.set(month, {
      month,
      revenueTarget:
        revenueTarget === null
          ? existing.revenueTarget
          : roundTo6((existing.revenueTarget ?? 0) + revenueTarget),
      profitTarget:
        profitTarget === null
          ? existing.profitTarget
          : roundTo6((existing.profitTarget ?? 0) + profitTarget),
      notes: mergedNotes,
    })
  }

  return Array.from(rowsByMonth.values()).sort((left, right) =>
    left.month.localeCompare(right.month)
  )
}

export function normalizeMonthlyTargetPlanRows(rows: MonthlyTargetPlanInputRow[]) {
  const normalizedRows: MonthlyTargetPlanRow[] = []
  const errors: MonthlyTargetPlanValidationError[] = []

  for (let index = 0; index < rows.length; index += 1) {
    const rawRow = rows[index] ?? {}
    const rowNumber = index + 1
    const month = normalizeBudgetMonth(rawRow.month)
    const rawRevenueTarget = readRevenueTargetValue(rawRow)
    const rawProfitTarget = readProfitTargetValue(rawRow)
    const revenueTarget = toText(rawRevenueTarget)
      ? parseBudgetNumber(rawRevenueTarget)
      : null
    const profitTarget = toText(rawProfitTarget)
      ? parseBudgetNumber(rawProfitTarget)
      : null

    if (!month) {
      errors.push({
        row: rowNumber,
        field: "month",
        message: "Month must be YYYY-MM, YYYY-MM-DD, MM/YYYY, or a month name.",
        value: toText(rawRow.month),
      })
    }

    if (toText(rawRevenueTarget) && revenueTarget === null) {
      errors.push({
        row: rowNumber,
        field: "revenueTarget",
        message: "Revenue target must be a number greater than or equal to 0.",
        value: toText(rawRevenueTarget),
      })
    }

    if (toText(rawProfitTarget) && profitTarget === null) {
      errors.push({
        row: rowNumber,
        field: "profitTarget",
        message: "Profit target must be a number greater than or equal to 0.",
        value: toText(rawProfitTarget),
      })
    }

    if (!toText(rawRevenueTarget) && !toText(rawProfitTarget)) {
      errors.push({
        row: rowNumber,
        field: "targets",
        message: "Set a revenue target, a profit target, or both.",
        value: "",
      })
    }

    if (!month || (!toText(rawRevenueTarget) && !toText(rawProfitTarget))) {
      continue
    }

    normalizedRows.push({
      month,
      revenueTarget: revenueTarget === null ? null : roundTo6(revenueTarget),
      profitTarget: profitTarget === null ? null : roundTo6(profitTarget),
      notes: toText(rawRow.notes),
    })
  }

  return {
    rows: mergeMonthlyTargetPlanRows(normalizedRows),
    errors,
  }
}

export function deriveMonthlyTargetPlanHorizon(rows: Array<{ month: string }>) {
  const months = rows
    .map((row) => normalizeBudgetMonth(row.month))
    .filter(Boolean)
    .sort()

  if (!months.length) {
    return {
      horizonStart: "",
      horizonEnd: "",
    }
  }

  return {
    horizonStart: getMonthStartIso(months[0]),
    horizonEnd: getMonthEndIso(months[months.length - 1]),
  }
}

export function buildMonthlyTargetPlanPreview(rows: MonthlyTargetPlanRow[]) {
  return rows
    .map((row) => ({
      month: normalizeBudgetMonth(row.month),
      revenueTarget:
        row.revenueTarget === null ? null : parseBudgetNumber(row.revenueTarget),
      profitTarget:
        row.profitTarget === null ? null : parseBudgetNumber(row.profitTarget),
    }))
    .filter((row) => row.month)
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((row) => ({
      month: row.month,
      revenueTarget: row.revenueTarget === null ? null : roundTo6(row.revenueTarget),
      profitTarget: row.profitTarget === null ? null : roundTo6(row.profitTarget),
    }))
}

export function serializeMonthlyTargetPlanRows(rows: MonthlyTargetPlanRow[]) {
  return JSON.stringify(
    rows.map((row) => ({
      month: row.month,
      revenueTarget: row.revenueTarget === null ? "" : row.revenueTarget,
      profitTarget: row.profitTarget === null ? "" : row.profitTarget,
      notes: row.notes || "",
    }))
  )
}

export function parseMonthlyTargetPlanRows(value: unknown) {
  const raw = toText(value)

  if (!raw) {
    return [] as MonthlyTargetPlanRow[]
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (!Array.isArray(parsed)) {
      return [] as MonthlyTargetPlanRow[]
    }

    return normalizeMonthlyTargetPlanRows(parsed as MonthlyTargetPlanInputRow[]).rows
  } catch {
    return [] as MonthlyTargetPlanRow[]
  }
}

export function synthesizeMonthlyTargetPlanRowsFromCanonical(
  rows: CanonicalTargetLikeRow[]
) {
  const candidatesByMonth = new Map<
    string,
    Array<{
      priority: number
      rangeLengthDays: number
      updatedAt: string
      revenueTarget: number | null
      profitTarget: number | null
      notes: string
    }>
  >()

  for (const row of rows) {
    const rangeType = toText(row.rangeType).toLowerCase()

    if (rangeType !== "monthly" && rangeType !== "default") {
      continue
    }

    const startMonth = normalizeBudgetMonth(row.startDate)
    const endMonth = normalizeBudgetMonth(row.endDate) || startMonth
    const revenueTarget = toText(row.revenueTarget)
      ? parseBudgetNumber(row.revenueTarget)
      : null
    const profitTarget = toText(row.profitTarget)
      ? parseBudgetNumber(row.profitTarget)
      : null

    if (!startMonth || !endMonth || (revenueTarget === null && profitTarget === null)) {
      continue
    }

    const priority = Number(row.priority)
    const updatedAt = toText(row.updatedAt)
    const rangeLengthDays =
      getInclusiveDayCount(toText(row.startDate), toText(row.endDate)) ||
      getInclusiveDayCount(getMonthStartIso(startMonth), getMonthEndIso(endMonth))

    for (const month of listMonthRange(startMonth, endMonth)) {
      const candidates = candidatesByMonth.get(month) ?? []
      candidates.push({
        priority: Number.isFinite(priority) ? priority : rangeType === "monthly" ? 10 : 0,
        rangeLengthDays,
        updatedAt,
        revenueTarget: revenueTarget === null ? null : roundTo6(revenueTarget),
        profitTarget: profitTarget === null ? null : roundTo6(profitTarget),
        notes: toText(row.notes),
      })
      candidatesByMonth.set(month, candidates)
    }
  }

  const rowsFromCanonical: MonthlyTargetPlanRow[] = []

  for (const month of Array.from(candidatesByMonth.keys()).sort()) {
    const candidates = (candidatesByMonth.get(month) ?? []).sort((left, right) => {
      const priorityDifference = right.priority - left.priority

      if (priorityDifference !== 0) {
        return priorityDifference
      }

      if (left.rangeLengthDays !== right.rangeLengthDays) {
        return left.rangeLengthDays - right.rangeLengthDays
      }

      return right.updatedAt.localeCompare(left.updatedAt)
    })

    const revenueTarget =
      candidates.find((candidate) => candidate.revenueTarget !== null)?.revenueTarget ?? null
    const profitTarget =
      candidates.find((candidate) => candidate.profitTarget !== null)?.profitTarget ?? null

    if (revenueTarget === null && profitTarget === null) {
      continue
    }

    rowsFromCanonical.push({
      month,
      revenueTarget,
      profitTarget,
      notes: candidates[0]?.notes || "",
    })
  }

  return rowsFromCanonical
}

export function buildUnifiedMonthlyTargetRanges(
  budgetRows: Array<{ month: string; budget: number | string }>,
  targetRows: MonthlyTargetPlanRow[],
  currency: string
) {
  const budgetsByMonth = new Map<string, number>()

  for (const row of budgetRows) {
    const month = normalizeBudgetMonth(row.month)
    const budget = parseBudgetNumber(row.budget)

    if (!month || budget === null) {
      continue
    }

    budgetsByMonth.set(month, roundTo6((budgetsByMonth.get(month) ?? 0) + budget))
  }

  const targetsByMonth = new Map(
    mergeMonthlyTargetPlanRows(targetRows).map((row) => [row.month, row] as const)
  )

  const months = Array.from(
    new Set<string>([
      ...Array.from(budgetsByMonth.keys()),
      ...Array.from(targetsByMonth.keys()),
    ])
  ).sort()
  const normalizedCurrency = (toText(currency) || "GBP").toUpperCase()

  return months.flatMap((month, index) => {
    const adBudget = budgetsByMonth.get(month)
    const targetRow = targetsByMonth.get(month)
    const revenueTarget = targetRow?.revenueTarget ?? null
    const profitTarget = targetRow?.profitTarget ?? null

    if (adBudget === undefined && revenueTarget === null && profitTarget === null) {
      return [] as TargetRangeInput[]
    }

    return [
      {
        rangeId: `monthly_${month.replace("-", "_")}`,
        rangeType: "monthly",
        priority: 10,
        startDate: getMonthStartIso(month),
        endDate: getMonthEndIso(month),
        currency: normalizedCurrency,
        revenueTarget: revenueTarget === null ? "" : String(roundTo6(revenueTarget)),
        adBudget: adBudget === undefined ? "" : String(roundTo6(adBudget)),
        profitTarget: profitTarget === null ? "" : String(roundTo6(profitTarget)),
        targetMer: "",
        targetAdCostPct: "",
        notes: targetRow?.notes || `Monthly plan ${month}`,
        sourceSheet: "settings_inputs",
        sourceRow: index + 1,
      } satisfies TargetRangeInput,
    ]
  })
}

export function buildAnnualMonthlyTargetRows(
  year: number,
  annualRevenueTarget: number | null,
  annualProfitTarget: number | null,
  notes = "Generated from annual split"
) {
  if (!Number.isFinite(year) || year < 1970 || year > 2200) {
    return [] as MonthlyTargetPlanRow[]
  }

  const revenueTarget =
    annualRevenueTarget === null ||
    !Number.isFinite(annualRevenueTarget) ||
    annualRevenueTarget < 0
      ? null
      : annualRevenueTarget
  const profitTarget =
    annualProfitTarget === null ||
    !Number.isFinite(annualProfitTarget) ||
    annualProfitTarget < 0
      ? null
      : annualProfitTarget

  if (revenueTarget === null && profitTarget === null) {
    return [] as MonthlyTargetPlanRow[]
  }

  return Array.from({ length: 12 }, (_, index) => ({
    month: toMonthIso(year, index + 1),
    revenueTarget: revenueTarget === null ? null : roundTo6(revenueTarget / 12),
    profitTarget: profitTarget === null ? null : roundTo6(profitTarget / 12),
    notes: toText(notes),
  }))
}

export function deriveTargetRangeHorizon(
  ranges: Array<{ startDate?: unknown; endDate?: unknown }>
) {
  const starts = ranges
    .map((range) => toText(range.startDate))
    .filter(Boolean)
    .sort()
  const ends = ranges
    .map((range) => toText(range.endDate))
    .filter(Boolean)
    .sort()

  if (!starts.length || !ends.length) {
    return {
      horizonStart: "",
      horizonEnd: "",
    }
  }

  return {
    horizonStart: starts[0],
    horizonEnd: ends[ends.length - 1],
  }
}

export function autoDetectMonthlyTargetImportPlan(
  table: BudgetImportTable
): MonthlyTargetImportPlan {
  const monthColumn = findHeaderByAlias(table.headers, TARGET_MONTH_ALIASES)
  const revenueColumn = findHeaderByAlias(table.headers, TARGET_REVENUE_ALIASES)
  const profitColumn = findHeaderByAlias(table.headers, TARGET_PROFIT_ALIASES)
  const notesColumn = findHeaderByAlias(table.headers, TARGET_NOTES_ALIASES)
  const fallbackMonth = monthColumn || table.headers[0] || ""
  const fallbackRevenue =
    revenueColumn ||
    table.headers.find((header) => header !== fallbackMonth && /revenue|sales/i.test(header)) ||
    ""
  const fallbackProfit =
    profitColumn ||
    table.headers.find((header) => header !== fallbackMonth && /profit/i.test(header)) ||
    ""
  const errors: string[] = []

  if (!fallbackMonth) {
    errors.push("Could not identify a month column.")
  }

  if (!fallbackRevenue && !fallbackProfit) {
    errors.push("Choose a revenue and/or profit target column.")
  }

  return {
    table,
    mapping: {
      monthColumn: fallbackMonth,
      revenueColumn: fallbackRevenue,
      profitColumn: fallbackProfit,
      notesColumn,
    },
    requiresMapping: errors.length > 0,
    errors,
  }
}

export function mapMonthlyTargetImportRows(
  table: BudgetImportTable,
  mapping: MonthlyTargetImportMapping
) {
  return table.rows.flatMap((row) => {
    const month = getCellValue(table, row, mapping.monthColumn)
    const revenueTarget = getCellValue(table, row, mapping.revenueColumn)
    const profitTarget = getCellValue(table, row, mapping.profitColumn)

    if (!month || (!revenueTarget && !profitTarget)) {
      return [] as Array<{
        month: string
        revenueTarget: string
        profitTarget: string
        notes: string
      }>
    }

    return [
      {
        month,
        revenueTarget,
        profitTarget,
        notes: getCellValue(table, row, mapping.notesColumn),
      },
    ]
  })
}
