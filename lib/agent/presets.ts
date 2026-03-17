import "server-only"

import { readFileSync } from "node:fs"
import path from "node:path"

import type { AgentToolName } from "@/lib/agent/types"
import type { AgentPresetId, AgentPresetListItem } from "@/lib/agent/types"
import type { DashboardRequestContext } from "@/types/dashboard"

type AgentPresetDefinition = AgentPresetListItem & {
  allowWorker: boolean
  executionMode: "tools" | "worker"
  releaseGate: AgentPresetReleaseGateStatus
  resolveContext: (
    context: DashboardRequestContext,
    options?: {
      anchorDate?: string
    }
  ) => {
    context: DashboardRequestContext
    note: string
  }
  toolNames: AgentToolName[]
}

type ParsedRunbookDoc = {
  id: AgentPresetId
  label: string
  description: string
  prompt: string
}

type AgentPresetRuntime = {
  allowWorker: boolean
  executionMode: AgentPresetDefinition["executionMode"]
  resolveContext: AgentPresetDefinition["resolveContext"]
  toolNames: AgentToolName[]
}

type RunbookReleaseGateStatus = "ready" | "blocked" | "not_evaluated"

type RunbookReleaseGateRecord = {
  presetId: AgentPresetId
  lastScore: number
  threshold: number
  ready: boolean
  evaluatedAt: string
  reportPath: string
}

type RunbookReleaseGateFile = {
  generatedAt: string
  gates: RunbookReleaseGateRecord[]
}

type AgentPresetReleaseGateStatus = {
  status: RunbookReleaseGateStatus
  threshold: number
  lastScore: number | null
  ready: boolean
  evaluatedAt: string | null
  reportPath: string | null
}

type ListAgentPresetsOptions = {
  enforceProductionReadiness?: boolean
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(isoDate: string, days: number) {
  const value = new Date(`${isoDate}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return toIsoDate(value)
}

function startOfIsoMonth(isoDate: string) {
  const value = new Date(`${isoDate}T00:00:00.000Z`)
  value.setUTCDate(1)
  return toIsoDate(value)
}

function endOfIsoMonth(isoDate: string) {
  const value = new Date(`${isoDate}T00:00:00.000Z`)
  value.setUTCMonth(value.getUTCMonth() + 1, 0)
  return toIsoDate(value)
}

function shiftIsoDateByMonths(isoDate: string, months: number) {
  const value = new Date(`${isoDate}T00:00:00.000Z`)
  value.setUTCMonth(value.getUTCMonth() + months)
  return toIsoDate(value)
}

function todayIsoDate() {
  return toIsoDate(new Date())
}

function resolveAnchorDateIso(options?: { anchorDate?: string }) {
  return options?.anchorDate || todayIsoDate()
}

const PRESET_RUNTIME: Record<AgentPresetId, AgentPresetRuntime> = {
  "anomaly-and-issue-scan": {
    allowWorker: true,
    executionMode: "tools",
    resolveContext(context) {
      return {
        context: {
          ...context,
          compare: "previous_period",
        },
        note: `Runbook scope: current dashboard range ${context.from} to ${context.to}, compared with the previous equivalent period.`,
      }
    },
    toolNames: ["anomaly_scan"],
  },
  "daily-trading-pulse": {
    allowWorker: false,
    executionMode: "tools",
    resolveContext(context, options) {
      const yesterday = addUtcDays(resolveAnchorDateIso(options), -1)
      return {
        context: {
          ...context,
          compare: "previous_period",
          from: yesterday,
          to: yesterday,
        },
        note: `Runbook scope: yesterday only (${yesterday}), compared with the prior day and the same weekday last week where available.`,
      }
    },
    toolNames: [
      "overview_summary",
      "traffic_conversion",
      "paid_media_summary",
      "product_performance",
      "email_performance",
      "data_freshness",
    ],
  },
  "email-and-retention-performance": {
    allowWorker: true,
    executionMode: "tools",
    resolveContext(context) {
      return {
        context: {
          ...context,
          compare: "previous_period",
        },
        note: `Runbook scope: current dashboard range ${context.from} to ${context.to}, compared with the previous equivalent period.`,
      }
    },
    toolNames: ["email_performance", "overview_summary"],
  },
  "inventory-risk-and-missed-revenue": {
    allowWorker: true,
    executionMode: "tools",
    resolveContext(context) {
      return {
        context,
        note: `Runbook scope: current dashboard range ${context.from} to ${context.to} with the latest inventory snapshot and recent sales velocity in that window.`,
      }
    },
    toolNames: ["inventory_risk", "product_performance"],
  },
  "last-7-days-commercial-review": {
    allowWorker: false,
    executionMode: "tools",
    resolveContext(context, options) {
      const today = resolveAnchorDateIso(options)
      const from = addUtcDays(today, -6)
      return {
        context: {
          ...context,
          compare: "previous_period",
          from,
          to: today,
        },
        note: `Runbook scope: trailing 7 days (${from} to ${today}), compared with the prior 7 days.`,
      }
    },
    toolNames: [
      "overview_summary",
      "traffic_conversion",
      "paid_media_summary",
      "product_performance",
      "email_performance",
      "inventory_risk",
    ],
  },
  "last-month-board-summary": {
    allowWorker: false,
    executionMode: "tools",
    resolveContext(context, options) {
      const previousMonthAnchor = shiftIsoDateByMonths(
        resolveAnchorDateIso(options),
        -1
      )
      const from = startOfIsoMonth(previousMonthAnchor)
      const to = endOfIsoMonth(previousMonthAnchor)
      return {
        context: {
          ...context,
          compare: "previous_period",
          from,
          to,
        },
        note: `Runbook scope: last full calendar month (${from} to ${to}), compared with the prior full calendar month.`,
      }
    },
    toolNames: [
      "overview_summary",
      "traffic_conversion",
      "paid_media_summary",
      "product_performance",
      "inventory_risk",
      "email_performance",
    ],
  },
  "paid-media-diagnostics": {
    allowWorker: true,
    executionMode: "tools",
    resolveContext(context) {
      return {
        context: {
          ...context,
          compare: "previous_period",
        },
        note: `Runbook scope: current dashboard range ${context.from} to ${context.to}, compared with the previous equivalent period.`,
      }
    },
    toolNames: [
      "paid_media_summary",
      "overview_summary",
      "traffic_conversion",
      "data_freshness",
    ],
  },
  "product-and-merchandising-performance": {
    allowWorker: true,
    executionMode: "tools",
    resolveContext(context) {
      return {
        context: {
          ...context,
          compare: "previous_period",
        },
        note: `Runbook scope: current dashboard range ${context.from} to ${context.to}, compared with the previous equivalent period.`,
      }
    },
    toolNames: [
      "product_performance",
      "overview_summary",
      "inventory_risk",
      "traffic_conversion",
    ],
  },
}

const RUNBOOK_RELEASE_GATES_PATH = path.join(
  process.cwd(),
  "artifacts",
  "agent-lab",
  "runbook-release-gates.json"
)

const PRESET_MINIMUM_SCORE: Record<AgentPresetId, number> = {
  "anomaly-and-issue-scan": 8,
  "daily-trading-pulse": 8,
  "email-and-retention-performance": 8,
  "inventory-risk-and-missed-revenue": 8,
  "last-7-days-commercial-review": 8,
  "last-month-board-summary": 8,
  "paid-media-diagnostics": 8,
  "product-and-merchandising-performance": 8,
}

let cachedRunbooks: ParsedRunbookDoc[] | null = null
let cachedRunbookReleaseGateFile: RunbookReleaseGateFile | null = null
let hasLoadedRunbookReleaseGateFile = false

function readRunbookMarkdown() {
  const filePath = path.join(process.cwd(), "docs", "ecomdash2", "agent-runbooks.md")
  return readFileSync(filePath, "utf8")
}

function parseRunbookMarkdown(markdown: string): ParsedRunbookDoc[] {
  const sections = Array.from(
    markdown.matchAll(
      /^# Runbook \d+: (.+)\r?\n([\s\S]*?)(?=^---\s*$|^## Suggested UI ordering|^## Implementation note|\Z)/gm
    )
  )

  const runbooks = sections.map((match) => {
    const label = String(match[1] ?? "").trim()
    const body = String(match[2] ?? "")
    const idMatch = body.match(/\*\*Internal name:\*\*\s*`([^`]+)`/)
    const descriptionMatch = body.match(
      /\*\*Recommended UI description:\*\*\s*\r?\n([^\n]+)/
    )
    const promptMatch = body.match(/\*\*Prompt:\*\*\s*\r?\n\r?\n```text\r?\n([\s\S]*?)```/)
    const id = String(idMatch?.[1] ?? "").trim() as AgentPresetId
    const description = String(descriptionMatch?.[1] ?? "").trim()
    const prompt = String(promptMatch?.[1] ?? "").trim()

    if (!id || !(id in PRESET_RUNTIME)) {
      throw new Error(`Unknown or missing runbook internal name for "${label}".`)
    }

    if (!description) {
      throw new Error(`Missing UI description for runbook "${id}".`)
    }

    if (!prompt) {
      throw new Error(`Missing prompt body for runbook "${id}".`)
    }

    return {
      description,
      id,
      label,
      prompt,
    }
  })

  if (runbooks.length !== Object.keys(PRESET_RUNTIME).length) {
    throw new Error(
      `Expected ${Object.keys(PRESET_RUNTIME).length} runbooks but parsed ${runbooks.length} from docs/ecomdash2/agent-runbooks.md.`
    )
  }

  return runbooks
}

function loadRunbooks() {
  if (!cachedRunbooks) {
    cachedRunbooks = parseRunbookMarkdown(readRunbookMarkdown())
  }

  return cachedRunbooks
}

function isAgentPresetId(value: string): value is AgentPresetId {
  return value in PRESET_RUNTIME
}

function parseGateRecord(entry: unknown): RunbookReleaseGateRecord | null {
  if (!entry || typeof entry !== "object") {
    return null
  }

  const value = entry as Record<string, unknown>
  const presetId = String(value.presetId ?? "").trim()
  const threshold = Number(value.threshold)
  const lastScore = Number(value.lastScore)
  const ready = Boolean(value.ready)
  const evaluatedAt = String(value.evaluatedAt ?? "").trim()
  const reportPath = String(value.reportPath ?? "").trim()

  if (
    !isAgentPresetId(presetId) ||
    !Number.isFinite(threshold) ||
    !Number.isFinite(lastScore) ||
    !evaluatedAt ||
    !reportPath
  ) {
    return null
  }

  return {
    evaluatedAt,
    lastScore,
    presetId,
    ready,
    reportPath,
    threshold,
  }
}

function readRunbookReleaseGateFile() {
  if (hasLoadedRunbookReleaseGateFile) {
    return cachedRunbookReleaseGateFile
  }

  hasLoadedRunbookReleaseGateFile = true

  try {
    const raw = readFileSync(RUNBOOK_RELEASE_GATES_PATH, "utf8").replace(
      /^\uFEFF/,
      ""
    )
    const parsed = JSON.parse(raw) as {
      generatedAt?: unknown
      gates?: unknown[]
    }
    const generatedAt = String(parsed.generatedAt ?? "").trim()
    const gates = Array.isArray(parsed.gates)
      ? parsed.gates
          .map((entry) => parseGateRecord(entry))
          .filter((entry): entry is RunbookReleaseGateRecord => entry !== null)
      : []

    cachedRunbookReleaseGateFile = generatedAt ? { generatedAt, gates } : null
  } catch {
    cachedRunbookReleaseGateFile = null
  }

  return cachedRunbookReleaseGateFile
}

function getLatestGateByPresetId() {
  const gateFile = readRunbookReleaseGateFile()
  const latestGateByPresetId = new Map<AgentPresetId, RunbookReleaseGateRecord>()

  if (!gateFile) {
    return latestGateByPresetId
  }

  for (const gate of gateFile.gates) {
    const existing = latestGateByPresetId.get(gate.presetId)
    if (!existing || gate.evaluatedAt > existing.evaluatedAt) {
      latestGateByPresetId.set(gate.presetId, gate)
    }
  }

  return latestGateByPresetId
}

export function getPresetReleaseScoreThreshold(presetId: AgentPresetId) {
  return PRESET_MINIMUM_SCORE[presetId]
}

export function evaluatePresetReleaseGate(
  presetId: AgentPresetId,
  gateRecord?: RunbookReleaseGateRecord
): AgentPresetReleaseGateStatus {
  const threshold = getPresetReleaseScoreThreshold(presetId)

  if (!gateRecord) {
    return {
      evaluatedAt: null,
      lastScore: null,
      ready: false,
      reportPath: null,
      status: "not_evaluated",
      threshold,
    }
  }

  const ready = gateRecord.lastScore >= threshold

  return {
    evaluatedAt: gateRecord.evaluatedAt,
    lastScore: gateRecord.lastScore,
    ready,
    reportPath: gateRecord.reportPath,
    status: ready ? "ready" : "blocked",
    threshold,
  }
}

function buildPresetDefinition(
  runbook: ParsedRunbookDoc,
  gateRecord?: RunbookReleaseGateRecord
): AgentPresetDefinition {
  const runtime = PRESET_RUNTIME[runbook.id]

  return {
    allowWorker: runtime.allowWorker,
    defaultMessage: runbook.prompt,
    description: runbook.description,
    executionMode: runtime.executionMode,
    id: runbook.id,
    label: runbook.label,
    releaseGate: evaluatePresetReleaseGate(runbook.id, gateRecord),
    resolveContext: runtime.resolveContext,
    titleSeed: runbook.label,
    toolNames: runtime.toolNames,
  }
}

export type { AgentPresetDefinition }

export function listAgentPresets(
  options?: ListAgentPresetsOptions
): AgentPresetDefinition[] {
  const latestGateByPresetId = getLatestGateByPresetId()
  const presets = loadRunbooks().map((runbook) =>
    buildPresetDefinition(runbook, latestGateByPresetId.get(runbook.id))
  )

  if (!options?.enforceProductionReadiness) {
    return presets
  }

  return presets.filter((preset) => preset.releaseGate.status === "ready")
}

export function getAgentPreset(presetId: AgentPresetId): AgentPresetDefinition {
  const runbook = loadRunbooks().find((entry) => entry.id === presetId)
  const latestGateByPresetId = getLatestGateByPresetId()

  if (!runbook) {
    throw new Error(`Unknown runbook preset "${presetId}".`)
  }

  return buildPresetDefinition(runbook, latestGateByPresetId.get(runbook.id))
}
