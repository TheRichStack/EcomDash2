import {
  AGENT_MAX_MESSAGE_CHARS,
} from "@/lib/agent/constants"
import { isBusinessAnalysisPrompt } from "@/lib/agent/tools"
import type { AgentStorageMessage } from "@/lib/agent/types"
import type { DashboardRequestContext } from "@/types/dashboard"

type ParsedContextOverride = {
  context: DashboardRequestContext
  confidence: "high" | "medium"
  source: "explicit" | "inferred"
  warning: string | null
  assumptionNote?: string | null
}

export type DirectTurnPlan = {
  kind: "direct" | "analysis"
  warnings: string[]
}

export type DateClarificationOption = {
  label: string
  message: string
}

export type ScopeResolution = {
  context: DashboardRequestContext
  confidence: "high" | "medium" | "low"
  source: "explicit" | "inferred" | "none"
  warning: string | null
  assumptionNote: string | null
  needsClarification: boolean
  clarificationQuestion?: string
  clarifyingOptions?: DateClarificationOption[]
}

const GREETING_TERMS = new Set([
  "ello",
  "good",
  "hello",
  "hey",
  "hi",
  "hiya",
  "morning",
])

const COURTESY_TERMS = new Set([
  "appreciate",
  "cheers",
  "thank",
  "thanks",
  "thx",
])

const EVENT_SCOPE_TERMS = new Set([
  "bfcm",
  "black friday",
  "cyber monday",
])

const DATE_SCOPE_ONLY_TERMS = new Set([
  "apr",
  "april",
  "aug",
  "august",
  "calendar",
  "current",
  "dashboard",
  "date",
  "day",
  "days",
  "dec",
  "december",
  "entire",
  "feb",
  "february",
  "for",
  "full",
  "jan",
  "january",
  "jul",
  "july",
  "jun",
  "june",
  "last",
  "mar",
  "march",
  "may",
  "month",
  "nov",
  "november",
  "oct",
  "october",
  "please",
  "question",
  "range",
  "selected",
  "sep",
  "sept",
  "september",
  "the",
  "this",
  "today",
  "use",
  "week",
  "weeks",
  "yesterday",
])

const SPECIFIC_DAY_MONTH_MAP: Record<string, { index: number; label: string }> = {
  jan: { index: 0, label: "January" },
  january: { index: 0, label: "January" },
  feb: { index: 1, label: "February" },
  february: { index: 1, label: "February" },
  mar: { index: 2, label: "March" },
  march: { index: 2, label: "March" },
  apr: { index: 3, label: "April" },
  april: { index: 3, label: "April" },
  may: { index: 4, label: "May" },
  jun: { index: 5, label: "June" },
  june: { index: 5, label: "June" },
  jul: { index: 6, label: "July" },
  july: { index: 6, label: "July" },
  aug: { index: 7, label: "August" },
  august: { index: 7, label: "August" },
  sep: { index: 8, label: "September" },
  sept: { index: 8, label: "September" },
  september: { index: 8, label: "September" },
  oct: { index: 9, label: "October" },
  october: { index: 9, label: "October" },
  nov: { index: 10, label: "November" },
  november: { index: 10, label: "November" },
  dec: { index: 11, label: "December" },
  december: { index: 11, label: "December" },
}

const MONTH_NAME_PAT =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"

const RE_MONTH_DAY_YEAR = new RegExp(
  `\\b(${MONTH_NAME_PAT})\\.?\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`,
  "i"
)

const RE_DAY_MONTH_YEAR = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAME_PAT})\\.?\\s+(20\\d{2})\\b`,
  "i"
)

const RE_ISO_DATE = /\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/

function tokenizeMessage(message: string) {
  return String(message ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(isoDate: string, days: number) {
  const shifted = new Date(`${isoDate}T00:00:00.000Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return toIsoDate(shifted)
}

function startOfIsoMonth(isoDate: string) {
  const shifted = new Date(`${isoDate}T00:00:00.000Z`)
  shifted.setUTCDate(1)
  return toIsoDate(shifted)
}

function endOfIsoMonth(isoDate: string) {
  const shifted = new Date(`${isoDate}T00:00:00.000Z`)
  shifted.setUTCMonth(shifted.getUTCMonth() + 1, 0)
  return toIsoDate(shifted)
}

function shiftIsoDateByMonths(isoDate: string, months: number) {
  const shifted = new Date(`${isoDate}T00:00:00.000Z`)
  shifted.setUTCMonth(shifted.getUTCMonth() + months)
  return toIsoDate(shifted)
}

function specificDayDateRange(message: string): { isoDate: string; label: string } | null {
  const normalized = String(message ?? "").toLowerCase()

  const m1 = normalized.match(RE_MONTH_DAY_YEAR)
  if (m1) {
    const monthKey = String(m1[1] ?? "").replace(/\.$/, "")
    const month = SPECIFIC_DAY_MONTH_MAP[monthKey]
    const day = Number(m1[2])
    const year = Number(m1[3])
    if (month !== undefined && day >= 1 && day <= 31 && Number.isInteger(year)) {
      const isoDate = new Date(Date.UTC(year, month.index, day))
        .toISOString()
        .slice(0, 10)
      return { isoDate, label: `${month.label} ${day}, ${year}` }
    }
  }

  const m2 = normalized.match(RE_DAY_MONTH_YEAR)
  if (m2) {
    const day = Number(m2[1])
    const monthKey = String(m2[2] ?? "").replace(/\.$/, "")
    const month = SPECIFIC_DAY_MONTH_MAP[monthKey]
    const year = Number(m2[3])
    if (month !== undefined && day >= 1 && day <= 31 && Number.isInteger(year)) {
      const isoDate = new Date(Date.UTC(year, month.index, day))
        .toISOString()
        .slice(0, 10)
      return { isoDate, label: `${month.label} ${day}, ${year}` }
    }
  }

  const mIso = normalized.match(RE_ISO_DATE)
  if (mIso) {
    const isoDate = `${mIso[1]}-${mIso[2]}-${mIso[3]}`
    return { isoDate, label: isoDate }
  }

  return null
}

function seasonOrQuarterDateRange(
  message: string
): { from: string; to: string; label: string } | null {
  const normalized = String(message ?? "").toLowerCase()

  const seasonMatch = normalized.match(
    /\b(spring|summer|fall|autumn|winter)\s+(20\d{2})\b/
  )
  if (seasonMatch) {
    const season = seasonMatch[1]
    const year = Number(seasonMatch[2])
    const ranges: Record<string, { from: string; to: string; label: string }> = {
      spring: {
        from: `${year}-03-01`,
        to: `${year}-05-31`,
        label: `Spring ${year}`,
      },
      summer: {
        from: `${year}-06-01`,
        to: `${year}-08-31`,
        label: `Summer ${year}`,
      },
      fall: {
        from: `${year}-09-01`,
        to: `${year}-11-30`,
        label: `Fall ${year}`,
      },
      autumn: {
        from: `${year}-09-01`,
        to: `${year}-11-30`,
        label: `Autumn ${year}`,
      },
      winter: {
        from: `${year - 1}-12-01`,
        to: `${year}-02-28`,
        label: `Winter ${year - 1}-${year}`,
      },
    }
    return ranges[season] ?? null
  }

  const quarterMatch = normalized.match(/\bq([1-4])\s+(20\d{2})\b/)
  if (quarterMatch) {
    const q = Number(quarterMatch[1])
    const year = Number(quarterMatch[2])
    const quarterRanges: Record<number, { from: string; to: string; label: string }> = {
      1: { from: `${year}-01-01`, to: `${year}-03-31`, label: `Q1 ${year}` },
      2: { from: `${year}-04-01`, to: `${year}-06-30`, label: `Q2 ${year}` },
      3: { from: `${year}-07-01`, to: `${year}-09-30`, label: `Q3 ${year}` },
      4: { from: `${year}-10-01`, to: `${year}-12-31`, label: `Q4 ${year}` },
    }
    return quarterRanges[q] ?? null
  }

  return null
}

function monthYearDateRange(message: string) {
  const normalized = String(message ?? "").toLowerCase()
  const match = normalized.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(20\d{2})\b/
  )

  if (!match) {
    return null
  }

  const monthMap: Record<string, { index: number; label: string }> = {
    jan: { index: 0, label: "January" },
    january: { index: 0, label: "January" },
    feb: { index: 1, label: "February" },
    february: { index: 1, label: "February" },
    mar: { index: 2, label: "March" },
    march: { index: 2, label: "March" },
    apr: { index: 3, label: "April" },
    april: { index: 3, label: "April" },
    may: { index: 4, label: "May" },
    jun: { index: 5, label: "June" },
    june: { index: 5, label: "June" },
    jul: { index: 6, label: "July" },
    july: { index: 6, label: "July" },
    aug: { index: 7, label: "August" },
    august: { index: 7, label: "August" },
    sep: { index: 8, label: "September" },
    sept: { index: 8, label: "September" },
    september: { index: 8, label: "September" },
    oct: { index: 9, label: "October" },
    october: { index: 9, label: "October" },
    nov: { index: 10, label: "November" },
    november: { index: 10, label: "November" },
    dec: { index: 11, label: "December" },
    december: { index: 11, label: "December" },
  }
  const monthKey = match[1].replace(/\.$/, "")
  const month = monthMap[monthKey]
  const year = Number(match[2])

  if (!Number.isInteger(year) || month === undefined) {
    return null
  }

  const from = new Date(Date.UTC(year, month.index, 1))
    .toISOString()
    .slice(0, 10)
  const to = new Date(Date.UTC(year, month.index + 1, 0))
    .toISOString()
    .slice(0, 10)

  return {
    from,
    label: `${month.label} ${year}`,
    to,
  }
}

export function monthShortYearDateRange(message: string) {
  const normalized = String(message ?? "").toLowerCase()
  const match = normalized.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{2})\b/
  )

  if (!match) {
    return null
  }

  const token = match[2]

  if (/^\d{4}$/.test(token)) {
    return null
  }

  const year = 2000 + Number(token)

  if (!Number.isInteger(year) || year < 2000 || year > 2099) {
    return null
  }

  return monthYearDateRange(`${match[1]} ${year}`)
}

export function normalizeMonthShortYearQuestion(question: string) {
  return String(question ?? "").replace(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{2})\b/i,
    (_whole, month, yy) => `${month} 20${yy} (full month)`
  )
}

function blackFridayIsoDate(year: number) {
  const date = new Date(Date.UTC(year, 10, 30))

  while (date.getUTCDay() !== 5) {
    date.setUTCDate(date.getUTCDate() - 1)
  }

  return toIsoDate(date)
}

function resolveEventScope(message: string) {
  const normalized = String(message ?? "").trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (![...EVENT_SCOPE_TERMS].some((term) => normalized.includes(term))) {
    return null
  }

  const currentYear = new Date().getUTCFullYear()
  const explicitYearMatch = normalized.match(/\b(20\d{2})\b/)
  const explicitYear = explicitYearMatch ? Number(explicitYearMatch[1]) : null
  const year = explicitYear
    ? explicitYear
    : normalized.includes("last year")
      ? currentYear - 1
      : normalized.includes("this year")
        ? currentYear
        : null

  if (!year) {
    return null
  }

  const blackFriday = blackFridayIsoDate(year)
  const cyberMonday = addUtcDays(blackFriday, 3)
  const bfcmFrom = addUtcDays(blackFriday, -3)
  const fullMonth = monthYearDateRange(`november ${year}`)

  if (normalized.includes("cyber monday")) {
    return {
      from: cyberMonday,
      to: cyberMonday,
      label: `Cyber Monday ${year}`,
      confidence: "high" as const,
      assumptionNote: null,
      source: "explicit" as const,
    }
  }

  if (
    normalized.includes("single day") ||
    normalized.includes("black friday day")
  ) {
    return {
      from: blackFriday,
      to: blackFriday,
      label: `Black Friday day (${blackFriday})`,
      confidence: "high" as const,
      assumptionNote: null,
      source: "explicit" as const,
    }
  }

  if (!fullMonth) {
    return null
  }

  return {
    from: bfcmFrom,
    to: cyberMonday,
    label: `BFCM window ${year} (${bfcmFrom} to ${cyberMonday})`,
    confidence: "medium" as const,
    assumptionNote: `Interpreted "${normalized}" as the BFCM window (${bfcmFrom} to ${cyberMonday}).`,
    source: "inferred" as const,
  }
}

function parseContextOverride(
  baseContext: DashboardRequestContext,
  message: string
): ParsedContextOverride | null {
  const normalized = String(message ?? "").trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (
    normalized.includes("dashboard range") ||
    normalized.includes("current range") ||
    normalized.includes("selected range")
  ) {
    return {
      context: baseContext,
      confidence: "high",
      source: "explicit",
      warning: `Using requested date range: dashboard selection (${baseContext.from} to ${baseContext.to}).`,
      assumptionNote: null,
    }
  }

  const explicitMonth = monthYearDateRange(normalized)

  if (explicitMonth) {
    return {
      context: {
        ...baseContext,
        from: explicitMonth.from,
        to: explicitMonth.to,
      },
      confidence: "high",
      source: "explicit",
      warning: `Using requested date range: ${explicitMonth.label} (${explicitMonth.from} to ${explicitMonth.to}).`,
      assumptionNote: null,
    }
  }

  const inferredMonth = monthShortYearDateRange(normalized)

  if (inferredMonth) {
    return {
      context: {
        ...baseContext,
        from: inferredMonth.from,
        to: inferredMonth.to,
      },
      confidence: "high",
      source: "inferred",
      warning: `Using inferred date range: ${inferredMonth.label} (${inferredMonth.from} to ${inferredMonth.to}).`,
      assumptionNote: `Interpreted "${normalized}" as ${inferredMonth.label}.`,
    }
  }

  const specificDay = specificDayDateRange(normalized)

  if (specificDay) {
    return {
      context: {
        ...baseContext,
        from: specificDay.isoDate,
        to: specificDay.isoDate,
      },
      confidence: "high",
      source: "explicit",
      warning: `Using requested date range: ${specificDay.label} (${specificDay.isoDate}).`,
      assumptionNote: null,
    }
  }

  const seasonOrQuarter = seasonOrQuarterDateRange(normalized)

  if (seasonOrQuarter) {
    return {
      context: {
        ...baseContext,
        from: seasonOrQuarter.from,
        to: seasonOrQuarter.to,
      },
      confidence: "high",
      source: "explicit",
      warning: `Using requested date range: ${seasonOrQuarter.label} (${seasonOrQuarter.from} to ${seasonOrQuarter.to}).`,
      assumptionNote: null,
    }
  }

  const eventScope = resolveEventScope(normalized)

  if (eventScope) {
    return {
      context: {
        ...baseContext,
        from: eventScope.from,
        to: eventScope.to,
      },
      confidence: eventScope.confidence,
      source: eventScope.source,
      warning: `Using inferred date range: ${eventScope.label}.`,
      assumptionNote: eventScope.assumptionNote,
    }
  }

  const today = toIsoDate(new Date())

  if (/\byesterday\b/.test(normalized)) {
    const yesterday = addUtcDays(today, -1)
    return {
      context: {
        ...baseContext,
        from: yesterday,
        to: yesterday,
      },
      confidence: "high",
      source: "explicit",
      warning: `Using requested date range: yesterday (${yesterday}).`,
      assumptionNote: null,
    }
  }

  if (/\btoday\b/.test(normalized)) {
    return {
      context: {
        ...baseContext,
        from: today,
        to: today,
      },
      confidence: "high",
      source: "explicit",
      warning: `Using requested date range: today (${today}).`,
      assumptionNote: null,
    }
  }

  const daysMatch = normalized.match(/\b(?:last|past)\s+(\d+)\s+days?\b/)
  const weeksMatch = normalized.match(/\b(?:last|past)\s+(\d+)\s+weeks?\b/)

  if (daysMatch || weeksMatch) {
    const rawDays = daysMatch
      ? Number(daysMatch[1])
      : Number(weeksMatch![1]) * 7
    const days = Math.min(rawDays, 365)
    const from = addUtcDays(today, -(days - 1))
    return {
      context: {
        ...baseContext,
        from,
        to: today,
      },
      confidence: "high",
      source: "explicit",
      warning: `Using requested date range: last ${days} days (${from} to ${today}).`,
      assumptionNote: null,
    }
  }

  if (/\bthis month\b/.test(normalized)) {
    const from = startOfIsoMonth(today)
    return {
      context: {
        ...baseContext,
        from,
        to: today,
      },
      confidence: "high",
      source: "explicit",
      warning: `Using requested date range: this month (${from} to ${today}).`,
      assumptionNote: null,
    }
  }

  if (/\blast month\b/.test(normalized)) {
    const previousMonthAnchor = shiftIsoDateByMonths(today, -1)
    const from = startOfIsoMonth(previousMonthAnchor)
    const to = endOfIsoMonth(previousMonthAnchor)
    return {
      context: {
        ...baseContext,
        from,
        to,
      },
      confidence: "high",
      source: "explicit",
      warning: `Using requested date range: last month (${from} to ${to}).`,
      assumptionNote: null,
    }
  }

  return null
}

function hasDateScopeHint(message: string) {
  const normalized = String(message ?? "").trim().toLowerCase()

  if (!normalized) {
    return false
  }

  return (
    normalized.includes("dashboard range") ||
    normalized.includes("current range") ||
    normalized.includes("selected range") ||
    /\btoday\b/.test(normalized) ||
    /\byesterday\b/.test(normalized) ||
    /\b(?:last|past)\s+\d+\s+(?:days?|weeks?)\b/.test(normalized) ||
    /\bthis month\b/.test(normalized) ||
    /\blast month\b/.test(normalized) ||
    monthYearDateRange(normalized) !== null ||
    monthShortYearDateRange(normalized) !== null ||
    specificDayDateRange(normalized) !== null ||
    seasonOrQuarterDateRange(normalized) !== null ||
    resolveEventScope(normalized) !== null
  )
}

export function isDateScopeOnlyPrompt(message: string) {
  const normalized = String(message ?? "").trim().toLowerCase()

  if (!normalized) {
    return false
  }

  if (!hasDateScopeHint(normalized)) {
    return false
  }

  const tokens = tokenizeMessage(normalized)

  if (tokens.length === 0) {
    return false
  }

  return tokens.every(
    (token) => DATE_SCOPE_ONLY_TERMS.has(token) || /^\d{1,4}$/.test(token)
  )
}

export function getPendingDateClarification(messages: AgentStorageMessage[]) {
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")

  const question = String(
    lastAssistant?.metadata.dateClarificationQuestion ?? ""
  ).trim()

  return question ? question : null
}

function buildDateClarificationOptions(
  question: string,
  context: DashboardRequestContext
): DateClarificationOption[] {
  const normalized = question.toLowerCase()
  const currentYear = new Date().getUTCFullYear()
  const explicitYear = normalized.match(/\b(20\d{2})\b/)
  const scopedYear = explicitYear
    ? Number(explicitYear[1])
    : normalized.includes("last year")
      ? currentYear - 1
      : normalized.includes("this year")
        ? currentYear
        : null

  if (
    scopedYear &&
    [...EVENT_SCOPE_TERMS].some((term) => normalized.includes(term))
  ) {
    const blackFriday = blackFridayIsoDate(scopedYear)
    const cyberMonday = addUtcDays(blackFriday, 3)
    const bfcmFrom = addUtcDays(blackFriday, -3)
    const november = monthYearDateRange(`november ${scopedYear}`)

    return [
      {
        label: "Black Friday day",
        message: `Use ${blackFriday} to ${blackFriday} for this question: ${question}`,
      },
      {
        label: "BFCM window",
        message: `Use ${bfcmFrom} to ${cyberMonday} for this question: ${question}`,
      },
      {
        label: `Full November ${scopedYear}`,
        message: november
          ? `Use ${november.from} to ${november.to} for this question: ${question}`
          : `Use November ${scopedYear} for this question: ${question}`,
      },
    ]
  }

  return [
    {
      label: "Last 7 days",
      message: `Use the last 7 days for this question: ${question}`,
    },
    {
      label: "Last 30 days",
      message: `Use the last 30 days for this question: ${question}`,
    },
    {
      label: "Last 90 days",
      message: `Use the last 90 days for this question: ${question}`,
    },
    {
      label: "This month",
      message: `Use this month for this question: ${question}`,
    },
    {
      label: "Last month",
      message: `Use last month for this question: ${question}`,
    },
    {
      label: "Custom range",
      message: `Use ${context.from} to ${context.to} for this question: ${question}`,
    },
  ]
}

export function resolveScopeForTurn(input: {
  context: DashboardRequestContext
  question: string
  scopeSignal: string
  turnKind: "direct" | "analysis"
}) {
  if (input.turnKind === "direct") {
    return {
      context: input.context,
      confidence: "high",
      source: "none",
      warning: null,
      assumptionNote: null,
      needsClarification: false,
    } satisfies ScopeResolution
  }

  const override = parseContextOverride(input.context, input.scopeSignal)

  if (override) {
    return {
      context: override.context,
      confidence: override.confidence,
      source: override.source,
      warning: override.warning,
      assumptionNote: override.assumptionNote ?? null,
      needsClarification: false,
    } satisfies ScopeResolution
  }

  if (!isBusinessAnalysisPrompt(input.question)) {
    return {
      context: input.context,
      confidence: "high",
      source: "none",
      warning: null,
      assumptionNote: null,
      needsClarification: false,
    } satisfies ScopeResolution
  }

  return {
    context: input.context,
    confidence: "low",
    source: "none",
    warning: null,
    assumptionNote: null,
    needsClarification: true,
    clarificationQuestion: input.question,
    clarifyingOptions: buildDateClarificationOptions(input.question, input.context),
  } satisfies ScopeResolution
}

export function resolveTurnPlan(
  message: string,
  options?: {
    maxMessageChars?: number
  }
): DirectTurnPlan {
  const normalized = String(message ?? "").trim()
  const maxMessageChars = options?.maxMessageChars ?? AGENT_MAX_MESSAGE_CHARS

  if (!normalized) {
    return {
      kind: "direct",
      warnings: [],
    }
  }

  if (normalized.length > maxMessageChars) {
    throw new Error(
      `That message is too long for one turn. Keep it under ${maxMessageChars} characters or split it into smaller questions.`
    )
  }

  const tokens = tokenizeMessage(normalized)

  if (tokens.length === 0) {
    return {
      kind: "direct",
      warnings: [],
    }
  }

  const tokenSet = new Set(tokens)
  const isGreetingOnly = tokens.every((token) => GREETING_TERMS.has(token))
  const isCourtesyOnly = tokens.every((token) => COURTESY_TERMS.has(token))
  const isHelpPrompt =
    tokenSet.has("help") ||
    normalized.toLowerCase() === "what can you do" ||
    normalized.toLowerCase() === "what do you do"

  if (isGreetingOnly || isCourtesyOnly || isHelpPrompt) {
    return {
      kind: "direct",
      warnings: [],
    }
  }

  if (!isBusinessAnalysisPrompt(normalized) && tokens.length <= 12) {
    return {
      kind: "direct",
      warnings: [],
    }
  }

  return {
    kind: "analysis",
    warnings: [],
  }
}
