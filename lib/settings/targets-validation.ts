import crypto from "node:crypto"

export type TargetRangeInput = {
  rangeId?: string
  rangeType?: string
  priority?: number | string
  startDate?: string
  endDate?: string
  currency?: string
  revenueTarget?: number | string | null
  adBudget?: number | string | null
  profitTarget?: number | string | null
  targetMer?: number | string | null
  targetAdCostPct?: number | string | null
  notes?: string
  sourceSheet?: string
  sourceRow?: number | string
  updatedAt?: string
}

export type TargetCanonicalRow = {
  rangeId: string
  rangeType: string
  priority: number
  startDate: string
  endDate: string
  currency: string
  revenueTarget: number | null
  adBudget: number | null
  profitTarget: number | null
  targetMer: number | null
  targetAdCostPct: number | null
  notes: string
  sourceSheet: string
  sourceRow: number
  updatedAt: string
  rangeLengthDays: number
}

export type TargetEffectiveRow = {
  date: string
  currency: string
  revenueTarget: number | string
  adBudget: number | string
  profitTarget: number | string
  targetMer: number | string
  targetAdCostPct: number | string
  appliedRangeIds: string
  modeRevenue: string
  modeAdBudget: string
  modeProfit: string
  updatedAt: string
}

export type TargetValidationError = {
  sheetName: string
  sourceRow: number
  field: string
  message: string
  value: string
}

export type ValidateTargetsOptions = {
  ranges: TargetRangeInput[]
  horizonStart?: string
  horizonEnd?: string
  defaultCurrency?: string
  updatedAtIso?: string
}

export type ValidateTargetsResult = {
  canonical: TargetCanonicalRow[]
  effective: TargetEffectiveRow[]
  errors: TargetValidationError[]
  horizonStart: string
  horizonEnd: string
}

const DEFAULT_CURRENCY = "GBP"

function toText(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim()
}

function parseInteger(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback
}

function parseNonNegativeNumber(value: unknown) {
  const text = toText(value)

  if (!text) {
    return null
  }

  const parsed = Number(text)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function roundTo6(value: number | null) {
  return value === null ? null : Math.round(value * 1_000_000) / 1_000_000
}

function toStoredValue(value: number | null) {
  return value === null ? "" : value
}

function normalizeCurrency(value: unknown) {
  return toText(value).toUpperCase() || DEFAULT_CURRENCY
}

function normalizeDateIso(value: unknown) {
  const raw = toText(value)

  if (!raw) {
    return ""
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10)
  }

  const slashDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)

  if (slashDate) {
    const first = Number(slashDate[1])
    const second = Number(slashDate[2])
    const year = Number(slashDate[3])
    let day = first
    let month = second

    if (first <= 12 && second > 12) {
      month = first
      day = second
    }

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }

  const serial = Number(raw)

  if (Number.isFinite(serial) && serial > 1000 && serial < 100000) {
    const ms = Math.round((serial - 25569) * 86_400_000)
    const parsed = new Date(ms)

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10)
}

function isoToDate(iso: string) {
  const parts = iso.split("-")

  if (parts.length !== 3) {
    return new Date("invalid")
  }

  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
}

function dateToIso(date: Date) {
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10)
}

function getFirstDayOfMonth(iso: string) {
  const date = isoToDate(iso)

  if (Number.isNaN(date.getTime())) {
    return ""
  }

  return dateToIso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)))
}

function getLastDayOfMonth(iso: string) {
  const date = isoToDate(iso)

  if (Number.isNaN(date.getTime())) {
    return ""
  }

  return dateToIso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)))
}

function getDaysInMonth(iso: string) {
  const date = isoToDate(iso)

  if (Number.isNaN(date.getTime())) {
    return 30
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
}

function getInclusiveDayCount(startIso: string, endIso: string) {
  const start = isoToDate(startIso).getTime()
  const end = isoToDate(endIso).getTime()

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0
  }

  return Math.floor((end - start) / 86_400_000) + 1
}

function listIsoDates(startIso: string, endIso: string) {
  const start = isoToDate(startIso)
  const end = isoToDate(endIso)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [] as string[]
  }

  const dates: string[] = []
  const cursor = new Date(start.getTime())

  while (cursor <= end) {
    dates.push(dateToIso(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dates
}

function buildGeneratedRangeId(rangeType: string, sourceRow: number, index: number) {
  const suffix = crypto.randomUUID().split("-")[0] || "x"
  return `${rangeType}_${sourceRow}_${index}_${suffix}`
}

function appendError(
  errors: TargetValidationError[],
  sourceRow: number,
  field: string,
  message: string,
  value: unknown
) {
  errors.push({
    sheetName: "Settings",
    sourceRow,
    field,
    message,
    value: toText(value),
  })
}

function normalizeRangeType(value: unknown) {
  const rangeType = toText(value).toLowerCase()

  if (rangeType === "default" || rangeType === "monthly" || rangeType === "override") {
    return rangeType
  }

  return rangeType || "override"
}

function parsePriority(rangeType: string, value: unknown) {
  const parsed = parseInteger(value, Number.NaN)

  if (Number.isFinite(parsed)) {
    return parsed
  }

  if (rangeType === "default") {
    return 0
  }

  if (rangeType === "monthly") {
    return 10
  }

  if (rangeType === "override") {
    return 20
  }

  return 50
}

function compareCanonicalRanges(left: TargetCanonicalRow, right: TargetCanonicalRow) {
  const priorityDifference = right.priority - left.priority

  if (priorityDifference !== 0) {
    return priorityDifference
  }

  if (left.rangeLengthDays !== right.rangeLengthDays) {
    return left.rangeLengthDays - right.rangeLengthDays
  }

  if (left.updatedAt === right.updatedAt) {
    return 0
  }

  return left.updatedAt > right.updatedAt ? -1 : 1
}

function findMatchingRanges(ranges: TargetCanonicalRow[], dateIso: string) {
  return ranges.filter((range) => range.startDate <= dateIso && range.endDate >= dateIso)
}

function pickMetricValue(
  candidates: TargetCanonicalRow[],
  metric:
    | "revenueTarget"
    | "adBudget"
    | "profitTarget"
    | "targetMer"
    | "targetAdCostPct",
  dateIso: string,
  additive: boolean
) {
  for (const candidate of candidates) {
    const rawValue = candidate[metric]

    if (rawValue === null) {
      continue
    }

    let value = rawValue

    if (additive) {
      value =
        candidate.rangeType === "override"
          ? rawValue / Math.max(1, candidate.rangeLengthDays)
          : rawValue / Math.max(1, getDaysInMonth(dateIso))
    }

    return {
      value: roundTo6(value),
      mode: candidate.rangeType,
    }
  }

  return {
    value: null,
    mode: "",
  }
}

function inferHorizon(canonical: TargetCanonicalRow[]) {
  if (!canonical.length) {
    return {
      start: "",
      end: "",
    }
  }

  return canonical.reduce(
    (current, row) => ({
      start: !current.start || row.startDate < current.start ? row.startDate : current.start,
      end: !current.end || row.endDate > current.end ? row.endDate : current.end,
    }),
    {
      start: "",
      end: "",
    }
  )
}

function validateCanonicalRanges(
  inputRanges: TargetRangeInput[],
  updatedAtIso: string,
  defaultCurrency: string
) {
  const errors: TargetValidationError[] = []
  const canonical: TargetCanonicalRow[] = []

  for (let index = 0; index < inputRanges.length; index += 1) {
    const input = inputRanges[index] ?? {}
    const sourceRow = parseInteger(input.sourceRow, index + 1)
    const rangeType = normalizeRangeType(input.rangeType)
    let startDate = normalizeDateIso(input.startDate)
    let endDate = normalizeDateIso(input.endDate)

    if (!startDate) {
      appendError(errors, sourceRow, "startDate", "Invalid date.", input.startDate)
    }

    if (!endDate) {
      appendError(errors, sourceRow, "endDate", "Invalid date.", input.endDate)
    }

    if (startDate && endDate && startDate > endDate) {
      appendError(
        errors,
        sourceRow,
        "dateRange",
        "startDate must be on or before endDate.",
        `${startDate} > ${endDate}`
      )
    }

    if (startDate && rangeType === "monthly") {
      startDate = getFirstDayOfMonth(startDate)
      endDate = getLastDayOfMonth(startDate)
    }

    const revenueTarget = parseNonNegativeNumber(input.revenueTarget)
    const adBudget = parseNonNegativeNumber(input.adBudget)
    const profitTarget = parseNonNegativeNumber(input.profitTarget)
    const targetMer = parseNonNegativeNumber(input.targetMer)
    const targetAdCostPct = parseNonNegativeNumber(input.targetAdCostPct)

    if (toText(input.revenueTarget) && revenueTarget === null) {
      appendError(errors, sourceRow, "revenueTarget", "Must be a number greater than or equal to 0.", input.revenueTarget)
    }

    if (toText(input.adBudget) && adBudget === null) {
      appendError(errors, sourceRow, "adBudget", "Must be a number greater than or equal to 0.", input.adBudget)
    }

    if (toText(input.profitTarget) && profitTarget === null) {
      appendError(errors, sourceRow, "profitTarget", "Must be a number greater than or equal to 0.", input.profitTarget)
    }

    if (toText(input.targetMer) && targetMer === null) {
      appendError(errors, sourceRow, "targetMer", "Must be a number greater than or equal to 0.", input.targetMer)
    }

    if (toText(input.targetAdCostPct) && targetAdCostPct === null) {
      appendError(
        errors,
        sourceRow,
        "targetAdCostPct",
        "Must be a number greater than or equal to 0.",
        input.targetAdCostPct
      )
    }

    if (!startDate || !endDate) {
      continue
    }

    canonical.push({
      rangeId: toText(input.rangeId) || buildGeneratedRangeId(rangeType, sourceRow, index + 1),
      rangeType,
      priority: parsePriority(rangeType, input.priority),
      startDate,
      endDate,
      currency: normalizeCurrency(input.currency || defaultCurrency),
      revenueTarget: revenueTarget === null ? null : roundTo6(revenueTarget),
      adBudget: adBudget === null ? null : roundTo6(adBudget),
      profitTarget: profitTarget === null ? null : roundTo6(profitTarget),
      targetMer: targetMer === null ? null : roundTo6(targetMer),
      targetAdCostPct:
        targetAdCostPct === null ? null : roundTo6(targetAdCostPct),
      notes: toText(input.notes),
      sourceSheet: toText(input.sourceSheet) || "settings_ui",
      sourceRow,
      updatedAt: toText(input.updatedAt) || updatedAtIso,
      rangeLengthDays: Math.max(1, getInclusiveDayCount(startDate, endDate)),
    })
  }

  return {
    canonical,
    errors,
  }
}

function buildEffectiveRows(
  canonical: TargetCanonicalRow[],
  horizonStart: string,
  horizonEnd: string,
  updatedAtIso: string
) {
  return listIsoDates(horizonStart, horizonEnd).map((date) => {
    const candidates = findMatchingRanges(canonical, date).sort(compareCanonicalRanges)
    const appliedRangeIds = candidates
      .map((candidate) => `${candidate.rangeType}:${candidate.rangeId}`)
      .join("|")
    const revenueResult = pickMetricValue(candidates, "revenueTarget", date, true)
    const adBudgetResult = pickMetricValue(candidates, "adBudget", date, true)
    const profitResult = pickMetricValue(candidates, "profitTarget", date, true)
    const merResult = pickMetricValue(candidates, "targetMer", date, false)
    const adCostPctResult = pickMetricValue(candidates, "targetAdCostPct", date, false)

    let targetMer = merResult.value
    let targetAdCostPct = adCostPctResult.value

    if (
      targetMer === null &&
      revenueResult.value !== null &&
      adBudgetResult.value !== null &&
      adBudgetResult.value > 0
    ) {
      targetMer = roundTo6(revenueResult.value / adBudgetResult.value)
    }

    if (
      targetAdCostPct === null &&
      revenueResult.value !== null &&
      revenueResult.value > 0 &&
      adBudgetResult.value !== null
    ) {
      targetAdCostPct = roundTo6(adBudgetResult.value / revenueResult.value)
    }

    return {
      date,
      currency: candidates.find((candidate) => candidate.currency)?.currency || DEFAULT_CURRENCY,
      revenueTarget: toStoredValue(revenueResult.value),
      adBudget: toStoredValue(adBudgetResult.value),
      profitTarget: toStoredValue(profitResult.value),
      targetMer: toStoredValue(targetMer),
      targetAdCostPct: toStoredValue(targetAdCostPct),
      appliedRangeIds,
      modeRevenue: revenueResult.mode,
      modeAdBudget: adBudgetResult.mode,
      modeProfit: profitResult.mode,
      updatedAt: updatedAtIso,
    } satisfies TargetEffectiveRow
  })
}

export function validateAndMaterializeTargets(
  options: ValidateTargetsOptions
): ValidateTargetsResult {
  const updatedAtIso = toText(options.updatedAtIso) || new Date().toISOString()
  const defaultCurrency = normalizeCurrency(options.defaultCurrency || DEFAULT_CURRENCY)
  const sourceRanges = Array.isArray(options.ranges) ? options.ranges : []
  const { canonical, errors } = validateCanonicalRanges(
    sourceRanges,
    updatedAtIso,
    defaultCurrency
  )

  if (errors.length > 0) {
    const inferred = inferHorizon(canonical)
    return {
      canonical,
      effective: [],
      errors,
      horizonStart: normalizeDateIso(options.horizonStart) || inferred.start,
      horizonEnd: normalizeDateIso(options.horizonEnd) || inferred.end,
    }
  }

  const inferred = inferHorizon(canonical)
  const horizonStart = normalizeDateIso(options.horizonStart) || inferred.start
  const horizonEnd = normalizeDateIso(options.horizonEnd) || inferred.end

  if (!horizonStart || !horizonEnd || horizonStart > horizonEnd) {
    return {
      canonical,
      effective: [],
      errors: [
        {
          sheetName: "Settings",
          sourceRow: 0,
          field: "horizon",
          message: "Invalid horizon start or end date.",
          value: `${horizonStart}..${horizonEnd}`,
        },
      ],
      horizonStart,
      horizonEnd,
    }
  }

  return {
    canonical,
    effective: buildEffectiveRows(canonical, horizonStart, horizonEnd, updatedAtIso),
    errors: [],
    horizonStart,
    horizonEnd,
  }
}
