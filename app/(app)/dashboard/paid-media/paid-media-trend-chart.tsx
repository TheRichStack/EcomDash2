"use client"

import { useId, useState } from "react"
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts"

import { EmptyState } from "@/components/shared/empty-state"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PaidMediaTotals, PaidMediaTrendPoint } from "@/types/backend"

import {
  formatPaidMediaDateLabel,
  formatPaidMediaMetricValue,
} from "./paid-media-utils"

type TrendMetricId = "spend" | "attributed_revenue" | "roas"

type PaidMediaTrendChartProps = {
  currency: string
  compareLabel: string | null
  trend: PaidMediaTrendPoint[]
  currentTotals: PaidMediaTotals
  comparisonTotals: PaidMediaTotals | null
  eyebrow?: string
  title?: string
  description?: string
}

const TREND_METRICS: Array<{
  id: TrendMetricId
  label: string
  unit: "currency" | "ratio"
}> = [
  {
    id: "spend",
    label: "Spend",
    unit: "currency",
  },
  {
    id: "attributed_revenue",
    label: "Attributed Revenue",
    unit: "currency",
  },
  {
    id: "roas",
    label: "ROAS",
    unit: "ratio",
  },
]

function getTrendMetricValue(
  point: PaidMediaTrendPoint,
  metricId: TrendMetricId
) {
  switch (metricId) {
    case "spend":
      return point.spend
    case "attributed_revenue":
      return point.attributedRevenue
    case "roas":
    default:
      return point.roas
  }
}

function getTrendComparisonValue(
  point: PaidMediaTrendPoint,
  metricId: TrendMetricId
) {
  switch (metricId) {
    case "spend":
      return point.comparisonSpend
    case "attributed_revenue":
      return point.comparisonAttributedRevenue
    case "roas":
    default:
      return point.comparisonRoas
  }
}

function getTotalMetricValue(totals: PaidMediaTotals, metricId: TrendMetricId) {
  switch (metricId) {
    case "spend":
      return totals.spend
    case "attributed_revenue":
      return totals.attributedRevenue
    case "roas":
    default:
      return totals.roas
  }
}

function formatDelta(
  unit: "currency" | "ratio",
  currentValue: number,
  comparisonValue: number | null,
  currency: string
) {
  if (comparisonValue === null) {
    return null
  }

  if (unit === "ratio") {
    const delta = currentValue - comparisonValue

    if (delta === 0) {
      return "Flat"
    }

    return `${delta > 0 ? "+" : ""}${formatPaidMediaMetricValue(
      unit,
      delta,
      currency
    )}`
  }

  if (comparisonValue <= 0) {
    return currentValue > 0 ? "New" : "Flat"
  }

  const deltaPct = ((currentValue - comparisonValue) / comparisonValue) * 100

  if (!Number.isFinite(deltaPct) || Math.abs(deltaPct) < 0.1) {
    return "Flat"
  }

  return `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%`
}

function formatAxisTick(
  unit: "currency" | "ratio",
  value: number,
  currency: string
) {
  const magnitude = Math.abs(value)

  if (unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: magnitude >= 1000 ? "compact" : "standard",
      maximumFractionDigits: magnitude >= 1000 ? 1 : 0,
    }).format(value)
  }

  return `${value.toFixed(magnitude < 10 ? 1 : 0)}x`
}

export function PaidMediaTrendChart({
  currency,
  compareLabel,
  trend,
  currentTotals,
  comparisonTotals,
  eyebrow = "All-channels trend",
  title = "Spend, attributed revenue, and ROAS",
  description = "A single paid-media chart card that follows the shared dashboard comparison mode without introducing a second chart framework.",
}: PaidMediaTrendChartProps) {
  const chartId = useId().replace(/:/g, "")
  const [selectedMetricId, setSelectedMetricId] =
    useState<TrendMetricId>("spend")
  const selectedMetric =
    TREND_METRICS.find((metric) => metric.id === selectedMetricId) ??
    TREND_METRICS[0]

  if (trend.length === 0) {
    return (
      <div>
        <EmptyState
          title="Paid-media trend unavailable"
          description="No daily campaign rows were returned for the selected range, so the trend module cannot render yet."
        />
      </div>
    )
  }

  const chartData = trend.map((point) => ({
    label: formatPaidMediaDateLabel(point.date),
    current: getTrendMetricValue(point, selectedMetric.id),
    comparison: getTrendComparisonValue(point, selectedMetric.id),
  }))
  const currentTotal = getTotalMetricValue(currentTotals, selectedMetric.id)
  const comparisonTotal = comparisonTotals
    ? getTotalMetricValue(comparisonTotals, selectedMetric.id)
    : null
  const deltaLabel = formatDelta(
    selectedMetric.unit,
    currentTotal,
    comparisonTotal,
    currency
  )
  const chartConfig = {
    current: {
      label: selectedMetric.label,
      color: "var(--color-chart-2)",
    },
    comparison: {
      label: compareLabel ?? "Comparison",
      color: "var(--color-chart-5)",
    },
  } satisfies ChartConfig

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1">
            <CardDescription>{eyebrow}</CardDescription>
            <CardTitle>{title}</CardTitle>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <Tabs
            value={selectedMetric.id}
            onValueChange={(value) =>
              setSelectedMetricId(value as TrendMetricId)
            }
          >
            <TabsList className="flex h-auto flex-wrap">
              {TREND_METRICS.map((metric) => (
                <TabsTrigger key={metric.id} value={metric.id}>
                  {metric.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="chart-surface p-0">
          <div className="p-4">
            <ChartContainer className="h-72 w-full" config={chartConfig}>
              <AreaChart
                accessibilityLayer
                data={chartData}
                margin={{ top: 12, right: 12, left: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`paid-media-current-${chartId}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-current)"
                      stopOpacity={0.24}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-current)"
                      stopOpacity={0.03}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="4 4" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  width={selectedMetric.unit === "currency" ? 80 : 60}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) =>
                    formatAxisTick(
                      selectedMetric.unit,
                      Number(value ?? 0),
                      currency
                    )
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <div className="flex min-w-32 items-center justify-between gap-4">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-mono font-medium text-foreground tabular-nums">
                            {formatPaidMediaMetricValue(
                              selectedMetric.unit,
                              Number(value ?? 0),
                              currency
                            )}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                {comparisonTotals ? (
                  <Line
                    type="monotone"
                    dataKey="comparison"
                    name={compareLabel ?? "Comparison"}
                    stroke="var(--color-comparison)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    strokeOpacity={0.9}
                    dot={false}
                  />
                ) : null}
                <Area
                  type="monotone"
                  dataKey="current"
                  name={selectedMetric.label}
                  fill={`url(#paid-media-current-${chartId})`}
                  stroke="var(--color-current)"
                  strokeWidth={2.25}
                  dot={false}
                />
              </AreaChart>
            </ChartContainer>
          </div>
          <div className="grid border-t bg-muted/25 sm:grid-cols-3">
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Selected period
              </p>
              <p className="mt-1 text-base font-semibold tracking-tight">
                {formatPaidMediaMetricValue(
                  selectedMetric.unit,
                  currentTotal,
                  currency
                )}
              </p>
            </div>
            <div className="border-y px-4 py-3 sm:border-x sm:border-y-0">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {comparisonTotals
                  ? (compareLabel ?? "Comparison")
                  : "Comparison"}
              </p>
              <p className="mt-1 text-base font-semibold tracking-tight">
                {comparisonTotals
                  ? formatPaidMediaMetricValue(
                      selectedMetric.unit,
                      comparisonTotal ?? 0,
                      currency
                    )
                  : "Off"}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Delta
              </p>
              <p className="mt-1 text-base font-semibold tracking-tight">
                {deltaLabel ?? "Off"}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
