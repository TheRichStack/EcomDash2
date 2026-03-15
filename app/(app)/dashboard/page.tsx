import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import {
  OverviewChannelShareChart,
  type OverviewChannelShareDatum,
} from "./overview-channel-share-chart"
import { OverviewDailyTrend } from "./overview-daily-trend"

import { EmptyState } from "@/components/shared/empty-state"
import { KpiCard } from "@/components/shared/kpi-card"
import { MetricHelpHoverCard } from "@/components/shared/metric-help-hover-card"
import { SectionHeader } from "@/components/shared/section-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { safeDivide } from "@/lib/metrics/formulas"
import { listMetrics } from "@/lib/metrics/registry"
import {
  buildDashboardHref,
  resolveDashboardRequestContext,
} from "@/lib/dashboard-state"
import { resolveDashboardSession } from "@/lib/dashboard-session"
import { ROUTES } from "@/lib/constants"
import { loadOverviewSlice } from "@/lib/server/loaders/overview"
import type {
  KlaviyoCampaign,
  KlaviyoFlow,
  OverviewCreativeSnapshot,
  OverviewPacingRow,
  OverviewSnapshotRow,
} from "@/types/backend"
import type { DashboardCompareMode } from "@/types/dashboard"
import type { EcomDashMetricId, MetricDefinition } from "@/types/metrics"

type DashboardSearchParamsRecord = Record<string, string | string[] | undefined>

type OverviewPageProps = {
  searchParams?: Promise<DashboardSearchParamsRecord>
}

type EmailPerformanceSummary = {
  label: string
  revenue: number
  sends: number
  openRate: number
  clickRate: number
}

type DeltaTone = "positive" | "negative" | "neutral"

function humanizeMetricId(metricId: string) {
  return metricId
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatDateRange(range: { from: string; to: string }) {
  if (range.from === range.to) {
    return formatDate(range.from)
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

  return `${formatDate(range.from)} - ${formatDate(range.to)}`
}

function formatMetricValue(
  metric: Pick<MetricDefinition, "unit">,
  value: number,
  currency: string
) {
  if (metric.unit === "currency") {
    const magnitude = Math.abs(value)

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: magnitude < 100 ? 2 : 0,
      maximumFractionDigits: magnitude < 100 ? 2 : 0,
    }).format(value)
  }

  if (metric.unit === "count") {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(value)
  }

  if (metric.unit === "percent") {
    return `${value.toFixed(1)}%`
  }

  return `${value.toFixed(2)}x`
}

function formatMetricDelta(
  metric: Pick<MetricDefinition, "unit">,
  currentValue: number,
  comparisonValue: number | null,
  currency: string
) {
  if (comparisonValue === null) {
    return null
  }

  if (metric.unit === "ratio" || metric.unit === "percent") {
    const delta = currentValue - comparisonValue
    const sign = delta > 0 ? "+" : delta < 0 ? "-" : ""

    return `${sign}${formatMetricValue(metric, Math.abs(delta), currency)}`
  }

  if (comparisonValue <= 0) {
    return currentValue > 0 ? "New" : "Flat"
  }

  const deltaPct = ((currentValue - comparisonValue) / comparisonValue) * 100

  if (!Number.isFinite(deltaPct)) {
    return null
  }

  if (Math.abs(deltaPct) < 0.1) {
    return "Flat"
  }

  return `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%`
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function normalizeChannelColorKey(platform: string) {
  const normalized = platform
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  if (!normalized) {
    return "other"
  }

  if (
    normalized.includes("meta") ||
    normalized.includes("facebook") ||
    normalized.includes("instagram")
  ) {
    return "meta"
  }

  if (normalized.includes("google") || normalized.includes("youtube")) {
    return "google"
  }

  if (normalized.includes("tiktok")) {
    return "tiktok"
  }

  if (normalized.includes("email") || normalized.includes("klaviyo")) {
    return "email"
  }

  if (normalized.includes("other") || normalized.includes("unknown")) {
    return "other"
  }

  return normalized
}

function getStableChannelColor(channelKey: string) {
  switch (channelKey) {
    case "meta":
      return "var(--color-chart-1)"
    case "google":
      return "var(--color-chart-2)"
    case "tiktok":
      return "var(--color-chart-3)"
    case "email":
      return "var(--color-chart-4)"
    case "other":
      return "var(--color-chart-5)"
    default: {
      const fallbackPalette = [
        "var(--color-chart-5)",
        "var(--color-chart-4)",
        "var(--color-chart-3)",
        "var(--color-chart-2)",
        "var(--color-chart-1)",
      ] as const

      let hash = 0

      for (const character of channelKey) {
        hash = (hash * 31 + character.charCodeAt(0)) >>> 0
      }

      return fallbackPalette[hash % fallbackPalette.length]
    }
  }
}

function formatSignedPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null
  }

  if (Math.abs(value) < 0.1) {
    return "Flat"
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
}

function compareLabel(compare: DashboardCompareMode) {
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

function resolveDeltaTone(
  rawDelta: number,
  direction: MetricDefinition["direction"]
): DeltaTone {
  if (!Number.isFinite(rawDelta) || rawDelta === 0) {
    return "neutral"
  }

  if (direction === "lower_is_better") {
    return rawDelta < 0 ? "positive" : "negative"
  }

  if (direction === "higher_is_better") {
    return rawDelta > 0 ? "positive" : "negative"
  }

  return rawDelta > 0 ? "positive" : "negative"
}

function getOverviewMetricDeltaTone(
  metric: Pick<MetricDefinition, "direction">,
  currentValue: number,
  comparisonValue: number | null,
  deltaLabel: string | null
): DeltaTone {
  if (comparisonValue === null || !deltaLabel || deltaLabel === "Flat") {
    return "neutral"
  }

  if (deltaLabel === "New") {
    return metric.direction === "lower_is_better" ? "negative" : "positive"
  }

  return resolveDeltaTone(currentValue - comparisonValue, metric.direction)
}

function getDeltaBadgeClassName(tone: DeltaTone) {
  switch (tone) {
    case "positive":
      return "delta-badge-positive"
    case "negative":
      return "delta-badge-negative"
    case "neutral":
    default:
      return "delta-badge-neutral"
  }
}

function getOverviewMetricValue(
  metricId: EcomDashMetricId,
  totals: Awaited<
    ReturnType<typeof loadOverviewSlice>
  >["selectedRange"]["totals"]
) {
  switch (metricId) {
    case "shopify_net_revenue":
    case "total_sales":
      return totals.revenue
    case "blended_ad_spend":
      return totals.adSpend
    case "orders_count":
      return totals.orders
    case "cogs":
      return totals.cogs
    case "allocated_overhead":
      return totals.allocatedOverhead
    case "aov":
      return totals.aov
    case "mer":
      return totals.mer
    case "gross_profit":
      return totals.grossProfit
    case "net_profit_after_ads":
      return totals.netProfitAfterAds
    case "contribution_margin":
      return totals.contributionMargin
    case "net_profit":
      return totals.netProfit
    default:
      return 0
  }
}

function summarizeEmailGroup(
  label: string,
  rows: Array<KlaviyoCampaign | KlaviyoFlow>
): EmailPerformanceSummary {
  const revenue = rows.reduce((total, row) => total + row.revenue, 0)
  const sends = rows.reduce((total, row) => total + row.sends, 0)
  const delivered = rows.reduce((total, row) => total + row.delivered, 0)
  const uniqueOpens = rows.reduce((total, row) => total + row.uniqueOpens, 0)
  const uniqueClicks = rows.reduce((total, row) => total + row.uniqueClicks, 0)

  return {
    label,
    revenue,
    sends,
    openRate: safeDivide(uniqueOpens, delivered),
    clickRate: safeDivide(uniqueClicks, delivered),
  }
}

function getMetricDefinition(
  metricMap: Map<string, MetricDefinition>,
  metricId: EcomDashMetricId
) {
  return (
    metricMap.get(metricId) ?? {
      id: metricId,
      label: humanizeMetricId(metricId),
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

function getPacingVisual(row: OverviewPacingRow) {
  const expectedMagnitude = Math.max(Math.abs(row.expectedToDate), 1)
  const expectedMarkerPosition = 54
  const markerSwing = 34
  const relativeVariance =
    (row.actualToDate - row.expectedToDate) / expectedMagnitude
  const actualMarkerPosition = Math.min(
    92,
    Math.max(8, expectedMarkerPosition + relativeVariance * markerSwing)
  )

  return {
    actualMarkerPosition,
    bridgeStart: Math.min(expectedMarkerPosition, actualMarkerPosition),
    bridgeWidth: Math.abs(actualMarkerPosition - expectedMarkerPosition),
    expectedMarkerPosition,
  }
}

function getPacingTone(
  metric: Pick<MetricDefinition, "direction">,
  row: Pick<OverviewPacingRow, "actualToDate" | "expectedToDate">
): DeltaTone {
  const threshold = Math.max(Math.abs(row.expectedToDate), 1) * 0.03
  const delta = row.actualToDate - row.expectedToDate

  if (Math.abs(delta) <= threshold) {
    return "neutral"
  }

  return resolveDeltaTone(delta, metric.direction)
}

function getPacingToneStyles(tone: DeltaTone) {
  switch (tone) {
    case "positive":
      return {
        bridgeColor: "var(--color-chart-2)",
        dotColor: "var(--color-chart-4)",
        labelClassName: "text-chart-4/80",
      }
    case "negative":
      return {
        bridgeColor:
          "color-mix(in oklab, var(--color-destructive) 70%, transparent)",
        dotColor: "var(--color-destructive)",
        labelClassName: "text-destructive/80",
      }
    case "neutral":
    default:
      return {
        bridgeColor: "var(--color-border)",
        dotColor: "var(--color-muted-foreground)",
        labelClassName: "text-muted-foreground",
      }
  }
}

function formatPaceRatioLabel(
  row: Pick<OverviewPacingRow, "actualToDate" | "expectedToDate">
) {
  if (row.expectedToDate > 0) {
    const ratio = row.actualToDate / row.expectedToDate

    if (!Number.isFinite(ratio)) {
      return "Expected unavailable"
    }

    if (Math.abs(ratio - 1) < 0.03) {
      return "At pace"
    }

    if (ratio < 0) {
      return "Behind expected"
    }

    if (ratio < 0.01) {
      return "<0.01x expected"
    }

    return `${ratio.toFixed(ratio >= 1 ? 1 : 2)}x expected`
  }

  const variance = safeDivide(
    row.actualToDate - row.expectedToDate,
    Math.max(Math.abs(row.expectedToDate), 1)
  )

  if (!Number.isFinite(variance) || Math.abs(variance) < 0.03) {
    return "At pace"
  }

  return variance > 0
    ? `${Math.abs(variance * 100).toFixed(0)}% ahead`
    : `${Math.abs(variance * 100).toFixed(0)}% behind`
}

function buildSnapshotSupportText(
  row: OverviewSnapshotRow,
  comparisonText: string | null,
  currency: string
) {
  if (!comparisonText || row.comparisonRevenue === null) {
    return "No comparison selected."
  }

  return `${comparisonText} revenue ${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(row.comparisonRevenue)}`
}

function getMonthToDateContext(range: { from: string; to: string }) {
  const toDate = new Date(`${range.to}T00:00:00.000Z`)
  const daysIntoMonth = toDate.getUTCDate()

  return `MTD through ${formatDate(range.to)} - ${daysIntoMonth} day${
    daysIntoMonth === 1 ? "" : "s"
  } into month`
}

function formatShortIdentifier(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  return trimmed.length > 12
    ? `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`
    : trimmed
}

function getCreativeDisplay(row: OverviewCreativeSnapshot) {
  const adName = row.adName.trim()
  const headline = row.headline.trim()
  const shortId = formatShortIdentifier(row.creativeId)
  const title =
    adName ||
    headline ||
    (shortId
      ? `${row.platform} creative ${shortId}`
      : `${row.platform} creative`)
  const subtitleParts = [
    adName && headline && headline !== adName ? headline : null,
    row.format || null,
    shortId ? `ID ${shortId}` : null,
  ].filter(Boolean)

  return {
    title,
    subtitle: subtitleParts.join(" - "),
  }
}

type OverviewRankedSummaryRowProps = {
  rank: number
  label: string
  subtitle?: string | null
  badgeLabel?: string | null
  primaryMetric: string
  secondaryText: string
}

function OverviewRankedSummaryRow({
  rank,
  label,
  subtitle,
  badgeLabel,
  primaryMetric,
  secondaryText,
}: OverviewRankedSummaryRowProps) {
  return (
    <div className="rounded-xl border bg-muted/10 p-4">
      <div className="flex items-start gap-3">
        <div className="w-6 shrink-0 pt-0.5 text-[11px] font-medium tracking-wide text-muted-foreground tabular-nums">
          {String(rank).padStart(2, "0")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="line-clamp-2 leading-5 font-medium">{label}</p>
                {badgeLabel ? (
                  <Badge
                    variant="outline"
                    className="border-border/80 bg-background/80 text-muted-foreground"
                  >
                    {badgeLabel}
                  </Badge>
                ) : null}
              </div>
              {subtitle ? (
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {subtitle}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-right text-sm font-semibold tracking-tight tabular-nums sm:text-base">
              {primaryMetric}
            </p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{secondaryText}</p>
        </div>
      </div>
    </div>
  )
}

export default async function OverviewPage({
  searchParams,
}: OverviewPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const session = await resolveDashboardSession()
  const context = resolveDashboardRequestContext({
    session,
    searchParams: resolvedSearchParams,
  })
  const data = await loadOverviewSlice(context)
  const metricMap = new Map(
    listMetrics().map((metric) => [metric.id, metric] as const)
  )
  const dashboardState = {
    workspaceId: context.workspaceId,
    from: context.from,
    to: context.to,
    compare: context.compare,
  }
  const currency = data.settings.currency
  const comparisonText = compareLabel(context.compare)
  const selectedRangeRevenue = data.selectedRange.totals.revenue
  const topProducts = data.selectedRange.topProducts.slice(0, 5)
  const topCreatives = data.selectedRange.topCreatives.slice(0, 5)
  const pacingTimeContext = getMonthToDateContext(data.monthToDate.range)
  const totalEmailRevenue = data.selectedRange.emailSnapshot.totalRevenue
  const totalEmailRevenueShare = safeDivide(
    totalEmailRevenue,
    selectedRangeRevenue
  )
  const emailGroups = [
    summarizeEmailGroup("Campaigns", data.selectedRange.emailCampaigns),
    summarizeEmailGroup("Flows", data.selectedRange.emailFlows),
  ]
  const channelSummaryRows = data.selectedRange.channelSummary
  const channelShareChartData: OverviewChannelShareDatum[] =
    channelSummaryRows.map((row) => {
      const channelColorKey = normalizeChannelColorKey(row.platform)

      return {
        id: row.platform,
        label: row.platform,
        revenue: row.revenue,
        revenueShare: safeDivide(row.revenue, selectedRangeRevenue),
        spend: row.spend,
        purchases: row.purchases,
        mer: safeDivide(row.revenue, row.spend),
        color: getStableChannelColor(channelColorKey),
      }
    })
  const trendMetricOptions = (
    [
      "shopify_net_revenue",
      "blended_ad_spend",
      "net_profit",
      "orders_count",
    ] as const
  ).map((metricId) => {
    const metric = getMetricDefinition(metricMap, metricId)

    return {
      id: metric.id,
      label: metric.label,
      unit: metric.unit,
    }
  })

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div>
        <SectionHeader
          eyebrow="Overview"
          title="Daily performance"
          description={`Trustworthy topline, pacing, and channel reporting for ${formatDateRange(data.selectedRange.range)}.`}
          action={
            <>
              <Button asChild size="sm" variant="outline">
                <Link
                  href={buildDashboardHref(ROUTES.settingsDashboard, context)}
                >
                  Dashboard settings
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link
                  href={buildDashboardHref(
                    ROUTES.settingsInputsTargets,
                    context
                  )}
                >
                  Configure targets
                </Link>
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.settings.overviewKpis.selectedMetricIds.map((metricId) => {
          const metricDefinition = metricMap.get(metricId) ?? null
          const metric = getMetricDefinition(metricMap, metricId)
          const currentValue = getOverviewMetricValue(
            metricId,
            data.selectedRange.totals
          )
          const comparisonValue = data.selectedRange.comparisonTotals
            ? getOverviewMetricValue(
                metricId,
                data.selectedRange.comparisonTotals
              )
            : null
          const deltaLabel = formatMetricDelta(
            metric,
            currentValue,
            comparisonValue,
            currency
          )
          const deltaTone = getOverviewMetricDeltaTone(
            metric,
            currentValue,
            comparisonValue,
            deltaLabel
          )

          return (
            <KpiCard
              key={metricId}
              label={
                <MetricHelpHoverCard
                  label={metric.label}
                  metric={metricDefinition}
                  dashboardState={dashboardState}
                />
              }
              value={formatMetricValue(metric, currentValue, currency)}
              badge={
                deltaLabel
                  ? {
                      label: deltaLabel,
                      variant: "outline",
                      className: getDeltaBadgeClassName(deltaTone),
                    }
                  : null
              }
              note={
                data.selectedRange.overviewRows.length === 0 ? (
                  "No overview rows were returned for the selected range."
                ) : comparisonText && comparisonValue !== null ? (
                  <>
                    <span className="font-medium text-foreground/80">
                      vs {formatMetricValue(metric, comparisonValue, currency)}
                    </span>
                    <span>{comparisonText}</span>
                  </>
                ) : (
                  metric.description
                )
              }
            />
          )
        })}
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-1">
              <CardDescription>Pacing board</CardDescription>
              <CardTitle>Month-to-date actual vs expected</CardTitle>
              <p className="text-sm text-muted-foreground">
                The pace marker compares actual month-to-date performance
                against expected-to-date pace now. The tick marks expected pace,
                the dot shows actual, and the Source column shows whether each
                row is using an explicit target or the previous-month baseline
                fallback.
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {pacingTimeContext}
              </p>
              {data.monthToDate.targetMeta?.lastAppliedAt ? (
                <p className="text-xs text-muted-foreground">
                  Latest target application{" "}
                  {formatDateTime(data.monthToDate.targetMeta.lastAppliedAt)}.
                </p>
              ) : null}
            </div>
            <Button asChild size="sm" variant="outline">
              <Link
                href={buildDashboardHref(ROUTES.settingsInputsTargets, context)}
              >
                <ArrowRightIcon data-icon="inline-start" />
                Configure targets
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-xl border bg-background">
            <Table className="min-w-[720px] md:w-full md:min-w-0 md:table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[23%]">Metric</TableHead>
                  <TableHead className="w-[17%]">Pace</TableHead>
                  <TableHead className="w-[13%] text-right">
                    Actual MTD
                  </TableHead>
                  <TableHead className="w-[13%] text-right">
                    Expected MTD
                  </TableHead>
                  <TableHead className="w-[11%] text-right">Delta</TableHead>
                  <TableHead className="w-[14%] text-right">
                    Forecast EOM
                  </TableHead>
                  <TableHead className="w-[9%] text-right">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.monthToDate.pacingRows.map((row) => {
                  const metric = getMetricDefinition(metricMap, row.metricId)
                  const visual = getPacingVisual(row)
                  const paceTone = getPacingTone(metric, row)
                  const paceToneStyles = getPacingToneStyles(paceTone)
                  const paceRatioLabel = formatPaceRatioLabel(row)
                  const deltaLabel = formatMetricDelta(
                    metric,
                    row.actualToDate,
                    row.expectedToDate,
                    currency
                  )

                  return (
                    <TableRow key={row.metricId}>
                      <TableCell className="align-top whitespace-normal">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="font-medium">{metric.label}</span>
                          <span className="text-xs leading-5 break-words text-muted-foreground">
                            {metric.description}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="align-top whitespace-normal">
                        <div
                          className="flex w-[8.75rem] flex-col gap-1 px-1 py-1"
                          aria-label={`${metric.label} actual pace versus expected pace`}
                        >
                          <div className="relative h-4">
                            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted/80" />
                            <div
                              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
                              style={{
                                left: `${visual.bridgeStart}%`,
                                width: `${visual.bridgeWidth}%`,
                                backgroundColor: paceToneStyles.bridgeColor,
                              }}
                            />
                            <div
                              className="absolute top-1/2 h-3.5 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/55"
                              style={{
                                left: `${visual.expectedMarkerPosition}%`,
                              }}
                            />
                            <div
                              className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background shadow-[0_0_0_1px_var(--color-border)]"
                              style={{
                                left: `${visual.actualMarkerPosition}%`,
                                backgroundColor: paceToneStyles.dotColor,
                              }}
                            />
                          </div>
                          <p
                            className={`text-[11px] leading-none font-medium ${paceToneStyles.labelClassName}`}
                          >
                            {paceRatioLabel}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMetricValue(metric, row.actualToDate, currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMetricValue(
                          metric,
                          row.expectedToDate,
                          currency
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {deltaLabel ?? "Flat"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMetricValue(
                          metric,
                          row.projectedPeriodEnd,
                          currency
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            row.source === "target" ? "secondary" : "outline"
                          }
                          title={row.supportText}
                          aria-label={`${row.sourceLabel}. ${row.supportText}`}
                        >
                          {row.sourceLabel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <CardDescription>Period business snapshot</CardDescription>
          <CardTitle>Compact anchor-date reporting summary</CardTitle>
          <p className="text-sm text-muted-foreground">
            Today, yesterday, last 7 days, and last month in one quiet scan.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.snapshotRows.map((row) => {
            const snapshotDeltaLabel = formatSignedPercent(
              row.comparisonDeltaPct
            )
            const snapshotTone =
              row.comparisonDeltaPct === null ||
              Math.abs(row.comparisonDeltaPct) < 0.1
                ? "neutral"
                : resolveDeltaTone(row.comparisonDeltaPct, "higher_is_better")

            return (
              <div key={row.id} className="rounded-xl border bg-muted/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateRange(row.range)}
                    </p>
                  </div>
                  {snapshotDeltaLabel ? (
                    <Badge
                      variant="outline"
                      className={getDeltaBadgeClassName(snapshotTone)}
                    >
                      {snapshotDeltaLabel}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-3">
                  <div>
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Revenue
                    </p>
                    <p className="mt-1 text-lg font-semibold tracking-tight">
                      {formatMetricValue(
                        { unit: "currency" },
                        row.revenue,
                        currency
                      )}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        Net Profit
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {formatMetricValue(
                          { unit: "currency" },
                          row.netProfit,
                          currency
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        MER
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {formatMetricValue(
                          { unit: "ratio" },
                          row.mer,
                          currency
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {buildSnapshotSupportText(row, comparisonText, currency)}
                  </p>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <OverviewDailyTrend
        currency={currency}
        compareLabel={comparisonText}
        currentRows={data.selectedRange.overviewRows}
        comparisonRows={data.selectedRange.comparisonRows}
        currentTotals={data.selectedRange.totals}
        comparisonTotals={data.selectedRange.comparisonTotals}
        metricOptions={trendMetricOptions}
      />

      <div>
        {channelSummaryRows.length === 0 ? (
          <EmptyState
            title="No channel summary rows"
            description="The selected range did not return any channel data, so the revenue-ranked summary cannot render yet."
          />
        ) : (
          <Card>
            <CardHeader className="gap-1">
              <CardDescription>Channel summary</CardDescription>
              <CardTitle>Revenue-ranked channel comparison</CardTitle>
              <p className="text-sm text-muted-foreground">
                Compact reporting view of the selected range with inline revenue
                mix, spend, purchases, and MER.
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-xl border bg-muted/10 p-4">
                <OverviewChannelShareChart
                  currency={currency}
                  data={channelShareChartData}
                  totalRevenue={data.selectedRange.totals.revenue}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Secondary reporting
          </h2>
          <p className="text-sm text-muted-foreground">
            Products, creative, and email at a glance.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div>
            {topProducts.length === 0 ? (
              <EmptyState
                title="No product activity"
                description="No product sales found for this period."
              />
            ) : (
              <Card>
                <CardHeader className="gap-1">
                  <CardDescription>Revenue leaders by item</CardDescription>
                  <CardTitle>Top products</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 pt-0">
                  {topProducts.map((row, index) => (
                    <OverviewRankedSummaryRow
                      key={`${row.productId || row.sku}:${row.variantName}`}
                      rank={index + 1}
                      label={row.productName || "Untitled product"}
                      subtitle={row.variantName || row.sku || null}
                      primaryMetric={formatMetricValue(
                        { unit: "currency" },
                        row.revenue,
                        currency
                      )}
                      secondaryText={`${formatMetricValue(
                        { unit: "count" },
                        row.quantity,
                        currency
                      )} units sold / ${formatMetricValue(
                        { unit: "currency" },
                        row.grossProfit,
                        currency
                      )} gross profit`}
                    />
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <div>
            {topCreatives.length === 0 ? (
              <EmptyState
                title="No creative activity"
                description="No creative performance found for this period."
              />
            ) : (
              <Card>
                <CardHeader className="gap-1">
                  <CardDescription>Revenue leaders by creative</CardDescription>
                  <CardTitle>Top creatives</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 pt-0">
                  {topCreatives.map((row, index) => {
                    const creative = getCreativeDisplay(row)

                    return (
                      <OverviewRankedSummaryRow
                        key={row.creativeId}
                        rank={index + 1}
                        label={creative.title}
                        subtitle={creative.subtitle || null}
                        badgeLabel={row.platform}
                        primaryMetric={formatMetricValue(
                          { unit: "currency" },
                          row.revenue,
                          currency
                        )}
                        secondaryText={`Spend ${formatMetricValue(
                          { unit: "currency" },
                          row.spend,
                          currency
                        )} / ${formatMetricValue(
                          { unit: "count" },
                          row.purchases,
                          currency
                        )} purchases`}
                      />
                    )
                  })}
                </CardContent>
              </Card>
            )}
          </div>

          <div>
            {data.selectedRange.emailSnapshot.totalRevenue <= 0 &&
            emailGroups.every((group) => group.sends <= 0) ? (
              <EmptyState
                title="No email activity"
                description="No campaign or flow data found for this period."
              />
            ) : (
              <Card>
                <CardHeader className="gap-1">
                  <CardDescription>Campaign and flow mix</CardDescription>
                  <CardTitle>Email snapshot</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 pt-0">
                  <div className="rounded-xl border bg-muted/10 p-4">
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Total email revenue
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">
                      {formatMetricValue(
                        { unit: "currency" },
                        totalEmailRevenue,
                        currency
                      )}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatPercent(totalEmailRevenueShare)} of store revenue.
                    </p>
                  </div>
                  {emailGroups.map((group, index) => (
                    <OverviewRankedSummaryRow
                      key={group.label}
                      rank={index + 1}
                      label={group.label}
                      primaryMetric={formatMetricValue(
                        { unit: "currency" },
                        group.revenue,
                        currency
                      )}
                      secondaryText={`${formatMetricValue(
                        { unit: "count" },
                        group.sends,
                        currency
                      )} sends / ${formatPercent(
                        group.openRate
                      )} open / ${formatPercent(group.clickRate)} click`}
                    />
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
