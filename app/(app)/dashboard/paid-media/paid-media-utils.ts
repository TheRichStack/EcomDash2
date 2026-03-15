import type {
  PaidMediaProfitProxyConfidence,
  PaidMediaTargetFormattingConfig,
  PaidMediaTotals,
} from "@/types/backend"
import type { DashboardCompareMode } from "@/types/dashboard"
import type {
  EcomDashMetricId,
  MetricDefinition,
  MetricDirection,
  MetricUnit,
} from "@/types/metrics"

export type MetricDeltaBadge = {
  label: string
  variant: "secondary" | "outline"
}

export type TargetCellState =
  | "on_target"
  | "near_target"
  | "off_target"
  | "none"

export function humanizePaidMediaToken(value: string) {
  return String(value ?? "")
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function formatPaidMediaDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`))
}

export function formatPaidMediaDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`))
}

export function formatPaidMediaDateRange(range: {
  from: string
  to: string
}) {
  if (range.from === range.to) {
    return formatPaidMediaDate(range.from)
  }

  const fromDate = new Date(`${range.from}T00:00:00.000Z`)
  const toDate = new Date(`${range.to}T00:00:00.000Z`)
  const sameMonth =
    fromDate.getUTCFullYear() === toDate.getUTCFullYear() &&
    fromDate.getUTCMonth() === toDate.getUTCMonth()

  if (sameMonth) {
    const monthYear = new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "numeric",
    }).format(fromDate)

    return `${fromDate.getUTCDate()}-${toDate.getUTCDate()} ${monthYear}`
  }

  return `${formatPaidMediaDate(range.from)} - ${formatPaidMediaDate(range.to)}`
}

export function compareLabel(compare: DashboardCompareMode) {
  switch (compare) {
    case "previous_year":
      return "Previous year"
    case "previous_period":
      return "Previous period"
    case "none":
    default:
      return null
  }
}

export function formatPaidMediaMetricValue(
  unit: MetricUnit,
  value: number,
  currency: string
) {
  if (unit === "currency") {
    const magnitude = Math.abs(value)

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: magnitude < 100 ? 2 : 0,
      maximumFractionDigits: magnitude < 100 ? 2 : 0,
    }).format(value)
  }

  if (unit === "count") {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(value)
  }

  if (unit === "percent") {
    return `${value.toFixed(1)}%`
  }

  return `${value.toFixed(2)}x`
}

export function getPaidMediaMetricValue(
  metricId: EcomDashMetricId,
  totals: PaidMediaTotals
) {
  switch (metricId) {
    case "blended_ad_spend":
      return totals.spend
    case "platform_attributed_revenue":
      return totals.attributedRevenue
    case "paid_purchases":
      return totals.purchases
    case "paid_roas":
      return totals.roas
    case "paid_cpa":
      return totals.cpa
    case "mer":
      return totals.mer
    default:
      return 0
  }
}

export function getPaidMediaMetricDefinition(
  metricMap: Map<string, MetricDefinition>,
  metricId: EcomDashMetricId
) {
  return (
    metricMap.get(metricId) ?? {
      id: metricId,
      label: humanizePaidMediaToken(metricId),
      description: "No description available.",
      unit: "currency",
      direction: "neutral",
      formulaReadable: "",
      formulaTokens: [],
      dependencies: [],
      sources: [],
      isBase: false,
    }
  )
}

export function formatPaidMediaMetricDelta(
  metric: Pick<MetricDefinition, "unit" | "direction">,
  currentValue: number,
  comparisonValue: number | null,
  currency: string
): MetricDeltaBadge | null {
  if (comparisonValue === null) {
    return null
  }

  const rawDelta = currentValue - comparisonValue

  if (!Number.isFinite(rawDelta)) {
    return null
  }

  if (metric.unit === "ratio" || metric.unit === "percent") {
    const label =
      rawDelta === 0
        ? "Flat"
        : `${rawDelta > 0 ? "+" : ""}${formatPaidMediaMetricValue(
            metric.unit,
            rawDelta,
            currency
          )}`

    return {
      label,
      variant: metricDeltaVariant(metric.direction, rawDelta),
    }
  }

  if (comparisonValue <= 0) {
    return {
      label: currentValue > 0 ? "New" : "Flat",
      variant: metricDeltaVariant(metric.direction, currentValue),
    }
  }

  const deltaPct = (rawDelta / Math.abs(comparisonValue)) * 100

  if (!Number.isFinite(deltaPct) || Math.abs(deltaPct) < 0.1) {
    return {
      label: "Flat",
      variant: "outline",
    }
  }

  return {
    label: `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%`,
    variant: metricDeltaVariant(metric.direction, deltaPct),
  }
}

function metricDeltaVariant(
  direction: MetricDirection,
  delta: number
): MetricDeltaBadge["variant"] {
  if (!Number.isFinite(delta) || delta === 0) {
    return "outline"
  }

  if (direction === "lower_is_better") {
    return delta < 0 ? "secondary" : "outline"
  }

  return delta > 0 ? "secondary" : "outline"
}

export function formatPaidMediaPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-"
  }

  return `${value.toFixed(2)}%`
}

export function formatPaidMediaRatio(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-"
  }

  return `${value.toFixed(2)}x`
}

export function formatPaidMediaNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-"
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)
}

export function confidenceBadgeClass(
  confidence: PaidMediaProfitProxyConfidence | undefined
) {
  if (confidence === "high") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
  }

  if (confidence === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
  }

  return "border-border bg-muted/45 text-muted-foreground"
}

export function confidenceShort(
  confidence: PaidMediaProfitProxyConfidence | undefined
) {
  if (confidence === "high") {
    return "H"
  }

  if (confidence === "medium") {
    return "M"
  }

  return "L"
}

export function evaluateTargetState(
  value: number | null,
  target: number | null,
  direction: "higher_is_better" | "lower_is_better",
  formatting: PaidMediaTargetFormattingConfig
): TargetCellState {
  if (value === null || target === null || target <= 0) {
    return "none"
  }

  const inRangePct = clamp(formatting.inRangePct, 0, 5)
  const farOutPct = clamp(
    Math.max(formatting.farOutPct, formatting.inRangePct),
    inRangePct,
    5
  )

  if (direction === "higher_is_better") {
    const greenMin = target * (1 - inRangePct)
    const orangeMin = target * (1 - farOutPct)

    if (value >= greenMin) {
      return "on_target"
    }

    if (value >= orangeMin) {
      return "near_target"
    }

    return "off_target"
  }

  const greenMax = target * (1 + inRangePct)
  const orangeMax = target * (1 + farOutPct)

  if (value <= greenMax) {
    return "on_target"
  }

  if (value <= orangeMax) {
    return "near_target"
  }

  return "off_target"
}

export function targetCellClass(
  state: TargetCellState,
  formatting: PaidMediaTargetFormattingConfig
) {
  const base = "text-right tabular-nums"

  if (formatting.source === "none" || state === "none") {
    return base
  }

  if (state === "on_target") {
    return `${base} bg-emerald-50/70 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200`
  }

  if (state === "near_target") {
    return `${base} bg-amber-50/70 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-200`
  }

  return `${base} bg-rose-50/70 font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-200`
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}
