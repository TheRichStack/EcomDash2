import "server-only"

import { env } from "@/lib/env"
import {
  AGENT_ALLOWED_OPS,
  AGENT_MAX_COMPLETION_TOKENS,
  AGENT_MAX_DIRECT_COMPLETION_TOKENS,
  AGENT_MAX_MESSAGE_CHARS,
  AGENT_MAX_PRESET_MESSAGE_CHARS,
  AGENT_MAX_PLAN_TOKENS,
} from "@/lib/agent/constants"
import { createAgentBrokerToken } from "@/lib/agent/broker"
import { buildAgentCharts } from "@/lib/agent/charts"
import { buildAgentSystemPrompt } from "@/lib/agent/context"
import { executeAgentRun } from "@/lib/agent/executor"
import { buildUsageSegment, buildUsageSummary } from "@/lib/agent/pricing"
import {
  completeJsonWithProvider,
  completeWithProvider,
  resolveProviderModel,
} from "@/lib/agent/providers"
import { resolveWorkspaceAgentCredential } from "@/lib/agent/settings"
import {
  createAgentArtifact,
  createAgentConversation,
  createAgentMessage,
  createAgentRun,
  finishAgentRun,
  getAgentConversationById,
  getLatestPendingWorkerPlan,
  getAgentWorkspaceUsageTotals,
  listAgentMessages,
  updateAgentConversationSummary,
} from "@/lib/agent/storage"
import { getAgentPreset } from "@/lib/agent/presets"
import type {
  AgentAnomalyCoverage,
  AgentAnomalySignal,
} from "@/lib/agent/anomalies"
import {
  getRelevantAgentTools,
  isBusinessAnalysisPrompt,
  runAgentTools,
} from "@/lib/agent/tools"
import type {
  AgentExecutionMode,
  AgentPresetId,
  AgentRunStatus,
  AgentToolName,
  AgentProviderUsage,
  AgentRunResult,
  AgentUsageSegment,
  AgentUsageSummary,
} from "@/lib/agent/types"
import { compactText } from "@/lib/agent/utils"
import type { DashboardRequestContext } from "@/types/dashboard"

type WorkerPlan = {
  requestedOps?: string[]
  scriptBody?: string
  usage?: AgentProviderUsage
  why?: string
}

type PersistedWorkerPlanArtifact = {
  context?: Partial<
    Pick<DashboardRequestContext, "compare" | "from" | "to" | "workspaceId">
  >
  plan?: WorkerPlan
  question?: string
  requestedOps?: string[]
  scriptBody?: string
  why?: string
}

type PendingWorkerPlan = {
  pendingRunId: string
  context: Pick<DashboardRequestContext, "compare" | "from" | "to" | "workspaceId">
  question: string
  requestedOps: string[]
  scriptBody: string
  why: string | null
}

type DirectTurnPlan = {
  kind: "direct" | "analysis"
  warnings: string[]
}

type DateClarificationOption = {
  label: string
  message: string
}

type ParsedContextOverride = {
  context: DashboardRequestContext
  confidence: "high" | "medium"
  source: "explicit" | "inferred"
  warning: string | null
  assumptionNote?: string | null
}

type ScopeResolution = {
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

function shouldUseWorker(question: string, toolNames: string[]) {
  const normalized = question.toLowerCase()

  if (toolNames.length > 2) {
    return true
  }

  return [
    "diagnose",
    "investigate",
    "root cause",
    "ad hoc",
    "script",
    "why",
  ].some((token) => normalized.includes(token))
}

function normalizeOpValues(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  const seen = new Set<string>()
  const normalized: string[] = []

  for (const entry of input) {
    const op = String(entry ?? "").trim()

    if (!op || seen.has(op)) {
      continue
    }

    seen.add(op)
    normalized.push(op)
  }

  return normalized
}

function normalizeAllowedOps(input: unknown): string[] {
  return normalizeOpValues(input).filter((op): op is (typeof AGENT_ALLOWED_OPS)[number] =>
    (AGENT_ALLOWED_OPS as readonly string[]).includes(op)
  )
}

function hasExactOpSet(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false
  }

  const aSet = new Set(a)
  const bSet = new Set(b)

  if (aSet.size !== bSet.size) {
    return false
  }

  return [...aSet].every((op) => bSet.has(op))
}

function inspectScriptDispatchOps(scriptBody: string) {
  const dispatchCallPattern = /\b(?:broker\.)?dispatchOp\s*\(([^)]*)\)/g
  const literalOpPattern = /^\s*(['"`])([^'"`]+)\1\s*$/
  const requestedOps: string[] = []
  let hasDynamicDispatch = false
  let match: RegExpExecArray | null = null

  while ((match = dispatchCallPattern.exec(scriptBody)) !== null) {
    const argumentExpression = String(match[1] ?? "").trim()
    const literalMatch = argumentExpression.match(literalOpPattern)

    if (!literalMatch) {
      hasDynamicDispatch = true
      continue
    }

    requestedOps.push(String(literalMatch[2] ?? "").trim())
  }

  return {
    hasDynamicDispatch,
    requestedOps: normalizeOpValues(requestedOps),
  }
}

function resolvePendingWorkerPlan(input: {
  payload: Record<string, unknown>
  pendingRunId: string
  workspaceId: string
}) {
  const payload = input.payload as PersistedWorkerPlanArtifact
  const planRecord = asRecord(payload.plan ?? payload)
  const contextRecord = asRecord(payload.context)
  const scriptBody = String(planRecord?.scriptBody ?? "").trim()
  const question = String(payload.question ?? "").trim()
  const requestedOps = normalizeAllowedOps(planRecord?.requestedOps)
  const why = String(planRecord?.why ?? "").trim() || null
  const compare = String(contextRecord?.compare ?? "").trim()
  const from = String(contextRecord?.from ?? "").trim()
  const to = String(contextRecord?.to ?? "").trim()
  const workspaceId = String(contextRecord?.workspaceId ?? "").trim()

  if (!scriptBody) {
    return {
      blockedReason: `Pending worker plan ${input.pendingRunId} is missing a saved script.`,
      plan: null,
    }
  }

  if (!question) {
    return {
      blockedReason: `Pending worker plan ${input.pendingRunId} is missing the saved execution question.`,
      plan: null,
    }
  }

  if (!from || !to || !workspaceId || !compare) {
    return {
      blockedReason: `Pending worker plan ${input.pendingRunId} is missing saved execution context.`,
      plan: null,
    }
  }

  if (
    compare !== "none" &&
    compare !== "previous_period" &&
    compare !== "previous_year"
  ) {
    return {
      blockedReason: `Pending worker plan ${input.pendingRunId} has an invalid compare mode.`,
      plan: null,
    }
  }

  if (workspaceId !== input.workspaceId) {
    return {
      blockedReason:
        "Pending worker plan workspace does not match this conversation workspace.",
      plan: null,
    }
  }

  return {
    blockedReason: null,
    plan: {
      context: {
        compare,
        from,
        to,
        workspaceId,
      },
      pendingRunId: input.pendingRunId,
      question,
      requestedOps,
      scriptBody,
      why,
    } satisfies PendingWorkerPlan,
  }
}

function buildBlockedAssistantReply(reason: string) {
  return `I couldn't execute that request.\n\nBlocked: ${reason}`
}

function tokenizeMessage(message: string) {
  return String(message ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
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

  const from = new Date(Date.UTC(year, month.index, 1)).toISOString().slice(0, 10)
  const to = new Date(Date.UTC(year, month.index + 1, 0)).toISOString().slice(0, 10)

  return {
    from,
    label: `${month.label} ${year}`,
    to,
  }
}

function monthShortYearDateRange(message: string) {
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

function normalizeMonthShortYearQuestion(question: string) {
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

  // Use BFCM window by default for event phrases unless user asks for full month.
  return {
    from: bfcmFrom,
    to: cyberMonday,
    label: `BFCM window ${year} (${bfcmFrom} to ${cyberMonday})`,
    confidence: "medium" as const,
    assumptionNote: `Interpreted "${normalized}" as the BFCM window (${bfcmFrom} to ${cyberMonday}).`,
    source: "inferred" as const,
  }
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

function startOfUtcDayIso(date = new Date()) {
  return toIsoDate(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  )
}

function startOfUtcMonthIso(date = new Date()) {
  return toIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)))
}

async function assertWorkspaceBudgetAvailable(workspaceId: string) {
  const dailyBudget = env.agent.budgetUsdPerDay
  const monthlyBudget = env.agent.budgetUsdPerMonth

  const [dailyUsage, monthlyUsage] = await Promise.all([
    getAgentWorkspaceUsageTotals({
      from: startOfUtcDayIso(),
      workspaceId,
    }),
    getAgentWorkspaceUsageTotals({
      from: startOfUtcMonthIso(),
      workspaceId,
    }),
  ])

  if (dailyBudget > 0 && dailyUsage.estimatedCostUsd >= dailyBudget) {
    throw new Error(
      `Ask AI daily budget reached. Estimated spend today is $${dailyUsage.estimatedCostUsd.toFixed(2)} against a $${dailyBudget.toFixed(2)} cap.`
    )
  }

  if (monthlyBudget > 0 && monthlyUsage.estimatedCostUsd >= monthlyBudget) {
    throw new Error(
      `Ask AI monthly budget reached. Estimated spend this month is $${monthlyUsage.estimatedCostUsd.toFixed(2)} against a $${monthlyBudget.toFixed(2)} cap.`
    )
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

  const trailingMatch = normalized.match(/\blast\s+(7|30|90)\s+days?\b/)

  if (trailingMatch) {
    const days = Number(trailingMatch[1])
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
    /\blast\s+(7|30|90)\s+days?\b/.test(normalized) ||
    /\bthis month\b/.test(normalized) ||
    /\blast month\b/.test(normalized) ||
    monthYearDateRange(normalized) !== null ||
    monthShortYearDateRange(normalized) !== null ||
    resolveEventScope(normalized) !== null
  )
}

function isDateScopeOnlyPrompt(message: string) {
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

function getPendingDateClarification(
  messages: Awaited<ReturnType<typeof listAgentMessages>>
) {
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

function resolveScopeForTurn(input: {
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

function resolveTurnPlan(
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

function serializeConversationHistory(input: {
  messages: Awaited<ReturnType<typeof listAgentMessages>>
  summaryText?: string | null
}
) {
  const recentTurns = input.messages
    .slice(-6)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n")

  return [
    input.summaryText
      ? `Conversation summary:\n${compactText(input.summaryText, 1000)}`
      : "",
    `Recent turns:\n${recentTurns || "(none)"}`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

function buildRollingConversationSummary(input: {
  previousSummary?: string | null
  question: string
  answer: string
  usedTools: string[]
  warnings: string[]
  requestedOps: string[]
}) {
  return compactText(
    [
      input.previousSummary ? `Previous summary: ${input.previousSummary}` : "",
      `Latest user request: ${compactText(input.question, 220)}`,
      input.usedTools.length > 0
        ? `Evidence used: ${input.usedTools.join(", ")}.`
        : "Evidence used: direct language-model reply only.",
      input.requestedOps.length > 0
        ? `Pending ops: ${input.requestedOps.join(", ")}.`
        : "",
      input.warnings.length > 0
        ? `Watchouts: ${input.warnings.join(" ")}`
        : "",
      `Latest agent answer: ${compactText(input.answer, 420)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    1200
  )
}

function resolvePresetContext(input: {
  context: DashboardRequestContext
  presetAnchorDate?: string
  presetId?: AgentPresetId
}) {
  if (!input.presetId) {
    return null
  }

  return getAgentPreset(input.presetId).resolveContext(input.context, {
    anchorDate: input.presetAnchorDate,
  })
}

function resolveToolNames(input: {
  message: string
  presetId?: AgentPresetId
  turnKind: "direct" | "analysis"
}) {
  if (input.turnKind === "direct") {
    return [] as AgentToolName[]
  }

  if (input.presetId) {
    return [...getAgentPreset(input.presetId).toolNames]
  }

  return getRelevantAgentTools(input.message)
}

async function generateWorkerPlan(input: {
  apiKey: string
  businessProfile?: string | null
  model: string
  provider: "openai" | "anthropic"
  question: string
  context: DashboardRequestContext
  toolResults: Awaited<ReturnType<typeof runAgentTools>>
}) {
  const workerPrompt = [
    "Return JSON only.",
    "Write an async JavaScript function body for a constrained analysis worker.",
    "Available helpers inside the script:",
    "- await broker.getDataset(name)",
    "- await broker.querySql(sql)",
    "- await broker.dispatchOp(op)",
    "- helpers.compact(array, limit)",
    "- helpers.sum(array)",
    "The script must return a plain object with facts, analysis, and recommendedActions fields.",
    `Allowed ops: ${AGENT_ALLOWED_OPS.join(", ")}`,
    "Only request an op if it is strictly necessary.",
    "Use approved datasets first and only fall back to SQL when needed.",
    `Question: ${input.question}`,
    `Date context: ${input.context.from}..${input.context.to}`,
    `Existing tool results: ${JSON.stringify(input.toolResults)}`,
    'Output schema: {"scriptBody":"...","requestedOps":["..."],"why":"..."}',
  ].join("\n")

  const { data, raw } = await completeJsonWithProvider<WorkerPlan>({
    apiKey: input.apiKey,
    maxTokens: AGENT_MAX_PLAN_TOKENS,
    model: input.model,
    provider: input.provider,
    systemPrompt: buildAgentSystemPrompt({
      businessProfile: input.businessProfile,
      mode: "worker_plan",
    }),
    userPrompt: workerPrompt,
  })

  return {
    requestedOps: normalizeAllowedOps(data.requestedOps),
    scriptBody: String(data.scriptBody ?? "").trim(),
    usage: raw.usage,
    why: String(data.why ?? "").trim(),
  }
}

function buildAnswerPrompt(input: {
  question: string
  history: string
  toolResults: Awaited<ReturnType<typeof runAgentTools>>
  executionMode: AgentExecutionMode
  workerResult?: Record<string, unknown> | null
  warnings: string[]
  requestedOps: string[]
}) {
  return [
    "Answer the user as a serious ecommerce analyst.",
    "Use concise markdown.",
    "Separate facts from recommendations.",
    "If confidence is limited, say so clearly.",
    "Always include a final `Sources:` line listing the tool labels you used.",
    "If an op still needs confirmation, do not pretend it already ran.",
    `Conversation history:\n${input.history || "(none)"}`,
    `Current question: ${input.question}`,
    `Tool results JSON: ${JSON.stringify(input.toolResults)}`,
    input.workerResult
      ? `Worker result JSON: ${JSON.stringify(input.workerResult)}`
      : "Worker result JSON: null",
    `Execution mode: ${input.executionMode}`,
    `Warnings: ${JSON.stringify(input.warnings)}`,
    `Pending ops: ${JSON.stringify(input.requestedOps)}`,
  ].join("\n\n")
}

function getToolResultByName(
  toolResults: Awaited<ReturnType<typeof runAgentTools>>,
  name: AgentToolName
) {
  return toolResults.find((tool) => tool.name === name) ?? null
}

function buildDeterministicAnomalyReport(input: {
  coverage?: AgentAnomalyCoverage[]
  signals: AgentAnomalySignal[]
  sourceLabel: string
}) {
  const describeLikelyCauses = (signal: AgentAnomalySignal) => {
    switch (signal.id) {
      case "overview_profit":
        return signal.deltaPct !== null && signal.deltaPct >= 0
          ? [
              "Profit improved materially versus the comparison period, but the change still needs to be reconciled against traffic, channel, and attribution evidence.",
              "Confirm freshness first if tracking issues are also present before treating the gain as fully reliable.",
            ]
          : [
              "Profit deterioration is likely being driven by some mix of revenue weakness, cost pressure, product mix, or efficiency deterioration.",
              "Confirm freshness first if tracking issues are also present.",
            ]
      case "traffic_sessions":
        return [
          "Traffic volume changed materially versus the comparison period.",
          "Channel mix, paid delivery, seasonality, or tracking coverage may be contributing.",
        ]
      case "conversion_rate":
        return [
          "Site conversion shifted materially versus the comparison period.",
          "Intent quality, landing-page performance, merchandising, pricing, or checkout friction may have changed.",
        ]
      case "overview_product_concentration":
        return [
          "A single product is carrying a large share of revenue in the selected period.",
          "That concentration raises exposure to stock, demand, and conversion changes on one item.",
        ]
      case "tracking_funnel_trade_mismatch":
        return [
          "Trading totals and funnel metrics are moving in opposite directions strongly enough to suggest tracking or attribution instability.",
          "Treat the apparent conversion improvement as provisional until freshness and attribution are confirmed.",
        ]
      case "tracking_email_mismatch":
        return [
          "Email channel activity is present in funnel data while lifecycle reporting shows no sends or email revenue.",
          "This looks more like source-mapping or attribution inconsistency than a clean channel-performance signal.",
        ]
      default:
        return signal.likelyCauseHints
      }
  }

  const lines: string[] = []
  const critical = input.signals.filter((signal) => signal.severity === "high").slice(0, 5)
  const criticalIds = new Set(critical.map((signal) => signal.id))
  const tracking = input.signals.filter(
    (signal) => signal.kind === "tracking" && !criticalIds.has(signal.id)
  )
  const commercial = input.signals.filter(
    (signal) => signal.kind === "commercial" && !criticalIds.has(signal.id)
  )
  const clearCoverage = (input.coverage ?? []).filter(
    (item) => item.status === "clear"
  )
  const limitedCoverage = (input.coverage ?? []).filter(
    (item) => item.status === "limited"
  )
  const hasTrackingRisk = input.signals.some((signal) => signal.kind === "tracking")
  const staleTrafficSignal = input.signals.find(
    (signal) =>
      signal.id === "freshness_stale_sync" &&
      signal.likelyCauseHints.some((hint) => hint.toLowerCase().includes("traffic"))
  )

  const pushSection = (title: string, items: AgentAnomalySignal[], emptyLine: string) => {
    lines.push(`## ${title}`)

    if (items.length === 0) {
      lines.push(`- ${emptyLine}`)
      lines.push("")
      return
    }

    for (const item of items) {
      lines.push(`- **${item.title}**`)
      lines.push(`  What changed: ${item.summary}`)
      lines.push(
        `  Magnitude: ${
          item.deltaPct !== null
            ? `${item.deltaPct.toFixed(1)}% versus comparison`
            : item.currentValue !== null
              ? `${Number(item.currentValue).toFixed(1)} current flagged value`
              : "Not quantified beyond the supplied signal."
        }`
      )
      lines.push(`  When it started: ${item.timingHint}`)
      lines.push(
        `  Likely causes: ${describeLikelyCauses(item).join("; ") || "Not enough evidence."}`
      )
      lines.push(`  Confidence: ${item.severity === "high" ? "high" : "medium"}`)
      lines.push(`  Issue type: ${item.kind}`)
    }

    lines.push("")
  }

  pushSection(
    "Critical anomalies",
    critical,
    "No critical anomalies were identified from the supplied signals."
  )
  pushSection(
    "Likely tracking/data issues",
    tracking,
    critical.some((signal) => signal.kind === "tracking")
      ? "Tracking issues were identified, but they are already listed under critical anomalies above."
      : "No likely tracking or data issues were identified from the supplied signals."
  )
  pushSection(
    "Commercial anomalies",
    commercial,
    critical.some((signal) => signal.kind === "commercial")
      ? "No additional commercial anomalies were identified beyond the critical anomalies above."
      : "No material commercial anomalies were identified from the supplied signals."
  )

  lines.push("## Checked with no material anomalies")
  if (clearCoverage.length === 0) {
    lines.push("- No categories cleared the anomaly thresholds confidently.")
  } else {
    for (const item of clearCoverage) {
      lines.push(`- **${item.label}**: ${item.note}`)
    }
  }
  lines.push("")

  lines.push("## Coverage caveats")
  if (hasTrackingRisk) {
    lines.push(
      "- Tracking or freshness issues are present. Treat commercial interpretation as provisional until those data issues are resolved."
    )
    if (staleTrafficSignal) {
      lines.push(
        `- Traffic, funnel, and conversion reads for roughly the last ${formatNumber(staleTrafficSignal.currentValue, 1)} hours should be treated as unsafe until the stale sync is resolved.`
      )
    }
  }
  if (limitedCoverage.length === 0) {
    lines.push(
      "- Core anomaly coverage ran across trading, traffic/conversion, paid media, inventory, email, and freshness checks for this scope."
    )
  } else {
    for (const item of limitedCoverage) {
      lines.push(`- **${item.label}**: ${item.note}`)
    }
  }
  lines.push("")

  lines.push("## Pareto impact")
  if (input.signals.length === 0) {
    lines.push("- The supplied signals do not isolate a small set of drivers with confidence.")
  } else {
    const paretoSignals = [
      ...input.signals.filter((signal) => signal.kind === "commercial"),
      ...input.signals.filter((signal) => signal.kind === "tracking"),
    ].slice(0, 3)

    for (const signal of paretoSignals) {
      lines.push(`- ${signal.title}: ${signal.summary}`)
    }

    if (hasTrackingRisk) {
      lines.push(
        "- Data freshness issues limit confidence in how much of the commercial movement is true demand versus stale or incomplete reporting."
      )
    }
  }
  lines.push("")

  lines.push("## Recommended actions")
  if (input.signals.length === 0) {
    lines.push("- No action recommendations were produced from the supplied signals.")
  } else {
    const seenActions = new Set<string>()

    for (const signal of input.signals) {
      let action = ""
      let owner = "operator"
      let urgency = signal.severity === "high" ? "investigate now" : "monitor"
      const rationale = describeLikelyCauses(signal)[0] ?? signal.summary

      if (signal.id === "freshness_failed_jobs" || signal.id === "freshness_stale_sync") {
        action = "Check failed jobs and connector freshness before trusting period comparisons."
        owner = "data / ops"
        urgency = "investigate now"
      } else if (
        signal.id === "tracking_funnel_trade_mismatch" ||
        signal.id === "tracking_email_mismatch"
      ) {
        action = "Reconcile attribution and tracking before acting on the apparent performance change."
        owner = "data / growth"
        urgency = "investigate now"
      } else if (signal.id === "inventory_out_of_stock" || signal.id === "inventory_at_risk") {
        action = "Review replenishment timing and shift demand away from exposed SKUs if needed."
        owner = "inventory / merchandising"
        urgency = signal.severity === "high" ? "action today" : "monitor"
      } else if (signal.category === "paid_media") {
        action = "Review channel and campaign efficiency changes before maintaining or increasing spend."
        owner = "paid media"
      } else if (signal.id === "overview_profit") {
        action =
          signal.deltaPct !== null && signal.deltaPct >= 0
            ? "Reconcile the profit improvement against traffic, attribution, and product-mix evidence before scaling decisions."
            : "Break the profit decline into revenue, spend, and product-mix drivers before making broader trading decisions."
        owner = "operator / finance"
      } else if (signal.id === "traffic_sessions") {
        action = "Check whether the traffic change came from paid delivery, channel mix, or tracking coverage before reacting."
        owner = "operator / growth"
      } else if (signal.id === "conversion_rate") {
        action = input.signals.some((candidate) => candidate.id === "tracking_funnel_trade_mismatch")
          ? "Validate tracking and attribution before treating the conversion shift as a site-performance win."
          : "Audit landing pages, offer strength, and checkout friction to confirm why conversion shifted."
        owner = "site / merchandising"
      } else if (signal.id === "overview_product_concentration") {
        action = "Reduce reliance on the lead product by protecting stock, improving substitutes, and widening demand capture."
        owner = "merchandising / operator"
      } else if (signal.category === "email") {
        action = "Review lifecycle send volume, audience quality, and campaign contribution."
        owner = "crm / retention"
      } else {
        action = "Trace the main commercial driver behind the top-line change before taking broader action."
        owner = "operator"
      }

      if (seenActions.has(action)) {
        continue
      }

      seenActions.add(action)
      lines.push(`- **${action}**`)
      lines.push(`  Owner: ${owner}`)
      lines.push(`  Urgency: ${urgency}`)
      lines.push(`  Rationale: ${rationale}`)
    }
  }
  lines.push("")
  lines.push(`Sources: ${input.sourceLabel}`)

  return lines.join("\n")
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function asRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null
      )
    : []
}

function readStringValue(row: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = String(row[key] ?? "").trim()

    if (value) {
      return value
    }
  }

  return null
}

function readNumberValue(row: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = asNumber(row[key])

    if (value !== null) {
      return value
    }
  }

  return null
}

function hoursSinceIso(value: string | null) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return (Date.now() - parsed.getTime()) / 3_600_000
}

function formatCurrency(value: number | null, currency = "GBP") {
  if (value === null) {
    return "n/a"
  }

  return new Intl.NumberFormat("en-GB", {
    currency,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value)
}

function formatNumber(value: number | null, digits = 0) {
  if (value === null) {
    return "n/a"
  }

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

function formatPercent(value: number | null, digits = 1) {
  if (value === null) {
    return "n/a"
  }

  return `${value.toFixed(digits)}%`
}

function percentChange(currentValue: number | null, comparisonValue: number | null) {
  if (
    currentValue === null ||
    comparisonValue === null ||
    !Number.isFinite(currentValue) ||
    !Number.isFinite(comparisonValue) ||
    comparisonValue === 0
  ) {
    return null
  }

  return ((currentValue - comparisonValue) / Math.abs(comparisonValue)) * 100
}

function approximateRevenueBridge(input: {
  currentAov: number | null
  currentConversionRate: number | null
  currentSessions: number | null
  priorAov: number | null
  priorConversionRate: number | null
  priorSessions: number | null
}) {
  const {
    currentAov,
    currentConversionRate,
    currentSessions,
    priorAov,
    priorConversionRate,
    priorSessions,
  } = input

  if (
    currentAov === null ||
    currentConversionRate === null ||
    currentSessions === null ||
    priorAov === null ||
    priorConversionRate === null ||
    priorSessions === null
  ) {
    return null
  }

  const priorConversionRatio = priorConversionRate / 100
  const currentConversionRatio = currentConversionRate / 100

  return {
    aovEffect:
      currentSessions * currentConversionRatio * (currentAov - priorAov),
    conversionEffect:
      currentSessions * (currentConversionRatio - priorConversionRatio) * priorAov,
    trafficEffect:
      (currentSessions - priorSessions) * priorConversionRatio * priorAov,
  }
}

function formatChange(currentValue: number | null, comparisonValue: number | null, formatter: (value: number | null) => string) {
  const delta = currentValue !== null && comparisonValue !== null
    ? currentValue - comparisonValue
    : null
  const deltaPct = percentChange(currentValue, comparisonValue)

  return {
    absolute: formatter(delta),
    pct: formatPercent(deltaPct),
  }
}

function buildDeterministicMonthlyReport(input: {
  toolResults: Awaited<ReturnType<typeof runAgentTools>>
  warningNote?: string | null
}) {
  const formatInactiveMetric = (value: number | null, isInactive: boolean, digits = 2) => {
    if (isInactive) {
      return "n/a"
    }

    return formatNumber(value, digits)
  }
  const overviewTool = getToolResultByName(input.toolResults, "overview_summary")
  const funnelTool = getToolResultByName(input.toolResults, "traffic_conversion")
  const paidTool = getToolResultByName(input.toolResults, "paid_media_summary")
  const productTool = getToolResultByName(input.toolResults, "product_performance")
  const inventoryTool = getToolResultByName(input.toolResults, "inventory_risk")
  const emailTool = getToolResultByName(input.toolResults, "email_performance")

  const overviewData = (overviewTool?.data ?? {}) as Record<string, unknown>
  const funnelData = (funnelTool?.data ?? {}) as Record<string, unknown>
  const paidData = (paidTool?.data ?? {}) as Record<string, unknown>
  const productData = (productTool?.data ?? {}) as Record<string, unknown>
  const inventoryData = (inventoryTool?.data ?? {}) as Record<string, unknown>
  const emailData = (emailTool?.data ?? {}) as Record<string, unknown>

  const totals = (overviewData.totals ?? {}) as Record<string, unknown>
  const comparisonTotals = (overviewData.comparisonTotals ?? {}) as Record<string, unknown>
  const customerMix = (overviewData.customerMix ?? {}) as Record<string, unknown>
  const comparisonCustomerMix = (overviewData.comparisonCustomerMix ?? {}) as Record<string, unknown>
  const funnelCurrent = ((funnelData.currentRange ?? {}) as Record<string, unknown>).kpis as Record<string, unknown> | undefined
  const funnelComparison = ((funnelData.comparison ?? {}) as Record<string, unknown>).kpis as Record<string, unknown> | undefined
  const funnelCurrentRange = (funnelData.currentRange ?? {}) as Record<string, unknown>
  const funnelBreakdowns = (funnelCurrentRange.breakdowns ?? {}) as Record<string, unknown>
  const channelBreakdown = Array.isArray(funnelBreakdowns.channel)
    ? (funnelBreakdowns.channel as Array<Record<string, unknown>>)
    : []
  const productBreakdown = (funnelCurrentRange.productBreakdown ?? {}) as Record<string, unknown>
  const productRowsByGroup = (productBreakdown.rowsByGroup ?? {}) as Record<string, unknown>
  const productTrafficRows = Array.isArray(productRowsByGroup.product)
    ? (productRowsByGroup.product as Array<Record<string, unknown>>)
    : []
  const paidTotals = (paidData.totals ?? {}) as Record<string, unknown>
  const paidComparison = (paidData.comparison ?? {}) as Record<string, unknown>
  const productKpis = (productData.kpis ?? {}) as Record<string, unknown>
  const productComparisonKpis = (productData.comparisonKpis ?? {}) as Record<string, unknown>
  const inventoryKpis = (inventoryData.kpis ?? {}) as Record<string, unknown>
  const emailKpis = (emailData.kpis ?? {}) as Record<string, unknown>
  const emailComparison = (emailData.comparison ?? {}) as Record<string, unknown>
  const topProducts = Array.isArray(productData.topProducts)
    ? (productData.topProducts as Array<Record<string, unknown>>)
    : []
  const comparisonTopProducts = Array.isArray(productData.comparisonTopProducts)
    ? (productData.comparisonTopProducts as Array<Record<string, unknown>>)
    : []
  const channels = Array.isArray(paidData.channelSummary)
    ? (paidData.channelSummary as Array<Record<string, unknown>>)
    : []
  const currency = String(overviewData.currency ?? productData.currency ?? funnelData.currency ?? "GBP")
  const revenue = asNumber(totals.revenue)
  const priorRevenue = asNumber(comparisonTotals.revenue)
  const orders = asNumber(totals.orders)
  const priorOrders = asNumber(comparisonTotals.orders)
  const aov = asNumber(totals.aov)
  const priorAov = asNumber(comparisonTotals.aov)
  const netProfit = asNumber(totals.netProfit)
  const priorNetProfit = asNumber(comparisonTotals.netProfit)
  const adSpend = asNumber(totals.adSpend)
  const priorAdSpend = asNumber(comparisonTotals.adSpend)
  const mer = asNumber(totals.mer)
  const priorMer = asNumber(comparisonTotals.mer)
  const sessions = asNumber(funnelCurrent?.sessions)
  const priorSessions = asNumber(funnelComparison?.sessions)
  const conversionRate = asNumber(funnelCurrent?.purchaseConversionRate)
  const priorConversionRate = asNumber(funnelComparison?.purchaseConversionRate)
  const emailRevenue = asNumber(emailKpis.revenue)
  const priorEmailRevenue = asNumber(emailComparison.revenue)
  const trackedVariants = asNumber(inventoryKpis.trackedVariants)
  const atRiskVariants = asNumber(inventoryKpis.atRiskVariants)
  const outOfStockVariants = asNumber(inventoryKpis.outOfStockVariants)
  const topProduct = topProducts[0]
  const previousTopProduct = comparisonTopProducts[0]
  const currentTopName = String(topProduct?.product ?? "n/a")
  const currentTopRevenue = asNumber(topProduct?.totalSales)
  const previousTopName = String(previousTopProduct?.product ?? "n/a")
  const previousTopRevenue = asNumber(previousTopProduct?.totalSales)
  const paidSpend = asNumber(paidTotals.spend)
  const paidAttributedRevenue = asNumber(paidTotals.attributedRevenue)
  const paidRoas = asNumber(paidTotals.roas)
  const priorPaidRoas = asNumber(paidComparison.roas)
  const paidCpa = asNumber(paidTotals.cpa)
  const priorPaidCpa = asNumber(paidComparison.cpa)
  const revenuePctChange = percentChange(revenue, priorRevenue)
  const netProfitPctChange = percentChange(netProfit, priorNetProfit)
  const sessionsPctChange = percentChange(sessions, priorSessions)
  const conversionPctChange = percentChange(conversionRate, priorConversionRate)
  const aovPctChange = percentChange(aov, priorAov)
  const emailRevenuePctChange = percentChange(emailRevenue, priorEmailRevenue)
  const paidRoasPctChange = percentChange(paidRoas, priorPaidRoas)
  const newCustomers = asNumber(customerMix.newCustomers)
  const priorNewCustomers = asNumber(comparisonCustomerMix.newCustomers)
  const returningCustomers = asNumber(customerMix.returningCustomers)
  const priorReturningCustomers = asNumber(comparisonCustomerMix.returningCustomers)
  const revenueBridge = approximateRevenueBridge({
    currentAov: aov,
    currentConversionRate: conversionRate,
    currentSessions: sessions,
    priorAov,
    priorConversionRate,
    priorSessions,
  })

  const productDeltaRows = topProducts
    .map((row) => {
      const product = String(row.product ?? "")
      const currentSales = asNumber(row.totalSales) ?? 0
      const comparisonRow = comparisonTopProducts.find(
        (candidate) => String(candidate.product ?? "") === product
      )
      const priorSales = asNumber(comparisonRow?.totalSales) ?? 0
      return {
        change: currentSales - priorSales,
        currentSales,
        priorSales,
        product,
        qtySold: asNumber(row.qtySold) ?? 0,
      }
    })
    .sort((left, right) => Math.abs(right.change) - Math.abs(left.change))

  const topDrivers = productDeltaRows.slice(0, 3)
  const channelRows = channels
    .map((row) => ({
      platform: String(row.platform ?? "Unknown"),
      purchases: asNumber(row.purchases),
      revenue: asNumber(row.revenue),
      spend: asNumber(row.spend),
    }))
    .sort((left, right) => (right.revenue ?? 0) - (left.revenue ?? 0))
  const channelTrafficRows = channelBreakdown
    .map((row) => ({
      label: String(row.label ?? "Unknown"),
      purchase: asNumber(row.purchase),
      purchaseRate: asNumber(row.purchaseRate),
      sessions: asNumber(row.sessions),
    }))
    .sort((left, right) => (right.purchase ?? 0) - (left.purchase ?? 0))
  const poorConversionProducts = productTrafficRows
    .map((row) => ({
      product: String(row.product ?? "Unknown product"),
      purchaseRate: asNumber(row.purchaseRate),
      views: asNumber(row.views),
    }))
    .filter((row) => (row.views ?? 0) >= 10 && (row.purchaseRate ?? 100) < 2)
    .sort((left, right) => (right.views ?? 0) - (left.views ?? 0))
  const trafficTradingMismatch =
    sessionsPctChange !== null &&
    conversionPctChange !== null &&
    revenuePctChange !== null &&
    sessionsPctChange <= -60 &&
    conversionPctChange >= 250 &&
    revenuePctChange >= 40
  const emailChannelMismatch =
    channelTrafficRows.some((row) => row.label.toLowerCase().includes("email") && ((row.sessions ?? 0) > 0 || (row.purchase ?? 0) > 0)) &&
    (asNumber(emailKpis.sends) ?? 0) === 0 &&
    (emailRevenue ?? 0) === 0
  const paidAttributionMismatch =
    (paidSpend ?? 0) > 0 &&
    (paidAttributedRevenue ?? 0) > 0 &&
    channelRows.some((row) => (row.purchases ?? 0) > 0 && ((row.revenue ?? 0) === 0 || row.revenue === null))
  const reliabilityWarnings: string[] = []

  if (trafficTradingMismatch) {
    reliabilityWarnings.push(
      "Traffic/session data and trading output are internally inconsistent: sessions collapsed while orders, revenue, and conversion surged. Treat this month as affected by tracking or attribution instability until reconciled."
    )
  }
  if (emailChannelMismatch) {
    reliabilityWarnings.push(
      "Email channel evidence conflicts across sources: funnel data attributes email activity while lifecycle reporting shows zero sends and zero email revenue."
    )
  }
  if (paidAttributionMismatch) {
    reliabilityWarnings.push(
      "Paid attribution is internally inconsistent: paid channel rows show purchases without reliable revenue while overall paid attributed revenue remains material."
    )
  }

  const executiveTakeaways: string[] = []

  for (const warning of reliabilityWarnings) {
    executiveTakeaways.push(`Data reliability warning: ${warning}`)
  }

  if (revenue !== null && priorRevenue !== null) {
    executiveTakeaways.push(
      `Revenue was ${formatCurrency(revenue, currency)} versus ${formatCurrency(priorRevenue, currency)} last month (${formatPercent(revenuePctChange)}), so the month was decided by quality and conversion more than raw traffic growth.`
    )
  }
  if (netProfit !== null && priorNetProfit !== null) {
    executiveTakeaways.push(
      `Net profit was ${formatCurrency(netProfit, currency)} versus ${formatCurrency(priorNetProfit, currency)} (${formatPercent(netProfitPctChange)}), which means the month improved commercially but not in proportion to the revenue jump.`
    )
  }
  if (sessions !== null && conversionRate !== null && priorSessions !== null && priorConversionRate !== null) {
    executiveTakeaways.push(
      `Traffic was ${formatNumber(sessions)} sessions (${formatPercent(sessionsPctChange)}) and purchase conversion was ${formatPercent(conversionRate, 2)} (${formatPercent(conversionPctChange)}), which points to conversion efficiency doing most of the heavy lifting.`
    )
  }
  if (paidRoas !== null && priorPaidRoas !== null) {
    executiveTakeaways.push(
      `Paid efficiency ran at ${paidRoas.toFixed(2)} ROAS versus ${priorPaidRoas.toFixed(2)} prior month (${formatPercent(paidRoasPctChange)}).`
    )
  }
  if (currentTopRevenue !== null) {
    executiveTakeaways.push(
      `${currentTopName} was the lead product at ${formatCurrency(currentTopRevenue, currency)}${previousTopName !== "n/a" ? ` versus ${formatCurrency(previousTopRevenue, currency)} for ${previousTopName} in the prior month.` : "."}`
    )
  }
  if ((atRiskVariants ?? 0) > 0 || (outOfStockVariants ?? 0) > 0) {
    executiveTakeaways.push(
      `Inventory risk is live: ${formatNumber(outOfStockVariants)} variants are out of stock and ${formatNumber(atRiskVariants)} more are flagged at risk.`
    )
  }
  if (emailRevenue !== null && priorEmailRevenue !== null) {
    executiveTakeaways.push(
      `Email contributed ${formatCurrency(emailRevenue, currency)} versus ${formatCurrency(priorEmailRevenue, currency)} prior month (${formatPercent(emailRevenuePctChange)}), so lifecycle either remained inactive or contributed no incremental lift in this period.`
    )
  }
  if (newCustomers !== null && returningCustomers !== null) {
    executiveTakeaways.push(
      `Customer mix was ${formatNumber(newCustomers)} new vs ${formatNumber(returningCustomers)} returning customers${priorNewCustomers !== null && priorReturningCustomers !== null ? `, versus ${formatNumber(priorNewCustomers)} new and ${formatNumber(priorReturningCustomers)} returning prior month.` : "."}`
    )
  }

  const revenueDecomposition = [
    sessions !== null && priorSessions !== null
      ? `Traffic: ${formatNumber(sessions)} sessions versus ${formatNumber(priorSessions)} (${formatPercent(sessionsPctChange)}).`
      : "Traffic: comparison data unavailable in the current contract.",
    conversionRate !== null && priorConversionRate !== null
      ? `Conversion: ${formatPercent(conversionRate, 2)} versus ${formatPercent(priorConversionRate, 2)} (${formatPercent(conversionPctChange)}).`
      : "Conversion: comparison data unavailable in the current contract.",
    aov !== null && priorAov !== null
      ? `AOV: ${formatCurrency(aov, currency)} versus ${formatCurrency(priorAov, currency)} (${formatPercent(aovPctChange)}).`
      : "AOV: comparison data unavailable in the current contract.",
    emailRevenue !== null && priorEmailRevenue !== null
      ? `Email: ${formatCurrency(emailRevenue, currency)} versus ${formatCurrency(priorEmailRevenue, currency)} (${formatPercent(emailRevenuePctChange)}).`
      : "Email: comparison data unavailable in the current contract.",
    newCustomers !== null && priorNewCustomers !== null
      ? `Customer mix: ${formatNumber(newCustomers)} new customers versus ${formatNumber(priorNewCustomers)} prior month, with ${formatNumber(returningCustomers)} returning versus ${formatNumber(priorReturningCustomers)} prior month.`
      : "Customer mix: comparison data unavailable in the current contract.",
    revenueBridge
      ? `Approximate bridge: traffic contributed ${formatCurrency(revenueBridge.trafficEffect, currency)}, conversion contributed ${formatCurrency(revenueBridge.conversionEffect, currency)}, and AOV contributed ${formatCurrency(revenueBridge.aovEffect, currency)} to the revenue change.`
      : "Approximate bridge: insufficient traffic/conversion evidence for a simple revenue bridge.",
    paidAttributedRevenue !== null && paidSpend !== null
      ? `Paid media: ${formatCurrency(paidAttributedRevenue, currency)} attributed revenue on ${formatCurrency(paidSpend, currency)} spend.`
      : "Paid media: current attributed revenue/spend evidence is limited.",
    (atRiskVariants ?? 0) > 0 || (outOfStockVariants ?? 0) > 0
      ? `Stock availability: ${formatNumber(outOfStockVariants)} variants out of stock and ${formatNumber(atRiskVariants)} at risk could distort product mix and future revenue capture.`
      : "Stock availability: no material stock risk flags were raised in the latest snapshot.",
  ]

  const verdictParts = [
    revenue !== null && priorRevenue !== null
      ? `Revenue ${revenuePctChange !== null && revenuePctChange >= 0 ? "grew" : "fell"} ${formatPercent(revenuePctChange !== null ? Math.abs(revenuePctChange) : null, 1)}`
      : null,
    netProfit !== null && priorNetProfit !== null
      ? `net profit ${netProfitPctChange !== null && netProfitPctChange >= 0 ? "improved" : "deteriorated"} ${formatPercent(netProfitPctChange !== null ? Math.abs(netProfitPctChange) : null, 1)}`
      : null,
    conversionRate !== null && priorConversionRate !== null
      ? `site conversion ${conversionPctChange !== null && conversionPctChange >= 0 ? "improved" : "weakened"} ${formatPercent(conversionPctChange !== null ? Math.abs(conversionPctChange) : null, 1)}`
      : null,
  ].filter(Boolean)

  const lines: string[] = []
  lines.push("## Executive summary")
  for (const takeaway of executiveTakeaways.slice(0, 8)) {
    lines.push(`- ${takeaway}`)
  }
  lines.push("")

  lines.push("## KPI summary table")
  lines.push("| KPI | Last month | Prior month | Absolute change | % change |")
  lines.push("| --- | --- | --- | --- | --- |")
  for (const row of [
    {
      label: "Revenue",
      current: formatCurrency(revenue, currency),
      previous: formatCurrency(priorRevenue, currency),
      ...formatChange(revenue, priorRevenue, (value) => formatCurrency(value, currency)),
    },
    {
      label: "Orders",
      current: formatNumber(orders),
      previous: formatNumber(priorOrders),
      ...formatChange(orders, priorOrders, (value) => formatNumber(value)),
    },
    {
      label: "Sessions",
      current: formatNumber(sessions),
      previous: formatNumber(priorSessions),
      ...formatChange(sessions, priorSessions, (value) => formatNumber(value)),
    },
    {
      label: "Conversion rate",
      current: formatPercent(conversionRate, 2),
      previous: formatPercent(priorConversionRate, 2),
      ...formatChange(conversionRate, priorConversionRate, (value) => formatPercent(value, 2)),
    },
    {
      label: "AOV",
      current: formatCurrency(aov, currency),
      previous: formatCurrency(priorAov, currency),
      ...formatChange(aov, priorAov, (value) => formatCurrency(value, currency)),
    },
    {
      label: "Ad spend",
      current: formatCurrency(adSpend, currency),
      previous: formatCurrency(priorAdSpend, currency),
      ...formatChange(adSpend, priorAdSpend, (value) => formatCurrency(value, currency)),
    },
    {
      label: "MER",
      current: formatInactiveMetric(mer, (adSpend ?? 0) === 0, 2),
      previous: formatInactiveMetric(priorMer, (priorAdSpend ?? 0) === 0, 2),
      ...formatChange(
        mer,
        priorMer,
        (value) =>
          (adSpend ?? 0) === 0 && (priorAdSpend ?? 0) === 0
            ? "n/a"
            : formatNumber(value, 2)
      ),
    },
    {
      label: "Net profit",
      current: formatCurrency(netProfit, currency),
      previous: formatCurrency(priorNetProfit, currency),
      ...formatChange(netProfit, priorNetProfit, (value) => formatCurrency(value, currency)),
    },
    {
      label: "Gross profit",
      current: formatCurrency(asNumber(totals.grossProfit), currency),
      previous: formatCurrency(asNumber(comparisonTotals.grossProfit), currency),
      ...formatChange(
        asNumber(totals.grossProfit),
        asNumber(comparisonTotals.grossProfit),
        (value) => formatCurrency(value, currency)
      ),
    },
    {
      label: "Contribution margin",
      current: formatCurrency(asNumber(totals.contributionMargin), currency),
      previous: formatCurrency(asNumber(comparisonTotals.contributionMargin), currency),
      ...formatChange(
        asNumber(totals.contributionMargin),
        asNumber(comparisonTotals.contributionMargin),
        (value) => formatCurrency(value, currency)
      ),
    },
    {
      label: "Email revenue",
      current: formatCurrency(emailRevenue, currency),
      previous: formatCurrency(priorEmailRevenue, currency),
      ...formatChange(emailRevenue, priorEmailRevenue, (value) => formatCurrency(value, currency)),
    },
  ]) {
    lines.push(`| ${row.label} | ${row.current} | ${row.previous} | ${row.absolute} | ${row.pct} |`)
  }
  lines.push("")

  lines.push("## Revenue decomposition")
  for (const item of revenueDecomposition) {
    lines.push(`- ${item}`)
  }
  lines.push("")

  lines.push("## Pareto analysis")
  if (topDrivers.length === 0) {
    lines.push("- Product-level month-on-month contributors are not available from the current contract.")
  } else {
    for (const driver of topDrivers) {
      lines.push(
        `- ${driver.product}: ${formatCurrency(driver.currentSales, currency)} this month versus ${formatCurrency(driver.priorSales, currency)} prior month (${formatCurrency(driver.change, currency)} change).`
      )
    }
  }
  lines.push("")

  lines.push("## Product performance")
  if (topProducts.length === 0) {
    lines.push("- Product-level evidence is unavailable for this month.")
  } else {
    for (const row of topProducts.slice(0, 5)) {
      lines.push(
        `- ${String(row.product ?? "Unknown product")}: ${formatCurrency(asNumber(row.totalSales), currency)} revenue, ${formatNumber(asNumber(row.qtySold))} units, gross profit ${formatCurrency(asNumber(row.grossProfit), currency)}.`
      )
    }
    if (topDrivers.length > 0) {
      lines.push(
        `- Strongest month-on-month mover: ${topDrivers[0].product} (${formatCurrency(topDrivers[0].change, currency)} change versus prior month).`
      )
    }
    if (poorConversionProducts.length > 0) {
      lines.push(
        `- Poor conversion despite traffic: ${poorConversionProducts
          .slice(0, 2)
          .map((row) => `${row.product} (${formatNumber(row.views)} views, ${formatPercent(row.purchaseRate, 2)} purchase rate)`)
          .join("; ")}.`
      )
    } else {
      lines.push("- Poor-conversion/high-traffic products: none identified from the current funnel evidence.")
    }
    if ((atRiskVariants ?? 0) > 0 || (outOfStockVariants ?? 0) > 0) {
      lines.push(
        `- Availability watch: ${formatNumber(outOfStockVariants)} variants are already out of stock and ${formatNumber(atRiskVariants)} are at risk, so demand concentration could become a stock problem quickly.`
      )
    } else {
      lines.push("- High-demand/low-availability products: none identified from the latest inventory snapshot.")
    }
  }
  lines.push("")

  lines.push("## Marketing and channel performance")
  if (channelRows.length === 0) {
    if ((paidSpend ?? 0) === 0) {
      lines.push("- No paid media spend was recorded in the selected month, so the month was carried by organic, direct, referral, or untracked demand rather than budgeted acquisition.")
    } else {
      lines.push("- No paid channel summary was available for the selected month.")
    }
  } else {
    for (const row of channelRows.slice(0, 4)) {
      const channelRoas =
        row.revenue !== null && row.spend !== null && row.spend > 0
          ? row.revenue / row.spend
          : null
      lines.push(
        `- ${row.platform}: ${formatCurrency(row.revenue, currency)} revenue on ${formatCurrency(row.spend, currency)} spend${channelRoas !== null ? ` (${channelRoas.toFixed(2)} ROAS)` : ""}, ${formatNumber(row.purchases)} purchases.`
      )
    }
    if (paidRoas !== null && priorPaidRoas !== null && paidCpa !== null && priorPaidCpa !== null) {
      lines.push(
        `- Overall paid efficiency: ROAS ${paidRoas.toFixed(2)} vs ${priorPaidRoas.toFixed(2)} (${formatPercent(paidRoasPctChange)}), CPA ${formatCurrency(paidCpa, currency)} vs ${formatCurrency(priorPaidCpa, currency)}.`
      )
    }
  }
  if (channelTrafficRows.length > 0) {
    lines.push(
      `- Traffic source mix from funnel data: ${channelTrafficRows
        .slice(0, 3)
        .map((row) => `${row.label} (${formatNumber(row.sessions)} sessions, ${formatNumber(row.purchase)} purchases, ${formatPercent(row.purchaseRate, 2)} purchase rate)`)
        .join("; ")}.`
    )
  } else {
    lines.push("- Traffic source contribution: channel-level funnel evidence was not available in the current contract.")
  }
  if ((paidSpend ?? 0) === 0) {
    lines.push("- MER/blended ROAS reads as 0.00 here because there was no paid spend in the month, so treat it as inactive rather than poor efficiency.")
  }
  lines.push("")

  lines.push("## Retention and email")
  if (emailRevenue === null && priorEmailRevenue === null) {
    lines.push("- Email revenue evidence is not available in the current contract.")
  } else {
    if ((asNumber(emailKpis.sends) ?? 0) === 0 && (asNumber(emailComparison.sends) ?? 0) === 0) {
      lines.push("- No email sends or attributed email revenue were recorded in either month, so lifecycle is currently not contributing a meaningful trading lever in this contract.")
    } else {
      lines.push(
        `- Email revenue was ${formatCurrency(emailRevenue, currency)} versus ${formatCurrency(priorEmailRevenue, currency)} (${formatPercent(emailRevenuePctChange)}).`
      )
      lines.push(
        `- Open rate was ${formatPercent(asNumber(emailKpis.openRate), 1)} versus ${formatPercent(asNumber(emailComparison.openRate), 1)}, with ${formatNumber(asNumber(emailKpis.sends))} sends in the month.`
      )
    }
    if (newCustomers !== null && returningCustomers !== null) {
      lines.push(
        `- Customer mix context: ${formatNumber(newCustomers)} new vs ${formatNumber(returningCustomers)} returning customers this month${priorNewCustomers !== null && priorReturningCustomers !== null ? `, compared with ${formatNumber(priorNewCustomers)} new and ${formatNumber(priorReturningCustomers)} returning last month.` : "."}`
      )
      if ((returningCustomers ?? 0) === 0) {
        lines.push("- Commercial read: the month was almost entirely acquisition-led, so retention quality and repeatability are still unproven.")
      }
    }
  }
  lines.push("")

  lines.push("## Risks")
  const risks: string[] = []
  risks.push(...reliabilityWarnings)
  if ((outOfStockVariants ?? 0) > 0 || (atRiskVariants ?? 0) > 0) {
    risks.push(
      `Inventory exposure: ${formatNumber(outOfStockVariants)} variants out of stock and ${formatNumber(atRiskVariants)} at risk out of ${formatNumber(trackedVariants)} tracked variants.`
    )
  }
  if (currentTopRevenue !== null && revenue !== null && revenue > 0) {
    const concentrationPct = (currentTopRevenue / revenue) * 100
    if (concentrationPct >= 40) {
      risks.push(
        `Product concentration: ${currentTopName} represents ${formatPercent(concentrationPct, 1)} of tracked product revenue in the current top-product set.`
      )
    }
  }
  if (paidRoas !== null && priorPaidRoas !== null && paidRoasPctChange !== null && paidRoasPctChange < 0) {
    risks.push(
      `Paid efficiency deterioration: ROAS weakened ${formatPercent(Math.abs(paidRoasPctChange), 1)} month on month.`
    )
  }
  if (input.warningNote) {
    risks.push(input.warningNote)
  }
  if ((orders ?? 0) <= 10) {
    risks.push("Small sample risk: the month is still being interpreted from very low absolute order volume, so repeatability is not yet proven.")
  }
  if ((asNumber(emailKpis.sends) ?? 0) === 0) {
    risks.push("Lifecycle gap: no active email contribution means repeat demand and retention are currently under-supported.")
  }
  if ((paidSpend ?? 0) === 0) {
    risks.push("Acquisition concentration risk: there was no active paid acquisition engine in the month, so growth may be harder to repeat intentionally.")
  }
  if (risks.length === 0) {
    risks.push("No additional material risks were identified beyond the KPI movements already listed.")
  }
  for (const risk of risks) {
    lines.push(`- ${risk}`)
  }
  lines.push("")

  lines.push("## Recommended actions")
  lines.push(`- **Protect the main revenue driver now.** Rationale: ${currentTopName} drove ${formatCurrency(currentTopRevenue, currency)} this month, so stock cover, PDP quality, and substitute merchandising on that product should be checked before scaling anything else.`)
  lines.push(`  Expected impact: defend the existing revenue base and reduce concentration risk.`)
  lines.push(`- **Treat conversion as the primary growth lever to preserve.** Rationale: traffic moved only ${formatPercent(sessionsPctChange)} while conversion moved ${formatPercent(conversionPctChange)}, which means the month was won on efficiency rather than reach.`)
  lines.push(`  Expected impact: protect the strongest driver of the month's uplift before traffic is scaled.`)
  lines.push(`- **Recover margin before celebrating top-line growth.** Rationale: revenue grew ${formatPercent(revenuePctChange)} but net profit only improved to ${formatCurrency(netProfit, currency)}, so pricing, discounts, product mix, and cost pressure need review.`)
  lines.push(`  Expected impact: improve profit per order and avoid scaling low-quality revenue.`)
  lines.push(`- **Do not add paid budget blindly.** Rationale: there was ${formatCurrency(paidSpend, currency)} in paid spend and ${paidRoas !== null ? paidRoas.toFixed(2) : "n/a"} ROAS in the current month, so demand appears to have grown without an active paid acquisition engine.`)
  lines.push(`  Expected impact: avoid wasting budget before the acquisition engine and attribution are clear.`)
  lines.push(`- **Stand up lifecycle support before the next month.** Rationale: email revenue was ${formatCurrency(emailRevenue, currency)} with ${formatNumber(asNumber(emailKpis.sends))} sends, so repeat demand is currently under-supported.`)
  lines.push(`  Expected impact: improve repeat purchase capture and reduce reliance on one-off acquisition.`)
  lines.push("")

  lines.push("## One-paragraph operator verdict")
  lines.push(
    `${verdictParts.length > 0 ? verdictParts.join(", ") : "The month moved in a mixed way"}. ${
      reliabilityWarnings.length > 0
        ? `Confidence is reduced because ${reliabilityWarnings[0].charAt(0).toLowerCase()}${reliabilityWarnings[0].slice(1)} `
        : ""
    }This was a better month than the one before on top-line and conversion, but it is still a fragile result because profit remained small in absolute terms, demand was overwhelmingly concentrated in one product, and there was no active paid or lifecycle engine supporting repeatability. What matters most next is proving that this uplift can sustain beyond a small base while protecting margin and product concentration risk.`
  )
  lines.push("")
  lines.push("Sources: Overview summary, Traffic and conversion, Paid media performance, Product performance, Inventory risk, Email performance")

  return lines.join("\n")
}

function buildDeterministicInventoryReport(input: {
  toolResults: Awaited<ReturnType<typeof runAgentTools>>
  warningNote?: string | null
}) {
  const inventoryTool = getToolResultByName(input.toolResults, "inventory_risk")
  const productTool = getToolResultByName(input.toolResults, "product_performance")
  const inventoryData = (inventoryTool?.data ?? {}) as Record<string, unknown>
  const productData = (productTool?.data ?? {}) as Record<string, unknown>
  const inventoryKpis = asRecord(inventoryData.kpis) ?? {}
  const productKpis = asRecord(productData.kpis) ?? {}
  const rows = asRecordArray(inventoryData.rows)
  const topProducts = asRecordArray(productData.topProducts)
  const comparisonTopProducts = asRecordArray(productData.comparisonTopProducts)
  const currency = String(productData.currency ?? "GBP")
  const trackedVariants = asNumber(inventoryKpis.trackedVariants) ?? 0
  const atRiskVariants = asNumber(inventoryKpis.atRiskVariants) ?? 0
  const outOfStockVariants = asNumber(inventoryKpis.outOfStockVariants) ?? 0
  const latestSnapshotDate = readStringValue(inventoryData, ["latestSnapshotDate"])
  const totalSales = asNumber(productKpis.totalSales)
  const totalUnits = asNumber(productKpis.unitsSold)
  const topProduct = topProducts[0] ?? null
  const topProductName = topProduct
    ? readStringValue(topProduct, ["product"]) ?? "Top product"
    : null
  const topProductRevenue = topProduct
    ? readNumberValue(topProduct, ["totalSales"])
    : null
  const topProductUnits = topProduct
    ? readNumberValue(topProduct, ["qtySold", "unitsSold"])
    : null
  const topProductShare =
    topProductRevenue !== null && totalSales !== null && totalSales > 0
      ? (topProductRevenue / totalSales) * 100
      : null

  const inventoryBySkuOrProduct = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const sku = (readStringValue(row, ["sku"]) ?? "").toLowerCase()
    const product = (readStringValue(row, ["product"]) ?? "").toLowerCase()
    if (sku) {
      inventoryBySkuOrProduct.set(`sku:${sku}`, row)
    }
    if (product) {
      inventoryBySkuOrProduct.set(`product:${product}`, row)
    }
  }

  const criticalProducts = topProducts.slice(0, 5).map((row) => {
    const sku = readStringValue(row, ["sku"]) ?? ""
    const product = readStringValue(row, ["product"]) ?? "Unknown product"
    const inventoryRow =
      inventoryBySkuOrProduct.get(`sku:${sku.toLowerCase()}`) ??
      inventoryBySkuOrProduct.get(`product:${product.toLowerCase()}`) ??
      null
    const stockStatus = inventoryRow
      ? readStringValue(inventoryRow, ["status"]) ?? "unknown"
      : trackedVariants === 0
        ? "unknown"
        : "healthy / not flagged"
    const available = inventoryRow
      ? readNumberValue(inventoryRow, ["available"])
      : null
    const inventoryVelocity = asRecord(asRecord(inventoryRow)?.velocity)
    const velocity7Row = asRecord(inventoryVelocity?.["7"])
    const velocity30Row = asRecord(inventoryVelocity?.["30"])
    const velocity7 =
      readNumberValue(row, ["salesVelocity7d"]) ??
      readNumberValue(velocity7Row ?? {}, ["ratePerDay"])
    const velocity30 =
      readNumberValue(row, ["salesVelocity30d"]) ??
      readNumberValue(velocity30Row ?? {}, ["ratePerDay"])
    const daysCover = readNumberValue(
      velocity30Row ?? {},
      ["daysLeft"]
    )
    const recentRevenue = readNumberValue(row, ["totalSales"])
    const recentUnits = readNumberValue(row, ["qtySold", "unitsSold"])

    let action = "Monitor"

    if (stockStatus === "out_of_stock") {
      action = "Reorder or divert demand immediately"
    } else if (stockStatus === "at_risk") {
      action = "Protect stock cover and reduce avoidable demand pressure"
    } else if (trackedVariants === 0 && (recentRevenue ?? 0) > 0) {
      action = "Manual stock check now"
    }

    return {
      action,
      available,
      daysCover,
      product,
      recentRevenue,
      recentUnits,
      stockStatus,
      velocity30,
      velocity7,
    }
  })

  const outOfStockRows = rows.filter(
    (row) => readStringValue(row, ["status"]) === "out_of_stock"
  )
  const atRiskRows = rows.filter((row) => readStringValue(row, ["status"]) === "at_risk")

  const priorLeadProduct = comparisonTopProducts[0]
  const priorLeadName = priorLeadProduct
    ? readStringValue(priorLeadProduct, ["product"])
    : null
  const priorLeadRevenue = priorLeadProduct
    ? readNumberValue(priorLeadProduct, ["totalSales"])
    : null

  const lines: string[] = []
  lines.push("## Inventory risk summary")
  if (trackedVariants === 0) {
    lines.push(
      `- The warehouse currently has **no tracked inventory variants** for this scope, so true stock-cover and stockout risk cannot be quantified from live stock data.`
    )
    if (topProductName && topProductRevenue !== null) {
      lines.push(
        `- This blind spot matters commercially because **${topProductName}** contributed ${formatCurrency(topProductRevenue, currency)}${topProductShare !== null ? ` (${formatPercent(topProductShare, 1)} of tracked product revenue)` : ""} in the selected period.`
      )
    }
  } else {
    lines.push(
      `- Inventory tracking is live for ${formatNumber(trackedVariants)} variants, with ${formatNumber(outOfStockVariants)} already out of stock and ${formatNumber(atRiskVariants)} more at risk.`
    )
  }
  if (latestSnapshotDate) {
    lines.push(`- Latest inventory snapshot available: ${latestSnapshotDate}.`)
  } else {
    lines.push("- No inventory snapshot was available inside the selected window.")
  }
  if (totalUnits !== null && totalSales !== null) {
    lines.push(
      `- Product demand in the window was ${formatNumber(totalUnits)} units and ${formatCurrency(totalSales, currency)} of tracked product sales, so inventory decisions should be anchored to recent demand rather than catalog completeness.`
    )
  }
  if (priorLeadName && topProductName && priorLeadRevenue !== null && topProductRevenue !== null) {
    lines.push(
      `- Lead-product demand stayed concentrated: ${topProductName} generated ${formatCurrency(topProductRevenue, currency)} this period versus ${formatCurrency(priorLeadRevenue, currency)} for ${priorLeadName} in the comparison period.`
    )
  }
  lines.push("")

  lines.push("## Critical products")
  lines.push("| Product | Recent revenue | Units sold | 7d velocity | 30d velocity | Stock status | Recommended action |")
  lines.push("| --- | --- | --- | --- | --- | --- | --- |")
  if (criticalProducts.length === 0) {
    lines.push("| No product demand rows available | n/a | n/a | n/a | n/a | n/a | Investigate product contract |")
  } else {
    for (const row of criticalProducts) {
      lines.push(
        `| ${row.product} | ${formatCurrency(row.recentRevenue, currency)} | ${formatNumber(row.recentUnits)} | ${formatNumber(row.velocity7, 2)} | ${formatNumber(row.velocity30, 2)} | ${row.stockStatus} | ${row.action} |`
      )
    }
  }
  lines.push("")

  lines.push("## Out-of-stock impact")
  if (outOfStockRows.length === 0) {
    lines.push(
      trackedVariants === 0
        ? "- No tracked out-of-stock rows were available, so current out-of-stock impact cannot be quantified from the warehouse."
        : "- No currently out-of-stock tracked variants were flagged in the latest snapshot."
    )
  } else {
    for (const row of outOfStockRows.slice(0, 5)) {
      const product = readStringValue(row, ["product"]) ?? "Unknown product"
      const matchedProduct = topProducts.find(
        (candidate) =>
          (readStringValue(candidate, ["product"]) ?? "").toLowerCase() ===
          product.toLowerCase()
      )
      lines.push(
        `- ${product}: currently out of stock. Recent revenue contribution ${formatCurrency(readNumberValue(matchedProduct ?? {}, ["totalSales"]), currency)}${readNumberValue(matchedProduct ?? {}, ["qtySold"]) !== null ? ` and ${formatNumber(readNumberValue(matchedProduct ?? {}, ["qtySold"]))} units sold` : ""}.`
      )
    }
  }
  lines.push("")

  lines.push("## Low-stock watchlist")
  if (atRiskRows.length === 0) {
    lines.push(
      trackedVariants === 0
        ? "- Low-stock watchlist unavailable because no tracked inventory rows were mapped into the current contract."
        : "- No tracked variants crossed the at-risk stock threshold in the latest snapshot."
    )
  } else {
    for (const row of atRiskRows.slice(0, 5)) {
      const velocity30 = readNumberValue(
        asRecord(asRecord(row.velocity)?.["30"]) ?? {},
        ["ratePerDay"]
      )
      const daysLeft = readNumberValue(
        asRecord(asRecord(row.velocity)?.["30"]) ?? {},
        ["daysLeft"]
      )
      lines.push(
        `- ${readStringValue(row, ["product"]) ?? "Unknown product"}: ${formatNumber(readNumberValue(row, ["available"]))} units available, ${formatNumber(velocity30, 2)} units/day 30-day velocity, about ${formatNumber(daysLeft, 1)} days of cover.`
      )
    }
  }
  lines.push("")

  lines.push("## Slow stock")
  if (trackedVariants === 0) {
    lines.push("- Slow-stock analysis is not available until tracked inventory rows are mapped into the warehouse contract.")
  } else {
    lines.push("- Slow-stock is not confidently visible in the current inventory contract because only flagged inventory rows are loaded into this runbook.")
  }
  lines.push("")

  lines.push("## Recommended actions")
  const actions: string[] = []
  if (trackedVariants === 0) {
    actions.push(
      "Restore inventory tracking first. Map tracked Shopify inventory rows into the warehouse so stock cover and missed-revenue estimates are not being made blind."
    )
    if (topProductName) {
      actions.push(
        `Manually verify stock cover on ${topProductName} now. It is carrying the business, so even a short stockout would have an outsized revenue impact.`
      )
    }
    actions.push(
      "Do not increase demand on hero SKUs until you confirm live stock. Protect paid spend and merchandising placements if stock is uncertain."
    )
  } else {
    if (outOfStockRows.length > 0) {
      actions.push("Reorder or expedite already out-of-stock variants immediately, or divert demand to substitutes.")
    }
    if (atRiskRows.length > 0) {
      actions.push("Reduce avoidable demand pressure on at-risk variants until replenishment is secure.")
    }
    if (topProductShare !== null && topProductShare >= 60) {
      actions.push("Protect the lead SKU with backup merchandising and substitute pathways because demand is too concentrated.")
    }
  }
  if (actions.length === 0) {
    actions.push("No immediate inventory action was forced by the current contract, but keep monitoring stock against recent sales velocity.")
  }
  for (const action of actions.slice(0, 5)) {
    lines.push(`- ${action}`)
  }
  if (input.warningNote) {
    lines.push("")
    lines.push("## Confidence / data caveats")
    lines.push(`- ${input.warningNote}`)
  }
  lines.push("")
  lines.push("Sources: Inventory risk, Product performance")

  return lines.join("\n")
}

function buildDeterministicPaidMediaReport(input: {
  toolResults: Awaited<ReturnType<typeof runAgentTools>>
  warningNote?: string | null
}) {
  const paidTool = getToolResultByName(input.toolResults, "paid_media_summary")
  const overviewTool = getToolResultByName(input.toolResults, "overview_summary")
  const funnelTool = getToolResultByName(input.toolResults, "traffic_conversion")
  const freshnessTool = getToolResultByName(input.toolResults, "data_freshness")
  const paidData = (paidTool?.data ?? {}) as Record<string, unknown>
  const overviewData = (overviewTool?.data ?? {}) as Record<string, unknown>
  const funnelData = (funnelTool?.data ?? {}) as Record<string, unknown>
  const freshnessData = (freshnessTool?.data ?? {}) as Record<string, unknown>
  const totals = asRecord(paidData.totals) ?? {}
  const comparison = asRecord(paidData.comparison) ?? {}
  const overviewTotals = asRecord(overviewData.totals) ?? {}
  const overviewComparison = asRecord(overviewData.comparisonTotals) ?? {}
  const funnelCurrent = asRecord(asRecord(funnelData.currentRange)?.kpis) ?? {}
  const funnelComparison = asRecord(asRecord(funnelData.comparison)?.kpis) ?? {}
  const channelRows = asRecordArray(paidData.channelSummary)
  const campaignRows = asRecordArray(paidData.topCampaigns)
  const syncState = asRecordArray(freshnessData.syncState)
  const recentJobs = asRecordArray(freshnessData.recentJobs)
  const currency = String(overviewData.currency ?? "GBP")
  const spend = asNumber(totals.spend)
  const priorSpend = asNumber(comparison.spend)
  const attributedRevenue = asNumber(totals.attributedRevenue)
  const priorAttributedRevenue = asNumber(comparison.attributedRevenue)
  const roas = asNumber(totals.roas)
  const priorRoas = asNumber(comparison.roas)
  const cpa = asNumber(totals.cpa)
  const priorCpa = asNumber(comparison.cpa)
  const impressions = asNumber(totals.impressions)
  const priorImpressions = asNumber(comparison.impressions)
  const clicks = asNumber(totals.clicks)
  const priorClicks = asNumber(comparison.clicks)
  const cpm = asNumber(totals.cpm)
  const priorCpm = asNumber(comparison.cpm)
  const ctr = asNumber(totals.ctr)
  const priorCtr = asNumber(comparison.ctr)
  const purchases = asNumber(totals.purchases)
  const priorPurchases = asNumber(comparison.purchases)
  const mer = asNumber(overviewTotals.mer)
  const priorMer = asNumber(overviewComparison.mer)
  const shopifyRevenue = asNumber(overviewTotals.revenue)
  const priorShopifyRevenue = asNumber(overviewComparison.revenue)
  const sessions = asNumber(funnelCurrent.sessions)
  const priorSessions = asNumber(funnelComparison.sessions)
  const conversionRate = asNumber(funnelCurrent.purchaseConversionRate)
  const priorConversionRate = asNumber(funnelComparison.purchaseConversionRate)
  const failedJobs = recentJobs.filter(
    (job) => String(job.status ?? "").toLowerCase() === "failed"
  )
  const ga4CursorState = syncState.find(
    (row) =>
      String(row.sourceKey ?? "").toLowerCase() === "connector:ga4" &&
      String(row.stateKey ?? "").toLowerCase() === "cursor"
  )
  const ga4HoursStale = hoursSinceIso(
    readStringValue(ga4CursorState ?? {}, ["updatedAt"])
  )
  const trafficTradingMismatch =
    percentChange(sessions, priorSessions) !== null &&
    percentChange(conversionRate, priorConversionRate) !== null &&
    percentChange(shopifyRevenue, priorShopifyRevenue) !== null &&
    Number(percentChange(sessions, priorSessions)) <= -60 &&
    Number(percentChange(conversionRate, priorConversionRate)) >= 250 &&
    Number(percentChange(shopifyRevenue, priorShopifyRevenue)) >= 40
  const reliabilityWarnings: string[] = []

  if (trafficTradingMismatch) {
    reliabilityWarnings.push(
      "Traffic and onsite conversion data are internally inconsistent with paid and order performance, so attribution quality should be checked before scaling budgets."
    )
  }
  if (ga4HoursStale !== null && ga4HoursStale >= 48) {
    reliabilityWarnings.push(
      `GA4 freshness is stale by roughly ${formatNumber(ga4HoursStale, 1)} hours, which weakens traffic and funnel interpretation.`
    )
  }
  if (failedJobs.length > 0) {
    reliabilityWarnings.push(
      `${formatNumber(failedJobs.length)} recent jobs failed, so contract refresh and attribution reads may be incomplete.`
    )
  }

  const spendPct = percentChange(spend, priorSpend)
  const roasPct = percentChange(roas, priorRoas)
  const cpaPct = percentChange(cpa, priorCpa)
  const merPct = percentChange(mer, priorMer)
  const ctrPct = percentChange(ctr, priorCtr)
  const cpmPct = percentChange(cpm, priorCpm)
  const attributedRevenuePct = percentChange(attributedRevenue, priorAttributedRevenue)
  const verdict =
    roasPct !== null && cpaPct !== null && roasPct > 0 && cpaPct < 0
      ? "Paid media improved"
      : roasPct !== null && cpaPct !== null && roasPct < 0 && cpaPct > 0
        ? "Paid media deteriorated"
        : "Paid media was mixed"

  const scalingCandidates = campaignRows
    .map((row) => ({
      cpa: readNumberValue(row, ["cpa"]),
      ctr: readNumberValue(row, ["ctr"]),
      name: readStringValue(row, ["campaignName"]) ?? "Unknown campaign",
      purchases: readNumberValue(row, ["purchases"]) ?? 0,
      roas: readNumberValue(row, ["roas"]),
      spend: readNumberValue(row, ["spend"]) ?? 0,
    }))
    .filter((row) => row.spend > 25 && row.purchases >= 2 && (row.roas ?? 0) >= (roas ?? 0))
    .sort((left, right) => (right.roas ?? 0) - (left.roas ?? 0))
  const inefficientCampaigns = campaignRows
    .map((row) => ({
      cpa: readNumberValue(row, ["cpa"]),
      clicks: readNumberValue(row, ["clicks"]) ?? 0,
      name: readStringValue(row, ["campaignName"]) ?? "Unknown campaign",
      purchases: readNumberValue(row, ["purchases"]) ?? 0,
      roas: readNumberValue(row, ["roas"]),
      spend: readNumberValue(row, ["spend"]) ?? 0,
    }))
    .filter(
      (row) =>
        row.spend >= 20 &&
        (row.purchases === 0 || (row.roas ?? Number.POSITIVE_INFINITY) < 1.5)
    )
    .sort((left, right) => right.spend - left.spend)
  const trafficButWeakConversion = campaignRows
    .map((row) => ({
      clicks: readNumberValue(row, ["clicks"]) ?? 0,
      name: readStringValue(row, ["campaignName"]) ?? "Unknown campaign",
      purchases: readNumberValue(row, ["purchases"]) ?? 0,
      spend: readNumberValue(row, ["spend"]) ?? 0,
    }))
    .filter((row) => row.clicks >= 50 && row.purchases === 0 && row.spend >= 20)
    .sort((left, right) => right.clicks - left.clicks)
  const weakCtrCampaigns = campaignRows
    .map((row) => ({
      ctr: readNumberValue(row, ["ctr"]),
      cpm: readNumberValue(row, ["cpm"]),
      name: readStringValue(row, ["campaignName"]) ?? "Unknown campaign",
    }))
    .filter(
      (row) =>
        (ctr !== null && row.ctr !== null && row.ctr < ctr * 0.7) ||
        (cpm !== null && row.cpm !== null && row.cpm > cpm * 1.25)
    )

  const lines: string[] = []
  lines.push("## Paid media verdict")
  lines.push(
    `- **${verdict}**: spend ${formatPercent(spendPct)}, attributed revenue ${formatPercent(attributedRevenuePct)}, ROAS ${formatPercent(roasPct)}, CPA ${formatPercent(cpaPct)}, and MER ${formatPercent(merPct)} versus the comparison period.`
  )
  if (reliabilityWarnings.length > 0) {
    lines.push(`- Confidence is limited: ${reliabilityWarnings.join(" ")}`)
  }
  lines.push("")

  lines.push("## KPI driver tree")
  for (const item of [
    `Spend: ${formatCurrency(spend, currency)} versus ${formatCurrency(priorSpend, currency)} (${formatPercent(spendPct)}).`,
    `Impressions: ${formatNumber(impressions)} versus ${formatNumber(priorImpressions)}.`,
    `CTR: ${formatNumber(ctr, 2)} versus ${formatNumber(priorCtr, 2)} (${formatPercent(ctrPct)}).`,
    `CPM: ${formatCurrency(cpm, currency)} versus ${formatCurrency(priorCpm, currency)} (${formatPercent(cpmPct)}).`,
    `Clicks: ${formatNumber(clicks)} versus ${formatNumber(priorClicks)}.`,
    `Site conversion: ${formatPercent(conversionRate, 2)} versus ${formatPercent(priorConversionRate, 2)} from the funnel slice.`,
    `Purchases: ${formatNumber(purchases)} versus ${formatNumber(priorPurchases)}.`,
    `CPA: ${formatCurrency(cpa, currency)} versus ${formatCurrency(priorCpa, currency)} (${formatPercent(cpaPct)}).`,
    `Tracked revenue / ROAS: ${formatCurrency(attributedRevenue, currency)} on ${formatCurrency(spend, currency)} spend (${formatNumber(roas, 2)} ROAS) versus ${formatCurrency(priorAttributedRevenue, currency)} on ${formatCurrency(priorSpend, currency)} (${formatNumber(priorRoas, 2)} ROAS).`,
    `Blended business impact: MER ${formatNumber(mer, 2)} versus ${formatNumber(priorMer, 2)} while total shop revenue moved from ${formatCurrency(priorShopifyRevenue, currency)} to ${formatCurrency(shopifyRevenue, currency)}.`,
  ]) {
    lines.push(`- ${item}`)
  }
  lines.push("")

  lines.push("## Platform summary")
  lines.push("| Platform | Spend | Attributed revenue | ROAS | CPA | Purchases | Commercial comment |")
  lines.push("| --- | --- | --- | --- | --- | --- | --- |")
  if (channelRows.length === 0) {
    lines.push("| No paid platform rows available | n/a | n/a | n/a | n/a | n/a | Investigate paid contract |")
  } else {
    for (const row of channelRows.slice(0, 5)) {
      const platform = readStringValue(row, ["platform", "channel"]) ?? "Unknown"
      const platformSpend = readNumberValue(row, ["spend"])
      const platformRevenue = readNumberValue(row, ["attributedRevenue", "revenue"])
      const platformRoas = readNumberValue(row, ["roas"])
      const platformCpa = readNumberValue(row, ["cpa"])
      const platformPurchases = readNumberValue(row, ["purchases"])
      const comment =
        platformRoas !== null && roas !== null && platformRoas > roas
          ? "Scaling candidate if attribution is trusted"
          : platformRoas !== null && platformRoas < 1.5
            ? "Needs fixing or cutting"
            : "Monitor with attribution caveats"
      lines.push(
        `| ${platform} | ${formatCurrency(platformSpend, currency)} | ${formatCurrency(platformRevenue, currency)} | ${formatNumber(platformRoas, 2)} | ${formatCurrency(platformCpa, currency)} | ${formatNumber(platformPurchases)} | ${comment} |`
      )
    }
  }
  lines.push("")

  lines.push("## Campaign analysis")
  if (scalingCandidates.length === 0 && inefficientCampaigns.length === 0 && trafficButWeakConversion.length === 0) {
    lines.push("- Campaign-level evidence did not isolate strong scaling or cut decisions confidently.")
  } else {
    if (scalingCandidates.length > 0) {
      lines.push(
        `- Top scaling candidates: ${scalingCandidates
          .slice(0, 3)
          .map(
            (row) =>
              `${row.name} (${formatCurrency(row.spend, currency)} spend, ${formatNumber(row.roas, 2)} ROAS, ${formatCurrency(row.cpa, currency)} CPA)`
          )
          .join("; ")}.`
      )
    }
    if (inefficientCampaigns.length > 0) {
      lines.push(
        `- Inefficient campaigns to cut or fix: ${inefficientCampaigns
          .slice(0, 3)
          .map(
            (row) =>
              `${row.name} (${formatCurrency(row.spend, currency)} spend, ${formatNumber(row.roas, 2)} ROAS, ${formatNumber(row.purchases)} purchases)`
          )
          .join("; ")}.`
      )
    }
    if (trafficButWeakConversion.length > 0) {
      lines.push(
        `- Good traffic signals but weak conversion: ${trafficButWeakConversion
          .slice(0, 3)
          .map(
            (row) =>
              `${row.name} (${formatNumber(row.clicks)} clicks, ${formatCurrency(row.spend, currency)} spend, ${formatNumber(row.purchases)} purchases)`
          )
          .join("; ")}.`
      )
    }
    if (weakCtrCampaigns.length > 0) {
      lines.push(
        `- CTR / CPM watchlist: ${weakCtrCampaigns
          .slice(0, 3)
          .map(
            (row) =>
              `${row.name} (CTR ${formatNumber(row.ctr, 2)}, CPM ${formatCurrency(row.cpm, currency)})`
          )
          .join("; ")}.`
      )
    }
  }
  lines.push("")

  lines.push("## Creative and audience signals")
  lines.push(
    "- Creative- and audience-level diagnostics are not yet available in the current contract, so this runbook can only call campaign and platform winners/losers."
  )
  lines.push("")

  lines.push("## Budget reallocation recommendation")
  if (reliabilityWarnings.length > 0) {
    lines.push(
      "- Hold major budget increases until attribution and tracking are reconciled. The apparent improvement may be directionally right, but it is not clean enough to scale aggressively."
    )
  }
  if (scalingCandidates.length > 0) {
    lines.push(
      `- Increase or protect spend on ${scalingCandidates
        .slice(0, 2)
        .map((row) => row.name)
        .join(" and ")} if stock cover and attribution both check out.`
    )
  }
  if (inefficientCampaigns.length > 0) {
    lines.push(
      `- Reduce, pause, or rework ${inefficientCampaigns
        .slice(0, 2)
        .map((row) => row.name)
        .join(" and ")} before putting more budget into the account.`
    )
  }
  if (trafficButWeakConversion.length > 0) {
    lines.push(
      "- Fix on-site conversion and attribution for high-click campaigns before judging them purely on media efficiency."
    )
  }
  if (
    scalingCandidates.length === 0 &&
    inefficientCampaigns.length === 0 &&
    trafficButWeakConversion.length === 0 &&
    reliabilityWarnings.length === 0
  ) {
    lines.push("- Keep spend steady and monitor. The current paid contract does not justify a major reallocation call.")
  }
  lines.push("")

  lines.push("## Risks and caveats")
  if (reliabilityWarnings.length === 0 && !input.warningNote) {
    lines.push("- No additional data caveats were identified beyond the paid-media contract itself.")
  } else {
    for (const warning of reliabilityWarnings) {
      lines.push(`- ${warning}`)
    }
    if (input.warningNote) {
      lines.push(`- ${input.warningNote}`)
    }
  }
  lines.push("")
  lines.push("Sources: Paid media performance, Overview summary, Traffic and conversion, Data freshness")

  return lines.join("\n")
}

function buildDeterministicProductReport(input: {
  toolResults: Awaited<ReturnType<typeof runAgentTools>>
  warningNote?: string | null
}) {
  const productTool = getToolResultByName(input.toolResults, "product_performance")
  const overviewTool = getToolResultByName(input.toolResults, "overview_summary")
  const inventoryTool = getToolResultByName(input.toolResults, "inventory_risk")
  const funnelTool = getToolResultByName(input.toolResults, "traffic_conversion")
  const productData = (productTool?.data ?? {}) as Record<string, unknown>
  const overviewData = (overviewTool?.data ?? {}) as Record<string, unknown>
  const inventoryData = (inventoryTool?.data ?? {}) as Record<string, unknown>
  const funnelData = (funnelTool?.data ?? {}) as Record<string, unknown>
  const productKpis = asRecord(productData.kpis) ?? {}
  const comparisonKpis = asRecord(productData.comparisonKpis) ?? {}
  const overviewTotals = asRecord(overviewData.totals) ?? {}
  const topProducts = asRecordArray(productData.topProducts)
  const comparisonTopProducts = asRecordArray(productData.comparisonTopProducts)
  const inventoryRows = asRecordArray(inventoryData.rows)
  const inventoryKpis = asRecord(inventoryData.kpis) ?? {}
  const funnelProductRows = asRecordArray(
    asRecord(asRecord(asRecord(funnelData.currentRange)?.productBreakdown)?.rowsByGroup)?.product
  )
  const currency = String(productData.currency ?? overviewData.currency ?? "GBP")
  const totalSales = asNumber(productKpis.totalSales)
  const priorSales = asNumber(comparisonKpis.totalSales)
  const totalUnits = asNumber(productKpis.unitsSold)
  const priorUnits = asNumber(comparisonKpis.unitsSold)
  const grossProfit = asNumber(productKpis.grossProfit)
  const priorGrossProfit = asNumber(comparisonKpis.grossProfit)
  const trackedRevenue = asNumber(overviewTotals.revenue)
  const trackedVariants = asNumber(inventoryKpis.trackedVariants) ?? 0
  const atRiskVariants = asNumber(inventoryKpis.atRiskVariants) ?? 0
  const outOfStockVariants = asNumber(inventoryKpis.outOfStockVariants) ?? 0
  const topRevenue = topProducts[0] ? readNumberValue(topProducts[0], ["totalSales"]) : null
  const topRevenueShare =
    topRevenue !== null && totalSales !== null && totalSales > 0
      ? (topRevenue / totalSales) * 100
      : null

  const funnelByProduct = new Map<string, Record<string, unknown>>()
  for (const row of funnelProductRows) {
    const product = (readStringValue(row, ["product"]) ?? "").toLowerCase()
    if (product) {
      funnelByProduct.set(product, row)
    }
  }

  const inventoryByProduct = new Map<string, Record<string, unknown>>()
  for (const row of inventoryRows) {
    const product = (readStringValue(row, ["product"]) ?? "").toLowerCase()
    if (product) {
      inventoryByProduct.set(product, row)
    }
  }

  const scorecardRows = topProducts.slice(0, 6).map((row) => {
    const product = readStringValue(row, ["product"]) ?? "Unknown product"
    const comparisonRow = comparisonTopProducts.find(
      (candidate) =>
        (readStringValue(candidate, ["product"]) ?? "").toLowerCase() === product.toLowerCase()
    )
    const revenue = readNumberValue(row, ["totalSales"])
    const priorRevenue = readNumberValue(comparisonRow ?? {}, ["totalSales"])
    const units = readNumberValue(row, ["qtySold", "unitsSold"])
    const marginPct = readNumberValue(row, ["marginPct"])
    const revenueShare =
      revenue !== null && totalSales !== null && totalSales > 0
        ? (revenue / totalSales) * 100
        : null
    const funnelRow = funnelByProduct.get(product.toLowerCase())
    const purchaseRate = readNumberValue(funnelRow ?? {}, ["purchaseRate"])
    const inventoryRow = inventoryByProduct.get(product.toLowerCase())
    const stockStatus =
      readStringValue(inventoryRow ?? {}, ["status"]) ??
      (trackedVariants === 0 ? "unknown" : "not flagged")

    return {
      marginPct,
      product,
      purchaseRate,
      revenue,
      revenueChange: revenue !== null && priorRevenue !== null ? revenue - priorRevenue : null,
      revenueShare,
      stockStatus,
      units,
    }
  })

  const laggards = comparisonTopProducts
    .map((row) => {
      const product = readStringValue(row, ["product"]) ?? "Unknown product"
      const currentRow = topProducts.find(
        (candidate) =>
          (readStringValue(candidate, ["product"]) ?? "").toLowerCase() === product.toLowerCase()
      )
      const currentRevenue = readNumberValue(currentRow ?? {}, ["totalSales"]) ?? 0
      const priorRevenue = readNumberValue(row, ["totalSales"]) ?? 0
      return {
        change: currentRevenue - priorRevenue,
        currentRevenue,
        priorRevenue,
        product,
      }
    })
    .filter((row) => row.change < 0)
    .sort((left, right) => left.change - right.change)

  const opportunities = funnelProductRows
    .map((row) => ({
      product: readStringValue(row, ["product"]) ?? "Unknown product",
      purchaseRate: readNumberValue(row, ["purchaseRate"]),
      views: readNumberValue(row, ["views"]),
    }))
    .filter((row) => (row.views ?? 0) >= 5 || (row.purchaseRate ?? 0) >= 20)

  const lines: string[] = []
  lines.push("## Product trading summary")
  lines.push(
    `- Products generated ${formatCurrency(totalSales, currency)} from ${formatNumber(totalUnits)} units versus ${formatCurrency(priorSales, currency)} and ${formatNumber(priorUnits)} in the comparison period.`
  )
  lines.push(
    `- Gross profit was ${formatCurrency(grossProfit, currency)} versus ${formatCurrency(priorGrossProfit, currency)}, so product performance improved mainly through volume rather than cleaner margin quality alone.`
  )
  if (topProducts[0]) {
    lines.push(
      `- ${readStringValue(topProducts[0], ["product"]) ?? "The lead product"} is carrying the period at ${formatCurrency(topRevenue, currency)}${topRevenueShare !== null ? ` (${formatPercent(topRevenueShare, 1)} of tracked product revenue)` : ""}.`
    )
  }
  if (trackedVariants === 0) {
    lines.push("- Inventory-linked product risk is only partially visible because there are no tracked inventory variants in the current contract.")
  } else if (outOfStockVariants > 0 || atRiskVariants > 0) {
    lines.push(
      `- Inventory pressure is live for products too: ${formatNumber(outOfStockVariants)} variants are out of stock and ${formatNumber(atRiskVariants)} more are at risk.`
    )
  }
  lines.push("")

  lines.push("## Product scorecard")
  lines.push("| Product | Revenue | Units | Change vs prior | Share of product revenue | Conversion proxy | Margin | Stock status |")
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |")
  for (const row of scorecardRows) {
    lines.push(
      `| ${row.product} | ${formatCurrency(row.revenue, currency)} | ${formatNumber(row.units)} | ${formatCurrency(row.revenueChange, currency)} | ${formatPercent(row.revenueShare, 1)} | ${formatPercent(row.purchaseRate, 2)} | ${formatPercent(row.marginPct !== null ? row.marginPct * 100 : null, 1)} | ${row.stockStatus} |`
    )
  }
  lines.push("")

  lines.push("## Pareto concentration")
  if (topProducts.length === 0 || totalSales === null || totalSales <= 0) {
    lines.push("- Product concentration could not be quantified from the current contract.")
  } else {
    const topTwoRevenue = topProducts
      .slice(0, 2)
      .reduce((sum, row) => sum + (readNumberValue(row, ["totalSales"]) ?? 0), 0)
    lines.push(
      `- The top product contributes ${formatPercent(topRevenueShare, 1)} of tracked product revenue, and the top two contribute ${formatPercent((topTwoRevenue / totalSales) * 100, 1)}.`
    )
    if ((topRevenueShare ?? 0) >= 60) {
      lines.push("- The business is highly concentrated in one hero SKU, so merchandising, stock, and PDP quality on that item matter disproportionately.")
    }
  }
  lines.push("")

  lines.push("## Winners")
  if (scorecardRows.length === 0) {
    lines.push("- No product winners were identifiable from the current contract.")
  } else {
    for (const row of scorecardRows.slice(0, 3)) {
      lines.push(
        `- ${row.product}: ${formatCurrency(row.revenue, currency)} revenue, ${formatNumber(row.units)} units, ${formatCurrency(row.revenueChange, currency)} change versus prior period.`
      )
    }
  }
  lines.push("")

  lines.push("## Laggards")
  if (laggards.length === 0) {
    lines.push("- No material product laggards were identified in the available top-product comparison set.")
  } else {
    for (const row of laggards.slice(0, 3)) {
      lines.push(
        `- ${row.product}: ${formatCurrency(row.currentRevenue, currency)} this period versus ${formatCurrency(row.priorRevenue, currency)} prior period (${formatCurrency(row.change, currency)}).`
      )
    }
  }
  lines.push("")

  lines.push("## Opportunity products")
  const highTrafficLowConversion = opportunities.filter(
    (row) => (row.views ?? 0) >= 5 && (row.purchaseRate ?? 100) < 5
  )
  const strongConversionLowTraffic = opportunities.filter(
    (row) => (row.purchaseRate ?? 0) >= 20 && (row.views ?? 0) <= 5
  )
  if (highTrafficLowConversion.length === 0 && strongConversionLowTraffic.length === 0) {
    lines.push("- No product opportunities cleared the simple traffic/conversion thresholds in the current contract.")
  } else {
    if (highTrafficLowConversion.length > 0) {
      lines.push(
        `- High traffic, weak conversion: ${highTrafficLowConversion
          .slice(0, 3)
          .map((row) => `${row.product} (${formatNumber(row.views)} views, ${formatPercent(row.purchaseRate, 2)} purchase rate)`)
          .join("; ")}.`
      )
    }
    if (strongConversionLowTraffic.length > 0) {
      lines.push(
        `- Strong conversion, low visibility: ${strongConversionLowTraffic
          .slice(0, 3)
          .map((row) => `${row.product} (${formatNumber(row.views)} views, ${formatPercent(row.purchaseRate, 2)} purchase rate)`)
          .join("; ")}.`
      )
    }
  }
  lines.push("")

  lines.push("## Recommended actions")
  lines.push("- Protect the hero SKU first: keep stock, merchandising, and landing-page quality highest on the lead product while concentration remains this high.")
  lines.push("- Support winner products with more visibility before widening the assortment, because the current revenue pool is concentrated in too few SKUs.")
  if (highTrafficLowConversion.length > 0) {
    lines.push("- Fix PDP or offer issues on high-traffic / weak-conversion products before buying more traffic to them.")
  }
  if (strongConversionLowTraffic.length > 0) {
    lines.push("- Push more qualified traffic to strong-conversion / low-visibility products to reduce dependence on the hero SKU.")
  }
  if (trackedVariants === 0) {
    lines.push("- Restore tracked inventory coverage so merchandising decisions are not being made blind to stock availability.")
  }
  if (input.warningNote) {
    lines.push("")
    lines.push("## Confidence / data caveats")
    lines.push(`- ${input.warningNote}`)
  }
  lines.push("")
  lines.push("Sources: Product performance, Overview summary, Inventory risk, Traffic and conversion")

  return lines.join("\n")
}

function buildDeterministicDailyReport(input: {
  toolResults: Awaited<ReturnType<typeof runAgentTools>>
  warningNote?: string | null
}) {
  const overviewTool = getToolResultByName(input.toolResults, "overview_summary")
  const funnelTool = getToolResultByName(input.toolResults, "traffic_conversion")
  const paidTool = getToolResultByName(input.toolResults, "paid_media_summary")
  const productTool = getToolResultByName(input.toolResults, "product_performance")
  const emailTool = getToolResultByName(input.toolResults, "email_performance")
  const freshnessTool = getToolResultByName(input.toolResults, "data_freshness")
  const overviewData = (overviewTool?.data ?? {}) as Record<string, unknown>
  const funnelData = (funnelTool?.data ?? {}) as Record<string, unknown>
  const paidData = (paidTool?.data ?? {}) as Record<string, unknown>
  const productData = (productTool?.data ?? {}) as Record<string, unknown>
  const emailData = (emailTool?.data ?? {}) as Record<string, unknown>
  const freshnessData = (freshnessTool?.data ?? {}) as Record<string, unknown>
  const totals = asRecord(overviewData.totals) ?? {}
  const comparisonTotals = asRecord(overviewData.comparisonTotals) ?? {}
  const snapshots = asRecordArray(overviewData.snapshotRows)
  const funnelCurrent = asRecord(asRecord(funnelData.currentRange)?.kpis) ?? {}
  const funnelComparison = asRecord(asRecord(funnelData.comparison)?.kpis) ?? {}
  const paidTotals = asRecord(paidData.totals) ?? {}
  const paidComparison = asRecord(paidData.comparison) ?? {}
  const productRows = asRecordArray(productData.topProducts)
  const emailKpis = asRecord(emailData.kpis) ?? {}
  const recentJobs = asRecordArray(freshnessData.recentJobs)
  const currency = String(overviewData.currency ?? "GBP")
  const revenue = asNumber(totals.revenue)
  const priorRevenue = asNumber(comparisonTotals.revenue)
  const orders = asNumber(totals.orders)
  const priorOrders = asNumber(comparisonTotals.orders)
  const aov = asNumber(totals.aov)
  const priorAov = asNumber(comparisonTotals.aov)
  const profit = asNumber(totals.netProfit)
  const priorProfit = asNumber(comparisonTotals.netProfit)
  const adSpend = asNumber(totals.adSpend)
  const priorAdSpend = asNumber(comparisonTotals.adSpend)
  const sessions = asNumber(funnelCurrent.sessions)
  const priorSessions = asNumber(funnelComparison.sessions)
  const conversion = asNumber(funnelCurrent.purchaseConversionRate)
  const priorConversion = asNumber(funnelComparison.purchaseConversionRate)
  const emailRevenue = asNumber(emailKpis.revenue)
  const priorEmailRevenue = asNumber(asRecord(emailData.comparison)?.revenue)
  const last7Snapshot = snapshots.find((row) => readStringValue(row, ["id"]) === "last_7_days")
  const topProduct = productRows[0]
  const failedJobs = recentJobs.filter(
    (row) => String(row.status ?? "").toLowerCase() === "failed"
  )

  const lines: string[] = []
  lines.push("## Executive takeaway")
  lines.push(
    `- Yesterday delivered ${formatCurrency(revenue, currency)} from ${formatNumber(orders)} orders versus ${formatCurrency(priorRevenue, currency)} and ${formatNumber(priorOrders)} the prior day (${formatPercent(percentChange(revenue, priorRevenue))}).`
  )
  lines.push(
    `- Site conversion was ${formatPercent(conversion, 2)} on ${formatNumber(sessions)} sessions versus ${formatPercent(priorConversion, 2)} on ${formatNumber(priorSessions)} sessions the day before.`
  )
  lines.push(
    `- Net profit was ${formatCurrency(profit, currency)} versus ${formatCurrency(priorProfit, currency)}, while ad spend ran at ${formatCurrency(adSpend, currency)} versus ${formatCurrency(priorAdSpend, currency)}.`
  )
  if (topProduct) {
    lines.push(
      `- Lead product: ${readStringValue(topProduct, ["productName", "product"]) ?? "Top product"} drove ${formatCurrency(readNumberValue(topProduct, ["revenue", "totalSales"]), currency)} yesterday.`
    )
  }
  lines.push("")

  lines.push("## KPI scorecard")
  lines.push("| KPI | Yesterday | Prior day | Same weekday last week | Absolute change | % change |")
  lines.push("| --- | --- | --- | --- | --- | --- |")
  for (const row of [
    ["Revenue", formatCurrency(revenue, currency), formatCurrency(priorRevenue, currency), "n/a", formatCurrency(revenue !== null && priorRevenue !== null ? revenue - priorRevenue : null, currency), formatPercent(percentChange(revenue, priorRevenue))],
    ["Orders", formatNumber(orders), formatNumber(priorOrders), "n/a", formatNumber(orders !== null && priorOrders !== null ? orders - priorOrders : null), formatPercent(percentChange(orders, priorOrders))],
    ["Sessions", formatNumber(sessions), formatNumber(priorSessions), "n/a", formatNumber(sessions !== null && priorSessions !== null ? sessions - priorSessions : null), formatPercent(percentChange(sessions, priorSessions))],
    ["Conversion rate", formatPercent(conversion, 2), formatPercent(priorConversion, 2), "n/a", formatPercent(conversion !== null && priorConversion !== null ? conversion - priorConversion : null, 2), formatPercent(percentChange(conversion, priorConversion))],
    ["AOV", formatCurrency(aov, currency), formatCurrency(priorAov, currency), "n/a", formatCurrency(aov !== null && priorAov !== null ? aov - priorAov : null, currency), formatPercent(percentChange(aov, priorAov))],
    ["Ad spend", formatCurrency(adSpend, currency), formatCurrency(priorAdSpend, currency), "n/a", formatCurrency(adSpend !== null && priorAdSpend !== null ? adSpend - priorAdSpend : null, currency), formatPercent(percentChange(adSpend, priorAdSpend))],
    ["Email revenue", formatCurrency(emailRevenue, currency), formatCurrency(priorEmailRevenue, currency), "n/a", formatCurrency(emailRevenue !== null && priorEmailRevenue !== null ? emailRevenue - priorEmailRevenue : null, currency), formatPercent(percentChange(emailRevenue, priorEmailRevenue))],
    ["Net profit", formatCurrency(profit, currency), formatCurrency(priorProfit, currency), "n/a", formatCurrency(profit !== null && priorProfit !== null ? profit - priorProfit : null, currency), formatPercent(percentChange(profit, priorProfit))],
  ]) {
    lines.push(`| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} | ${row[4]} | ${row[5]} |`)
  }
  lines.push("")

  lines.push("## What drove the change")
  lines.push(`- Traffic-driven: sessions moved ${formatPercent(percentChange(sessions, priorSessions))}.`)
  lines.push(`- Conversion-driven: purchase conversion moved ${formatPercent(percentChange(conversion, priorConversion))}.`)
  lines.push(`- AOV-driven: average order value moved ${formatPercent(percentChange(aov, priorAov))}.`)
  lines.push(`- Paid media-driven: attributed revenue ${formatCurrency(asNumber(paidTotals.attributedRevenue), currency)} on ${formatCurrency(asNumber(paidTotals.spend), currency)} spend versus ${formatCurrency(asNumber(paidComparison.attributedRevenue), currency)} on ${formatCurrency(asNumber(paidComparison.spend), currency)} the prior day.`)
  lines.push(`- Email-driven: email revenue was ${formatCurrency(emailRevenue, currency)} versus ${formatCurrency(priorEmailRevenue, currency)}.`)
  if (last7Snapshot) {
    lines.push(
      `- Current-week pace context: last 7 days have produced ${formatCurrency(readNumberValue(last7Snapshot, ["revenue"]), currency)} revenue with ${formatPercent(readNumberValue(last7Snapshot, ["comparisonDeltaPct"]), 1)} versus the prior 7 days.`
    )
  }
  lines.push("")

  lines.push("## Product highlights")
  if (productRows.length === 0) {
    lines.push("- Product evidence was unavailable for yesterday.")
  } else {
    for (const row of productRows.slice(0, 5)) {
      lines.push(
        `- ${readStringValue(row, ["productName", "product"]) ?? "Unknown product"}: ${formatCurrency(readNumberValue(row, ["revenue", "totalSales"]), currency)} revenue, ${formatNumber(readNumberValue(row, ["quantity", "qtySold"]))} units.`
      )
    }
  }
  lines.push("")

  lines.push("## Paid media check")
  lines.push(
    `- Paid efficiency: ROAS ${formatNumber(asNumber(paidTotals.roas), 2)} versus ${formatNumber(asNumber(paidComparison.roas), 2)}, CPA ${formatCurrency(asNumber(paidTotals.cpa), currency)} versus ${formatCurrency(asNumber(paidComparison.cpa), currency)}.`
  )
  lines.push(
    `- Commercial read: ${asNumber(paidTotals.spend) === 0 ? "paid was inactive yesterday" : "paid was active yesterday, so judge it against same-day profitability rather than revenue alone"}.`
  )
  lines.push("")

  lines.push("## Risks and opportunities")
  if (failedJobs.length > 0) {
    lines.push(`- ${formatNumber(failedJobs.length)} recent jobs failed, so treat fast-moving day-on-day reads as provisional until refresh health is confirmed.`)
  }
  if ((sessions ?? 0) <= 5 || (orders ?? 0) <= 2) {
    lines.push("- Low sample size risk: one-day conclusions can swing hard, so react only to changes with clear commercial consequence.")
  }
  lines.push("- Same weekday last week is not yet supplied directly by the current contract, so this review is anchored to prior-day change plus current-week pace.")
  lines.push("")

  lines.push("## Recommended actions")
  lines.push("- Protect what actually worked yesterday before changing too much: keep the lead product visible and confirm stock/status if you plan to lean into the demand.")
  lines.push("- If paid efficiency improved, increase confidence first by checking attribution and landing-page quality before moving budget.")
  lines.push("- Use current-week pace, not one day alone, to decide whether yesterday was a repeatable shift or just day-level volatility.")
  lines.push("")

  lines.push("## Data caveats")
  if (input.warningNote) {
    lines.push(`- ${input.warningNote}`)
  }
  lines.push("- Same weekday last week was not directly available in the current tool contract for this run.")
  lines.push("")
  lines.push("Sources: Overview summary, Traffic and conversion, Paid media performance, Product performance, Email performance, Data freshness")

  return lines.join("\n")
}

function buildDeterministicWeeklyReport(input: {
  toolResults: Awaited<ReturnType<typeof runAgentTools>>
  warningNote?: string | null
}) {
  const overviewTool = getToolResultByName(input.toolResults, "overview_summary")
  const funnelTool = getToolResultByName(input.toolResults, "traffic_conversion")
  const paidTool = getToolResultByName(input.toolResults, "paid_media_summary")
  const productTool = getToolResultByName(input.toolResults, "product_performance")
  const emailTool = getToolResultByName(input.toolResults, "email_performance")
  const inventoryTool = getToolResultByName(input.toolResults, "inventory_risk")
  const overviewData = (overviewTool?.data ?? {}) as Record<string, unknown>
  const funnelData = (funnelTool?.data ?? {}) as Record<string, unknown>
  const paidData = (paidTool?.data ?? {}) as Record<string, unknown>
  const productData = (productTool?.data ?? {}) as Record<string, unknown>
  const emailData = (emailTool?.data ?? {}) as Record<string, unknown>
  const inventoryData = (inventoryTool?.data ?? {}) as Record<string, unknown>
  const totals = asRecord(overviewData.totals) ?? {}
  const comparisonTotals = asRecord(overviewData.comparisonTotals) ?? {}
  const funnelCurrent = asRecord(asRecord(funnelData.currentRange)?.kpis) ?? {}
  const funnelComparison = asRecord(asRecord(funnelData.comparison)?.kpis) ?? {}
  const paidTotals = asRecord(paidData.totals) ?? {}
  const paidComparison = asRecord(paidData.comparison) ?? {}
  const channelRows = asRecordArray(paidData.channelSummary)
  const topProducts = asRecordArray(productData.topProducts)
  const comparisonTopProducts = asRecordArray(productData.comparisonTopProducts)
  const emailKpis = asRecord(emailData.kpis) ?? {}
  const emailComparison = asRecord(emailData.comparison) ?? {}
  const inventoryKpis = asRecord(inventoryData.kpis) ?? {}
  const currency = String(overviewData.currency ?? productData.currency ?? "GBP")
  const revenue = asNumber(totals.revenue)
  const priorRevenue = asNumber(comparisonTotals.revenue)
  const orders = asNumber(totals.orders)
  const priorOrders = asNumber(comparisonTotals.orders)
  const aov = asNumber(totals.aov)
  const priorAov = asNumber(comparisonTotals.aov)
  const sessions = asNumber(funnelCurrent.sessions)
  const priorSessions = asNumber(funnelComparison.sessions)
  const conversion = asNumber(funnelCurrent.purchaseConversionRate)
  const priorConversion = asNumber(funnelComparison.purchaseConversionRate)
  const netProfit = asNumber(totals.netProfit)
  const priorNetProfit = asNumber(comparisonTotals.netProfit)
  const emailRevenue = asNumber(emailKpis.revenue)
  const priorEmailRevenue = asNumber(emailComparison.revenue)
  const revenueBridge = approximateRevenueBridge({
    currentAov: aov,
    currentConversionRate: conversion,
    currentSessions: sessions,
    priorAov,
    priorConversionRate: priorConversion,
    priorSessions,
  })
  const topDrivers = topProducts.map((row) => {
    const product = readStringValue(row, ["product"]) ?? "Unknown product"
    const comparisonRow = comparisonTopProducts.find(
      (candidate) =>
        (readStringValue(candidate, ["product"]) ?? "").toLowerCase() === product.toLowerCase()
    )
    const currentSales = readNumberValue(row, ["totalSales"]) ?? 0
    const previousSales = readNumberValue(comparisonRow ?? {}, ["totalSales"]) ?? 0
    return {
      change: currentSales - previousSales,
      currentSales,
      previousSales,
      product,
    }
  }).sort((left, right) => Math.abs(right.change) - Math.abs(left.change))

  const lines: string[] = []
  lines.push("## Weekly executive summary")
  lines.push(`- Revenue was ${formatCurrency(revenue, currency)} versus ${formatCurrency(priorRevenue, currency)} in the prior 7 days (${formatPercent(percentChange(revenue, priorRevenue))}).`)
  lines.push(`- Orders moved ${formatPercent(percentChange(orders, priorOrders))}, conversion moved ${formatPercent(percentChange(conversion, priorConversion))}, and AOV moved ${formatPercent(percentChange(aov, priorAov))}.`)
  lines.push(`- Net profit was ${formatCurrency(netProfit, currency)} versus ${formatCurrency(priorNetProfit, currency)}, which is the best simple weekly read on quality of growth.`)
  if (topDrivers[0]) {
    lines.push(`- The biggest product driver was ${topDrivers[0].product} at ${formatCurrency(topDrivers[0].currentSales, currency)} this week (${formatCurrency(topDrivers[0].change, currency)} versus prior week).`)
  }
  if ((asNumber(inventoryKpis.trackedVariants) ?? 0) === 0) {
    lines.push("- Inventory risk remains partially blind this week because there are no tracked inventory variants in the current contract.")
  }
  lines.push("")

  lines.push("## KPI bridge")
  lines.push(`- Traffic change: ${formatNumber(sessions)} sessions versus ${formatNumber(priorSessions)} (${formatPercent(percentChange(sessions, priorSessions))}).`)
  lines.push(`- Conversion change: ${formatPercent(conversion, 2)} versus ${formatPercent(priorConversion, 2)} (${formatPercent(percentChange(conversion, priorConversion))}).`)
  lines.push(`- AOV change: ${formatCurrency(aov, currency)} versus ${formatCurrency(priorAov, currency)} (${formatPercent(percentChange(aov, priorAov))}).`)
  lines.push(`- Paid media change: ${formatCurrency(asNumber(paidTotals.attributedRevenue), currency)} attributed revenue on ${formatCurrency(asNumber(paidTotals.spend), currency)} spend versus ${formatCurrency(asNumber(paidComparison.attributedRevenue), currency)} on ${formatCurrency(asNumber(paidComparison.spend), currency)}.`)
  lines.push(`- Email change: ${formatCurrency(emailRevenue, currency)} versus ${formatCurrency(priorEmailRevenue, currency)}.`)
  lines.push(
    revenueBridge
      ? `- Approximate bridge: traffic contributed ${formatCurrency(revenueBridge.trafficEffect, currency)}, conversion contributed ${formatCurrency(revenueBridge.conversionEffect, currency)}, and AOV contributed ${formatCurrency(revenueBridge.aovEffect, currency)} to the weekly revenue movement.`
      : "- Approximate bridge: insufficient traffic/conversion evidence for a reliable simple bridge."
  )
  lines.push("")

  lines.push("## Channel performance")
  lines.push("| Channel | Spend | Revenue | Orders/Purchases | Efficiency | Commercial comment |")
  lines.push("| --- | --- | --- | --- | --- | --- |")
  if (channelRows.length === 0) {
    lines.push("| No paid channel rows | n/a | n/a | n/a | n/a | Investigate or treat week as mostly non-paid |")
  } else {
    for (const row of channelRows.slice(0, 5)) {
      const platform = readStringValue(row, ["platform"]) ?? "Unknown"
      const spend = readNumberValue(row, ["spend"])
      const revenue = readNumberValue(row, ["attributedRevenue", "revenue"])
      const purchases = readNumberValue(row, ["purchases"])
      const roas = readNumberValue(row, ["roas"])
      const comment =
        (roas ?? 0) >= 3 ? "Scaling well if attribution is trusted" : (roas ?? 0) >= 1.5 ? "Mixed efficiency" : "Needs fixing"
      lines.push(`| ${platform} | ${formatCurrency(spend, currency)} | ${formatCurrency(revenue, currency)} | ${formatNumber(purchases)} | ${formatNumber(roas, 2)} ROAS | ${comment} |`)
    }
  }
  lines.push("")

  lines.push("## Product performance")
  if (topDrivers.length === 0) {
    lines.push("- Product performance was not available in the current contract.")
  } else {
    lines.push(`- Winners: ${topDrivers.slice(0, 2).map((row) => `${row.product} (${formatCurrency(row.change, currency)})`).join("; ")}.`)
    const laggards = topDrivers.filter((row) => row.change < 0).slice(0, 2)
    lines.push(
      laggards.length > 0
        ? `- Laggards: ${laggards.map((row) => `${row.product} (${formatCurrency(row.change, currency)})`).join("; ")}.`
        : "- Laggards: no material product declines were visible in the top-product comparison set."
    )
    lines.push(
      `- Inventory context: ${formatNumber(asNumber(inventoryKpis.outOfStockVariants))} out of stock, ${formatNumber(asNumber(inventoryKpis.atRiskVariants))} at risk, ${formatNumber(asNumber(inventoryKpis.trackedVariants))} tracked variants.`
    )
  }
  lines.push("")

  lines.push("## Paid media diagnosis")
  lines.push(`- ROAS moved from ${formatNumber(asNumber(paidComparison.roas), 2)} to ${formatNumber(asNumber(paidTotals.roas), 2)}, while CPA moved from ${formatCurrency(asNumber(paidComparison.cpa), currency)} to ${formatCurrency(asNumber(paidTotals.cpa), currency)}.`)
  lines.push(`- Spend moved ${formatPercent(percentChange(asNumber(paidTotals.spend), asNumber(paidComparison.spend)))} and attributed revenue moved ${formatPercent(percentChange(asNumber(paidTotals.attributedRevenue), asNumber(paidComparison.attributedRevenue)))}.`)
  lines.push("")

  lines.push("## Email and retention")
  lines.push(`- Email/lifecycle revenue was ${formatCurrency(emailRevenue, currency)} versus ${formatCurrency(priorEmailRevenue, currency)}.`)
  if ((asNumber(emailKpis.sends) ?? 0) === 0) {
    lines.push("- No meaningful email send volume was recorded, so lifecycle is not currently supporting the week in a material way.")
  }
  lines.push("")

  lines.push("## This week's priorities")
  lines.push("- Protect the few products and channels driving the week before expanding effort elsewhere.")
  lines.push("- Fix weak paid efficiency or attribution before moving more budget.")
  lines.push("- Use the traffic/conversion bridge to decide whether next week's goal is more reach, better conversion, or AOV lift.")
  if ((asNumber(inventoryKpis.trackedVariants) ?? 0) === 0) {
    lines.push("- Restore inventory tracking so next week's priorities are not being set blind to stock risk.")
  }
  if (input.warningNote) {
    lines.push("")
    lines.push("## Confidence / data caveats")
    lines.push(`- ${input.warningNote}`)
  }
  lines.push("")
  lines.push("Sources: Overview summary, Traffic and conversion, Paid media performance, Product performance, Email performance, Inventory risk")

  return lines.join("\n")
}

function buildDirectAnswerPrompt(input: {
  context: DashboardRequestContext
  history: string
  question: string
}) {
  return [
    `Workspace: ${input.context.workspaceId}`,
    `Conversation history:\n${input.history || "(none)"}`,
    `Current user message: ${input.question}`,
  ].join("\n\n")
}

function buildDateClarificationPrompt(input: {
  question: string
  history: string
}) {
  return [
    `Conversation history:\n${input.history || "(none)"}`,
    `Original question: ${input.question}`,
  ].join("\n\n")
}

export async function runAgentTurn(input: {
  conversationId?: string
  confirmedOps?: string[]
  context: DashboardRequestContext
  message: string
  presetAnchorDate?: string
  presetId?: AgentPresetId
  titleSeed?: string
}): Promise<AgentRunResult> {
  const resolved = await resolveWorkspaceAgentCredential({
    workspaceId: input.context.workspaceId,
  })
  const model = await resolveProviderModel({
    apiKey: resolved.apiKey,
    provider: resolved.provider,
    selectedModel: resolved.model,
  })
  const businessProfile = resolved.settings.businessProfile
  const existingConversation = input.conversationId
    ? await getAgentConversationById(input.conversationId)
    : null
  const conversation =
    existingConversation && existingConversation.workspaceId === input.context.workspaceId
      ? existingConversation
      : await createAgentConversation({
          model,
          provider: resolved.provider,
          title: input.titleSeed ?? input.message,
          workspaceId: input.context.workspaceId,
        })
  const history = await listAgentMessages(conversation.id)
  const pendingDateClarification = getPendingDateClarification(history)
  const isDateFollowUp =
    Boolean(pendingDateClarification) && isDateScopeOnlyPrompt(input.message)
  const analysisQuestion =
    isDateFollowUp && pendingDateClarification
      ? `Use ${input.message.trim()} as the date range for this question: ${pendingDateClarification}`
      : input.message
  const userMessage = await createAgentMessage({
    content: input.message,
    conversationId: conversation.id,
    role: "user",
    workspaceId: input.context.workspaceId,
  })
  const hasExplicitConfirmedOps =
    !input.presetId && Array.isArray(input.confirmedOps)
  const providedConfirmedOps = hasExplicitConfirmedOps
    ? normalizeOpValues(input.confirmedOps)
    : []
  const confirmedOps = normalizeAllowedOps(providedConfirmedOps)
  const unsupportedConfirmedOps = hasExplicitConfirmedOps
    ? providedConfirmedOps.filter(
        (op) => !(AGENT_ALLOWED_OPS as readonly string[]).includes(op)
      )
    : []
  const pendingWorkerPlanRecord = hasExplicitConfirmedOps
    ? await getLatestPendingWorkerPlan(conversation.id)
    : null
  const pendingWorkerPlanResolution = pendingWorkerPlanRecord
    ? resolvePendingWorkerPlan({
        payload: pendingWorkerPlanRecord.payload,
        pendingRunId: pendingWorkerPlanRecord.runId,
        workspaceId: input.context.workspaceId,
      })
    : {
        blockedReason: null,
        plan: null,
      }
  const pendingWorkerPlan = pendingWorkerPlanResolution.plan
  const preflightBlockedReason =
    unsupportedConfirmedOps.length > 0
      ? `Confirmation included unsupported operations: ${unsupportedConfirmedOps.join(", ")}.`
      : hasExplicitConfirmedOps && !pendingWorkerPlanRecord
        ? "No pending worker plan was found for this conversation. Confirmation could not be resumed."
        : pendingWorkerPlanResolution.blockedReason
  const turnPlan =
    hasExplicitConfirmedOps
      ? {
          kind: "analysis" as const,
          warnings: [],
        }
      : isDateFollowUp
      ? {
          kind: "analysis" as const,
          warnings: [],
        }
      : resolveTurnPlan(analysisQuestion, {
          maxMessageChars: input.presetId
            ? AGENT_MAX_PRESET_MESSAGE_CHARS
            : AGENT_MAX_MESSAGE_CHARS,
        })
  const presetContext = resolvePresetContext({
    context: input.context,
    presetAnchorDate: input.presetAnchorDate,
    presetId: input.presetId,
  })
  const scopeResolution =
    pendingWorkerPlan !== null
      ? ({
          context: {
            ...input.context,
            compare: pendingWorkerPlan.context.compare,
            from: pendingWorkerPlan.context.from,
            to: pendingWorkerPlan.context.to,
            workspaceId: pendingWorkerPlan.context.workspaceId,
          },
          confidence: "high",
          source: "explicit",
          warning: `Resuming confirmed worker plan from pending run ${pendingWorkerPlan.pendingRunId}.`,
          assumptionNote: null,
          needsClarification: false,
        } satisfies ScopeResolution)
      : input.presetId
        ? ({
            context: presetContext?.context ?? input.context,
            confidence: "high",
            source: "explicit",
            warning: null,
            assumptionNote: null,
            needsClarification: false,
          } satisfies ScopeResolution)
        : resolveScopeForTurn({
            context: presetContext?.context ?? input.context,
            question: analysisQuestion,
            scopeSignal: input.message,
            turnKind: turnPlan.kind,
          })
  const requiresDateClarification =
    !hasExplicitConfirmedOps &&
    !input.presetId &&
    !isDateFollowUp &&
    scopeResolution.needsClarification
  const effectiveAnalysisQuestion = pendingWorkerPlan?.question ?? analysisQuestion
  const normalizedAnalysisQuestion =
    pendingWorkerPlan
      ? effectiveAnalysisQuestion
      : scopeResolution.source === "inferred" &&
          monthShortYearDateRange(input.message) !== null
        ? normalizeMonthShortYearQuestion(effectiveAnalysisQuestion)
        : effectiveAnalysisQuestion
  const executionQuestion =
    pendingWorkerPlan
      ? pendingWorkerPlan.question
      : !requiresDateClarification && scopeResolution.assumptionNote
      ? `${normalizedAnalysisQuestion}\n\nUse this resolved time scope for analysis: ${scopeResolution.context.from} to ${scopeResolution.context.to}.`
      : normalizedAnalysisQuestion
  const toolNames = resolveToolNames({
    message: executionQuestion,
    presetId: input.presetId,
    turnKind:
      hasExplicitConfirmedOps || requiresDateClarification ? "direct" : turnPlan.kind,
  })
  const toolResults =
    hasExplicitConfirmedOps || turnPlan.kind === "direct" || requiresDateClarification
      ? []
      : await runAgentTools({
          context: scopeResolution.context,
          message: executionQuestion,
          toolNames,
        })
  const preset = input.presetId ? getAgentPreset(input.presetId) : null
  const workerEnabledByHeuristic = shouldUseWorker(analysisQuestion, toolNames)
  const nonRunbookWorkerEnabled = env.agent.enableWorker === true
  const executionMode: AgentExecutionMode =
    hasExplicitConfirmedOps
      ? "worker"
      : turnPlan.kind === "direct" || requiresDateClarification
      ? "direct"
      : preset
        ? preset.executionMode
        : nonRunbookWorkerEnabled && workerEnabledByHeuristic
          ? "worker"
          : "tools"
  const run = await createAgentRun({
    conversationId: conversation.id,
    executionMode,
    model,
    provider: resolved.provider,
    requestedOps: [],
    usedTools: toolResults.map((tool) => tool.name),
    userMessageId: userMessage.id,
    workspaceId: input.context.workspaceId,
  })
  const warnings: string[] = []
  const usageSegments: AgentUsageSegment[] = []
  const charts =
    turnPlan.kind === "direct" || requiresDateClarification
      ? []
      : buildAgentCharts(toolResults)
  let workerResult: Record<string, unknown> | null = null
  let requestedOps: string[] = []
  let usageSummary: AgentUsageSummary | null = null
  let blockedReason: string | null = preflightBlockedReason
  let runStatus: AgentRunStatus | null = blockedReason ? "blocked" : null

  try {
    await assertWorkspaceBudgetAvailable(input.context.workspaceId)

    warnings.push(...turnPlan.warnings)

    if (presetContext?.note) {
      warnings.push(presetContext.note)
    }

    if (scopeResolution.warning) {
      warnings.push(scopeResolution.warning)
    }

    if (!input.presetId && workerEnabledByHeuristic && !nonRunbookWorkerEnabled) {
      warnings.push(
        "Deep analysis worker is disabled for free-form turns. Set ECOMDASH2_AGENT_ENABLE_WORKER=1 to enable it."
      )
    }

    if (toolResults.length > 0) {
      await createAgentArtifact({
        artifactType: "tool_results",
        conversationId: conversation.id,
        payload: toolResults,
        runId: run.runId,
        workspaceId: input.context.workspaceId,
      })
    }

    if (executionMode === "worker") {
      try {
        if (blockedReason) {
          runStatus = "blocked"
        } else {
        const plan =
          pendingWorkerPlan !== null
            ? ({
                requestedOps: pendingWorkerPlan.requestedOps,
                scriptBody: pendingWorkerPlan.scriptBody,
                usage: undefined,
                why: pendingWorkerPlan.why ?? "",
              } satisfies WorkerPlan)
            : await generateWorkerPlan({
                apiKey: resolved.apiKey,
                businessProfile,
                context: scopeResolution.context,
                model,
                provider: resolved.provider,
                question: executionQuestion,
                toolResults,
              })
        const scriptBody = String(plan.scriptBody ?? "").trim()

        requestedOps = normalizeAllowedOps(plan.requestedOps)

        if (pendingWorkerPlan === null) {
          await createAgentArtifact({
            artifactType: "worker_plan",
            conversationId: conversation.id,
            payload: {
              context: {
                compare: scopeResolution.context.compare,
                from: scopeResolution.context.from,
                to: scopeResolution.context.to,
                workspaceId: scopeResolution.context.workspaceId,
              },
              plan: {
                requestedOps,
                scriptBody,
                why: plan.why,
              },
              question: executionQuestion,
            },
            runId: run.runId,
            workspaceId: input.context.workspaceId,
          })

          const workerPlanUsage = buildUsageSegment({
            label: "Deep-analysis plan",
            model,
            provider: resolved.provider,
            usage: plan.usage,
          })

          if (workerPlanUsage) {
            usageSegments.push(workerPlanUsage)
          }
        }

        if (!scriptBody) {
          blockedReason = "Worker plan script was empty."
          runStatus = "blocked"
        }

        const scriptDispatch = inspectScriptDispatchOps(scriptBody)

        if (!blockedReason && scriptDispatch.hasDynamicDispatch) {
          blockedReason =
            "Worker script used non-literal dispatchOp(...) arguments, which is not allowed."
          runStatus = "blocked"
        }

        if (!blockedReason) {
          const unsupportedScriptOps = scriptDispatch.requestedOps.filter(
            (op) => !(AGENT_ALLOWED_OPS as readonly string[]).includes(op)
          )

          if (unsupportedScriptOps.length > 0) {
            blockedReason = `Worker script requested unsupported operations: ${unsupportedScriptOps.join(", ")}.`
            runStatus = "blocked"
          }
        }

        if (
          !blockedReason &&
          !hasExactOpSet(scriptDispatch.requestedOps, requestedOps)
        ) {
          blockedReason =
            "Worker script dispatchOp set does not match the saved requested op set."
          runStatus = "blocked"
        }

        if (!blockedReason && hasExplicitConfirmedOps) {
          if (!hasExactOpSet(confirmedOps, requestedOps)) {
            blockedReason =
              "Confirmed operations do not exactly match the pending plan requested ops."
            runStatus = "blocked"
          }
        }

        const unconfirmedOps = requestedOps.filter(
          (op) => !confirmedOps.includes(op)
        )

        if (!blockedReason && scriptBody && unconfirmedOps.length === 0) {
          const allowedOps = hasExplicitConfirmedOps ? confirmedOps : []
          const capabilities =
            allowedOps.length > 0
              ? (["datasets", "sql", "ops"] as const)
              : (["datasets", "sql"] as const)
          const executorResult = await executeAgentRun({
            brokerBaseUrl: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/agent/broker`,
            brokerToken: createAgentBrokerToken({
              allowedOps,
              capabilities: [...capabilities],
              expiresAt: Date.now() + 5 * 60_000,
              runId: run.runId,
              workspaceId: input.context.workspaceId,
            }),
            allowedOps,
            confirmedOps,
            context: {
              compare: scopeResolution.context.compare,
              from: scopeResolution.context.from,
              to: scopeResolution.context.to,
              workspaceId: scopeResolution.context.workspaceId,
            },
            question: executionQuestion,
            runId: run.runId,
            scriptBody,
          })

          workerResult = executorResult.result
          warnings.push(...executorResult.warnings)

          await createAgentArtifact({
            artifactType: "worker_result",
            conversationId: conversation.id,
            payload: executorResult,
            runId: run.runId,
            workspaceId: input.context.workspaceId,
          })
        } else if (!blockedReason && unconfirmedOps.length > 0) {
          runStatus = "needs_confirmation"
          warnings.push(
            `Pending confirmation required for: ${unconfirmedOps.join(", ")}.`
          )
        } else if (unconfirmedOps.length > 0) {
          runStatus = "blocked"
        }
        }
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? `Deep analysis unavailable: ${error.message}`
            : "Deep analysis unavailable."
        )
      }
    }

    let answerText = ""
    if (blockedReason) {
      if (!warnings.includes(`Blocked: ${blockedReason}`)) {
        warnings.push(`Blocked: ${blockedReason}`)
      }

      runStatus = "blocked"
      answerText = buildBlockedAssistantReply(blockedReason)
    }

    if (
      !blockedReason &&
      input.presetId === "anomaly-and-issue-scan" &&
      executionMode === "tools"
    ) {
      const anomalyTool = getToolResultByName(toolResults, "anomaly_scan")
      const anomalyCoverage = Array.isArray(anomalyTool?.data.coverage)
        ? (anomalyTool?.data.coverage as AgentAnomalyCoverage[])
        : []
      const anomalySignals = Array.isArray(anomalyTool?.data.signals)
        ? (anomalyTool?.data.signals as AgentAnomalySignal[])
        : []
      answerText = buildDeterministicAnomalyReport({
        coverage: anomalyCoverage,
        signals: anomalySignals,
        sourceLabel: anomalyTool?.label ?? "Anomaly scan",
      })
    } else if (
      !blockedReason &&
      input.presetId === "last-month-board-summary" &&
      executionMode === "tools"
    ) {
      answerText = buildDeterministicMonthlyReport({
        toolResults,
        warningNote: warnings.length > 0 ? warnings.join(" ") : null,
      })
    } else if (
      !blockedReason &&
      input.presetId === "inventory-risk-and-missed-revenue" &&
      executionMode === "tools"
    ) {
      answerText = buildDeterministicInventoryReport({
        toolResults,
        warningNote: warnings.length > 0 ? warnings.join(" ") : null,
      })
    } else if (
      !blockedReason &&
      input.presetId === "paid-media-diagnostics" &&
      executionMode === "tools"
    ) {
      answerText = buildDeterministicPaidMediaReport({
        toolResults,
        warningNote: warnings.length > 0 ? warnings.join(" ") : null,
      })
    } else if (
      !blockedReason &&
      input.presetId === "product-and-merchandising-performance" &&
      executionMode === "tools"
    ) {
      answerText = buildDeterministicProductReport({
        toolResults,
        warningNote: warnings.length > 0 ? warnings.join(" ") : null,
      })
    } else if (
      !blockedReason &&
      input.presetId === "daily-trading-pulse" &&
      executionMode === "tools"
    ) {
      answerText = buildDeterministicDailyReport({
        toolResults,
        warningNote: warnings.length > 0 ? warnings.join(" ") : null,
      })
    } else if (
      !blockedReason &&
      input.presetId === "last-7-days-commercial-review" &&
      executionMode === "tools"
    ) {
      answerText = buildDeterministicWeeklyReport({
        toolResults,
        warningNote: warnings.length > 0 ? warnings.join(" ") : null,
      })
    } else if (!blockedReason) {
      const completionResult = await completeWithProvider({
        apiKey: resolved.apiKey,
        maxTokens:
          executionMode === "direct"
            ? AGENT_MAX_DIRECT_COMPLETION_TOKENS
            : AGENT_MAX_COMPLETION_TOKENS,
        model,
        provider: resolved.provider,
        systemPrompt: buildAgentSystemPrompt({
          businessProfile,
          mode: requiresDateClarification
            ? "date_clarification"
            : executionMode === "direct"
              ? "direct"
              : "analysis",
        }),
        userPrompt:
          requiresDateClarification
            ? buildDateClarificationPrompt({
                history: serializeConversationHistory({
                  messages: history,
                  summaryText: conversation.summaryText,
                }),
                question: scopeResolution.clarificationQuestion ?? analysisQuestion,
              })
            : executionMode === "direct"
            ? buildDirectAnswerPrompt({
                context: scopeResolution.context,
                history: serializeConversationHistory({
                  messages: history,
                  summaryText: conversation.summaryText,
                }),
                question: executionQuestion,
              })
            : buildAnswerPrompt({
                executionMode,
                history: serializeConversationHistory({
                  messages: history,
                  summaryText: conversation.summaryText,
                }),
                question: executionQuestion,
                requestedOps,
                toolResults,
                warnings,
                workerResult,
              }),
      })
      const answerUsage = buildUsageSegment({
        label: executionMode === "direct" ? "Direct response" : "Final answer",
        model,
        provider: resolved.provider,
        usage: completionResult?.usage,
      })

      if (answerUsage) {
        usageSegments.push(answerUsage)
      }

      answerText = completionResult?.text?.trim() ?? ""
    }

    const normalizedAnswerText = answerText.trim()

    if (!normalizedAnswerText) {
      throw new Error(
        requiresDateClarification
          ? "The model did not return a date-clarification question."
          : executionMode === "direct"
            ? "The model did not return a usable reply."
            : "The model did not return a usable analysis answer."
      )
    }

    answerText = normalizedAnswerText

    if (
      !requiresDateClarification &&
      scopeResolution.assumptionNote &&
      !answerText.toLowerCase().includes("scope assumption:")
    ) {
      answerText = `Scope assumption: ${scopeResolution.assumptionNote}\n\n${answerText}`
    }

    usageSummary = buildUsageSummary({
      model,
      provider: resolved.provider,
      segments: usageSegments,
    })

    if (usageSummary) {
      await createAgentArtifact({
        artifactType: "usage_summary",
        conversationId: conversation.id,
        payload: usageSummary,
        runId: run.runId,
        workspaceId: input.context.workspaceId,
      })
    }

    const resolvedRunStatus: AgentRunStatus =
      runStatus ??
      (requestedOps.length > 0 &&
      requestedOps.some((op) => !confirmedOps.includes(op))
        ? "needs_confirmation"
        : "success")

    const assistantMessage = await createAgentMessage({
      content: answerText,
      conversationId: conversation.id,
      metadata: {
        executionMode,
        clarifyingOptions: requiresDateClarification
          ? scopeResolution.clarifyingOptions
          : undefined,
        charts,
        dateClarificationQuestion: requiresDateClarification
          ? scopeResolution.clarificationQuestion ?? effectiveAnalysisQuestion
          : undefined,
        runStatus: resolvedRunStatus,
        scope: {
          assumptionNote: scopeResolution.assumptionNote,
          confidence: scopeResolution.confidence,
          from: scopeResolution.context.from,
          source: scopeResolution.source,
          to: scopeResolution.context.to,
        },
        requestedOps,
        usage: usageSummary,
        usedTools: toolResults.map((tool) => ({
          label: tool.label,
          name: tool.name,
          summary: tool.summary,
        })),
        warnings,
      },
      role: "assistant",
      workspaceId: input.context.workspaceId,
    })
    await updateAgentConversationSummary({
      conversationId: conversation.id,
      summaryText: buildRollingConversationSummary({
        answer: answerText,
        previousSummary: conversation.summaryText,
        question: effectiveAnalysisQuestion,
        requestedOps,
        usedTools: toolResults.map((tool) => tool.label),
        warnings,
      }),
    })

    await finishAgentRun({
      assistantMessageId: assistantMessage.id,
      message: compactText(answerText, 240),
      runId: run.runId,
      status: resolvedRunStatus,
      warnings,
    })

    return {
      assistantMessage,
      conversationId: conversation.id,
      executionMode,
      requestedOps,
      runId: run.runId,
      usedTools: toolResults.map((tool) => tool.name),
      warnings,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Agent run failed."
    const assistantMessage = await createAgentMessage({
      content: `I couldn't complete that request.\n\nReason: ${errorMessage}`,
      conversationId: conversation.id,
      metadata: {
        executionMode,
        clarifyingOptions: undefined,
        charts: [],
        dateClarificationQuestion: undefined,
        scope: {
          assumptionNote: scopeResolution.assumptionNote,
          confidence: scopeResolution.confidence,
          from: scopeResolution.context.from,
          source: scopeResolution.source,
          to: scopeResolution.context.to,
        },
        requestedOps,
        runStatus: "failed",
        usage: usageSummary,
        usedTools: toolResults.map((tool) => tool.name),
        warnings: [...warnings, errorMessage],
      },
      role: "assistant",
      workspaceId: input.context.workspaceId,
    })
    await updateAgentConversationSummary({
      conversationId: conversation.id,
      summaryText: buildRollingConversationSummary({
        answer: `Request failed. Reason: ${errorMessage}`,
        previousSummary: conversation.summaryText,
        question: effectiveAnalysisQuestion,
        requestedOps,
        usedTools: toolResults.map((tool) => tool.label),
        warnings: [...warnings, errorMessage],
      }),
    })

    await finishAgentRun({
      assistantMessageId: assistantMessage.id,
      message: errorMessage,
      runId: run.runId,
      status: "failed",
      warnings: [...warnings, errorMessage],
    })

    return {
      assistantMessage,
      conversationId: conversation.id,
      executionMode,
      requestedOps,
      runId: run.runId,
      usedTools: toolResults.map((tool) => tool.name),
      warnings: [...warnings, errorMessage],
    }
  }
}
