import type {
  BackfillRun,
  BudgetPlanMonthly,
  JobRun,
  SkuCost,
  SyncState,
} from "@/types/backend"
import type { MetricCatalogEntry, MetricDefinition } from "@/types/metrics"

export type SettingsBadgeTone = "secondary" | "outline" | "destructive"

export type SyncSourceSummary = {
  sourceKey: string
  updatedAt: string
  stateCount: number
  statusLabel: string
  preview: Array<{
    label: string
    value: string
  }>
}

export type SettingsOperation = {
  id: string
  type: "Job" | "Backfill"
  name: string
  status: string
  startedAt: string
  finishedAt: string
  message: string
}

export type BudgetMonthSummary = {
  month: string
  totalBudget: number
  channelCount: number
  channels: string[]
  noteCount: number
}

export type SkuCoverageSummary = {
  totalRows: number
  overrideRows: SkuCost[]
  overrideCount: number
  shopifyCostCount: number
  missingCostCount: number
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_ONLY_PATTERN = /^\d{4}-\d{2}$/

function parseDateValue(value: string) {
  const text = String(value ?? "").trim()

  if (!text) {
    return null
  }

  const normalized = DATE_ONLY_PATTERN.test(text) ? `${text}T00:00:00Z` : text
  const parsed = new Date(normalized)

  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toTimestamp(value: string) {
  return parseDateValue(value)?.getTime() ?? 0
}

function compactValue(value: string) {
  const text = String(value ?? "").trim()

  if (!text) {
    return "Not reported"
  }

  if (
    (text.startsWith("{") && text.endsWith("}")) ||
    (text.startsWith("[") && text.endsWith("]"))
  ) {
    return "Structured payload"
  }

  return text.length > 56 ? `${text.slice(0, 53)}...` : text
}

export function humanizeToken(value: string) {
  return String(value ?? "")
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => {
      if (part.toUpperCase() === part) {
        return part
      }

      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(" ")
}

export function formatSettingsNumber(
  value: number,
  maximumFractionDigits = 0
) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value)
}

export function formatSettingsPercent(value: number) {
  const hasFraction = !Number.isInteger(value)

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: hasFraction ? 1 : 0,
  }).format(value)}%`
}

export function formatSettingsCurrency(value: number, currency: string) {
  const hasFraction = !Number.isInteger(value)

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(value)
}

export function formatSettingsDate(value: string) {
  const date = parseDateValue(value)

  if (!date) {
    return "Not available"
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

export function formatSettingsDateTime(value: string) {
  const date = parseDateValue(value)

  if (!date) {
    return "Not available"
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

export function formatSettingsDateRange(startDate: string, endDate: string) {
  return `${formatSettingsDate(startDate)} to ${formatSettingsDate(endDate)}`
}

export function formatRelativeTime(value: string) {
  const date = parseDateValue(value)

  if (!date) {
    return "Not available"
  }

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000)
  const relativeTimeFormat = new Intl.RelativeTimeFormat("en", {
    numeric: "auto",
  })
  const divisions: Array<{
    amount: number
    unit: Intl.RelativeTimeFormatUnit
  }> = [
    { amount: 60, unit: "second" },
    { amount: 60, unit: "minute" },
    { amount: 24, unit: "hour" },
    { amount: 7, unit: "day" },
    { amount: 4.34524, unit: "week" },
    { amount: 12, unit: "month" },
    { amount: Number.POSITIVE_INFINITY, unit: "year" },
  ]

  let duration = diffSeconds

  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return relativeTimeFormat.format(Math.round(duration), division.unit)
    }

    duration /= division.amount
  }

  return relativeTimeFormat.format(Math.round(duration), "year")
}

export function getStatusTone(value: string): SettingsBadgeTone {
  const normalized = String(value ?? "").toLowerCase()

  if (
    normalized.includes("error") ||
    normalized.includes("fail") ||
    normalized.includes("invalid") ||
    normalized.includes("missing") ||
    normalized.includes("stale") ||
    normalized.includes("unavailable")
  ) {
    return "destructive"
  }

  if (
    normalized.includes("ready") ||
    normalized.includes("healthy") ||
    normalized.includes("success") ||
    normalized.includes("synced") ||
    normalized.includes("connected") ||
    normalized.includes("present") ||
    normalized.includes("applied") ||
    normalized.includes("configured") ||
    normalized.includes("active")
  ) {
    return "secondary"
  }

  return "outline"
}

export function getFreshnessTone(value: string): SettingsBadgeTone {
  const timestamp = toTimestamp(value)

  if (!timestamp) {
    return "destructive"
  }

  const ageInHours = (Date.now() - timestamp) / (1000 * 60 * 60)

  if (ageInHours <= 24) {
    return "secondary"
  }

  if (ageInHours <= 72) {
    return "outline"
  }

  return "destructive"
}

export function summarizeSyncSources(rows: SyncState[]): SyncSourceSummary[] {
  const groups = new Map<string, SyncState[]>()

  for (const row of rows) {
    const group = groups.get(row.sourceKey) ?? []
    group.push(row)
    groups.set(row.sourceKey, group)
  }

  return Array.from(groups.entries())
    .map(([sourceKey, sourceRows]) => {
      const sortedRows = [...sourceRows].sort(
        (left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt)
      )
      const statusRow =
        sortedRows.find((row) =>
          /status|state|health|result/i.test(row.stateKey)
        ) ?? sortedRows[0]
      const preview = sortedRows.slice(0, 3).map((row) => ({
        label: humanizeToken(row.stateKey),
        value: compactValue(row.stateValue),
      }))

      return {
        sourceKey,
        updatedAt: sortedRows[0]?.updatedAt ?? "",
        stateCount: sortedRows.length,
        statusLabel: compactValue(statusRow?.stateValue ?? ""),
        preview,
      }
    })
    .sort((left, right) => {
      const freshnessOrder =
        toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt)

      if (freshnessOrder !== 0) {
        return freshnessOrder
      }

      return left.sourceKey.localeCompare(right.sourceKey)
    })
}

export function summarizeOperations(
  jobRuns: JobRun[],
  backfillRuns: BackfillRun[]
): SettingsOperation[] {
  return [
    ...jobRuns.map((run) => ({
      id: run.runId,
      type: "Job" as const,
      name: humanizeToken(run.jobName),
      status: compactValue(run.status),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      message: compactValue(run.message),
    })),
    ...backfillRuns.map((run) => ({
      id: run.runId,
      type: "Backfill" as const,
      name: humanizeToken(run.sourceKey || "Backfill"),
      status: compactValue(run.status),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      message: compactValue(run.message || run.cursorDate),
    })),
  ].sort(
    (left, right) => toTimestamp(right.startedAt) - toTimestamp(left.startedAt)
  )
}

export function summarizeBudgetMonths(
  rows: BudgetPlanMonthly[]
): BudgetMonthSummary[] {
  const grouped = new Map<string, BudgetMonthSummary>()

  for (const row of rows) {
    const monthKey = String(row.month ?? "").trim().slice(0, 7)

    if (!monthKey) {
      continue
    }

    const existing = grouped.get(monthKey) ?? {
      month: monthKey,
      totalBudget: 0,
      channelCount: 0,
      channels: [],
      noteCount: 0,
    }
    const channels = new Set(existing.channels)

    channels.add(row.channel)

    grouped.set(monthKey, {
      month: monthKey,
      totalBudget: existing.totalBudget + row.budget,
      channelCount: channels.size,
      channels: Array.from(channels).sort((left, right) =>
        left.localeCompare(right)
      ),
      noteCount: existing.noteCount + (row.notes.trim() ? 1 : 0),
    })
  }

  return Array.from(grouped.values()).sort((left, right) =>
    left.month.localeCompare(right.month)
  )
}

export function formatMonthLabel(value: string) {
  const text = String(value ?? "").trim()

  if (!text) {
    return "Not available"
  }

  if (MONTH_ONLY_PATTERN.test(text)) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "numeric",
    }).format(new Date(`${text}-01T00:00:00Z`))
  }

  return formatSettingsDate(text)
}

export function summarizeSkuCosts(rows: SkuCost[]): SkuCoverageSummary {
  const overrideRows = rows.filter((row) => row.overrideUnitCost !== null)
  const shopifyCostCount = rows.filter((row) => row.shopifyCost !== null).length
  const missingCostCount = rows.filter(
    (row) => row.overrideUnitCost === null && row.shopifyCost === null
  ).length

  return {
    totalRows: rows.length,
    overrideRows,
    overrideCount: overrideRows.length,
    shopifyCostCount,
    missingCostCount,
  }
}

export function buildMetricLabelMap(
  runtimeRegistry: MetricDefinition[],
  catalogEntries: MetricCatalogEntry[]
) {
  const labels = new Map<string, string>()

  for (const entry of catalogEntries) {
    labels.set(entry.id, entry.label)
  }

  for (const metric of runtimeRegistry) {
    if (!labels.has(metric.id)) {
      labels.set(metric.id, metric.label)
    }
  }

  return Object.fromEntries(labels)
}

export function formatMetricLabelList(
  metricIds: string[],
  labelMap: Record<string, string>
) {
  return metricIds.map((metricId) => labelMap[metricId] ?? humanizeToken(metricId))
}
