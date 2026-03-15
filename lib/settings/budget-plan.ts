export type BudgetPlanInputRow = {
  month?: unknown
  channel?: unknown
  budget?: unknown
  notes?: unknown
}

export type BudgetPlanRow = {
  month: string
  channel: string
  budget: number
  notes: string
}

export type BudgetPlanValidationError = {
  row: number
  field: string
  message: string
  value: string
}

export type BudgetPreviewRow = {
  month: string
  totalBudget: number
  channelCount: number
}

type CanonicalBudgetLikeRow = {
  rangeType?: unknown
  priority?: unknown
  startDate?: unknown
  endDate?: unknown
  adBudget?: unknown
  notes?: unknown
  updatedAt?: unknown
}

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

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

function getMonthNumberFromName(value: string) {
  return MONTH_NAME_TO_NUMBER[value.toLowerCase().replace(/\./g, "").trim()] || 0
}

function addMonths(monthIso: string, offset: number) {
  const parts = getMonthParts(monthIso)

  if (!parts) {
    return ""
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, 1))
  date.setUTCMonth(date.getUTCMonth() + offset)
  return toMonthIso(date.getUTCFullYear(), date.getUTCMonth() + 1)
}

function listMonthRange(startMonth: string, endMonth: string) {
  const start = normalizeBudgetMonth(startMonth)
  const end = normalizeBudgetMonth(endMonth)

  if (!start || !end || start > end) {
    return [] as string[]
  }

  const months: string[] = []
  let cursor = start

  while (cursor && cursor <= end) {
    months.push(cursor)
    cursor = addMonths(cursor, 1)
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

export function normalizeBudgetMonth(value: unknown) {
  const raw = toText(value)

  if (!raw) {
    return ""
  }

  const isoMonth = /^(\d{4})-(\d{2})$/.exec(raw)

  if (isoMonth) {
    const year = Number(isoMonth[1])
    const month = Number(isoMonth[2])
    return month >= 1 && month <= 12 ? toMonthIso(year, month) : ""
  }

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)

  if (isoDate) {
    const parsed = new Date(Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3])))
    return Number.isNaN(parsed.getTime())
      ? ""
      : toMonthIso(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1)
  }

  const slashMonthYear = /^(\d{1,2})\/(\d{4})$/.exec(raw)

  if (slashMonthYear) {
    const month = Number(slashMonthYear[1])
    const year = Number(slashMonthYear[2])
    return month >= 1 && month <= 12 ? toMonthIso(year, month) : ""
  }

  const slashYearMonth = /^(\d{4})\/(\d{1,2})$/.exec(raw)

  if (slashYearMonth) {
    const year = Number(slashYearMonth[1])
    const month = Number(slashYearMonth[2])
    return month >= 1 && month <= 12 ? toMonthIso(year, month) : ""
  }

  const monthNameFirst = /^([A-Za-z.]+)\s+(\d{4})$/.exec(raw)

  if (monthNameFirst) {
    const month = getMonthNumberFromName(monthNameFirst[1])
    return month ? toMonthIso(Number(monthNameFirst[2]), month) : ""
  }

  const yearFirstMonthName = /^(\d{4})[\s\-_/]+([A-Za-z.]+)$/.exec(raw)

  if (yearFirstMonthName) {
    const month = getMonthNumberFromName(yearFirstMonthName[2])
    return month ? toMonthIso(Number(yearFirstMonthName[1]), month) : ""
  }

  const parsed = new Date(raw)

  if (Number.isNaN(parsed.getTime())) {
    return ""
  }

  return toMonthIso(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1)
}

export function parseBudgetNumber(value: unknown) {
  const raw = toText(value)

  if (!raw) {
    return null
  }

  const sanitized = raw
    .replace(/[$\u00A3\u20AC\u00A5]/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/usd|gbp|eur|aud|cad|nzd/gi, "")

  if (!sanitized) {
    return null
  }

  const parsed = Number(sanitized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function mergeBudgetRows(rows: BudgetPlanRow[]) {
  const rowsByKey = new Map<string, BudgetPlanRow>()

  for (const row of rows) {
    const month = normalizeBudgetMonth(row.month)
    const channel = toText(row.channel) || "Total"
    const budget = parseBudgetNumber(row.budget)

    if (!month || budget === null) {
      continue
    }

    const key = `${month}::${channel.toLowerCase()}`
    const existing = rowsByKey.get(key)

    if (!existing) {
      rowsByKey.set(key, {
        month,
        channel,
        budget: roundTo6(budget),
        notes: toText(row.notes),
      })
      continue
    }

    const notes = [existing.notes, toText(row.notes)]
      .filter(Boolean)
      .filter((value, index, items) => items.indexOf(value) === index)
      .join(" | ")

    rowsByKey.set(key, {
      month,
      channel: existing.channel,
      budget: roundTo6(existing.budget + budget),
      notes,
    })
  }

  return Array.from(rowsByKey.values()).sort((left, right) => {
    if (left.month !== right.month) {
      return left.month.localeCompare(right.month)
    }

    return left.channel.localeCompare(right.channel)
  })
}

export function normalizeBudgetRows(rows: BudgetPlanInputRow[]) {
  const normalizedRows: BudgetPlanRow[] = []
  const errors: BudgetPlanValidationError[] = []

  for (let index = 0; index < rows.length; index += 1) {
    const rawRow = rows[index] ?? {}
    const rowNumber = index + 1
    const month = normalizeBudgetMonth(rawRow.month)
    const budget = parseBudgetNumber(rawRow.budget)

    if (!month) {
      errors.push({
        row: rowNumber,
        field: "month",
        message: "Month must be YYYY-MM, YYYY-MM-DD, MM/YYYY, or a month name.",
        value: toText(rawRow.month),
      })
    }

    if (budget === null) {
      errors.push({
        row: rowNumber,
        field: "budget",
        message: "Budget must be a number greater than or equal to 0.",
        value: toText(rawRow.budget),
      })
    }

    if (!month || budget === null) {
      continue
    }

    normalizedRows.push({
      month,
      channel: toText(rawRow.channel) || "Total",
      budget: roundTo6(budget),
      notes: toText(rawRow.notes),
    })
  }

  return {
    rows: mergeBudgetRows(normalizedRows),
    errors,
  }
}

export function deriveBudgetHorizon(rows: Array<{ month: string }>) {
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

export function buildBudgetPreview(rows: BudgetPlanRow[]) {
  const totalsByMonth = new Map<string, { totalBudget: number; channels: Set<string> }>()

  for (const row of rows) {
    const month = normalizeBudgetMonth(row.month)
    const budget = parseBudgetNumber(row.budget)

    if (!month || budget === null) {
      continue
    }

    const current = totalsByMonth.get(month) ?? {
      totalBudget: 0,
      channels: new Set<string>(),
    }

    current.totalBudget += budget
    current.channels.add(toText(row.channel) || "Total")
    totalsByMonth.set(month, current)
  }

  return Array.from(totalsByMonth.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([month, summary]) => ({
      month,
      totalBudget: roundTo6(summary.totalBudget),
      channelCount: summary.channels.size,
    }))
}

export function synthesizeBudgetRowsFromCanonical(rows: CanonicalBudgetLikeRow[]) {
  const candidatesByMonth = new Map<
    string,
    Array<{
      priority: number
      rangeLengthDays: number
      updatedAt: string
      budget: number
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
    const budget = parseBudgetNumber(row.adBudget)

    if (!startMonth || !endMonth || budget === null) {
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
        budget: roundTo6(budget),
        notes: toText(row.notes),
      })
      candidatesByMonth.set(month, candidates)
    }
  }

  const synthesizedRows: BudgetPlanRow[] = []

  for (const month of Array.from(candidatesByMonth.keys()).sort()) {
    const winner = (candidatesByMonth.get(month) ?? []).sort((left, right) => {
      const priorityDifference = right.priority - left.priority

      if (priorityDifference !== 0) {
        return priorityDifference
      }

      if (left.rangeLengthDays !== right.rangeLengthDays) {
        return left.rangeLengthDays - right.rangeLengthDays
      }

      return right.updatedAt.localeCompare(left.updatedAt)
    })[0]

    if (!winner) {
      continue
    }

    synthesizedRows.push({
      month,
      channel: "Total",
      budget: winner.budget,
      notes: winner.notes,
    })
  }

  return synthesizedRows
}

export function buildAnnualBudgetRows(
  year: number,
  annualBudget: number,
  channel = "Total",
  notes = "Generated from annual budget"
) {
  if (!Number.isFinite(year) || year < 1970 || year > 2200) {
    return [] as BudgetPlanRow[]
  }

  if (!Number.isFinite(annualBudget) || annualBudget < 0) {
    return [] as BudgetPlanRow[]
  }

  const monthlyBudget = roundTo6(annualBudget / 12)

  return Array.from({ length: 12 }, (_, index) => ({
    month: toMonthIso(year, index + 1),
    channel: toText(channel) || "Total",
    budget: monthlyBudget,
    notes: toText(notes),
  }))
}

export function buildRepeatedMonthlyBudgetRows(
  startMonth: string,
  endMonth: string,
  monthlyBudget: number,
  channel = "Total",
  notes = "Generated monthly value"
) {
  const start = normalizeBudgetMonth(startMonth)
  const end = normalizeBudgetMonth(endMonth)

  if (!start || !end || start > end) {
    return [] as BudgetPlanRow[]
  }

  if (!Number.isFinite(monthlyBudget) || monthlyBudget < 0) {
    return [] as BudgetPlanRow[]
  }

  return listMonthRange(start, end).map((month) => ({
    month,
    channel: toText(channel) || "Total",
    budget: roundTo6(monthlyBudget),
    notes: toText(notes),
  }))
}
