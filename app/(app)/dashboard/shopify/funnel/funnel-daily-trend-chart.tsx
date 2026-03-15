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
import type { ShopifyFunnelDailyPoint } from "@/types/backend"

type FunnelDailyTrendChartProps = {
  daily: ShopifyFunnelDailyPoint[]
  comparisonDaily: ShopifyFunnelDailyPoint[]
  compareLabel: string | null
}

type TrendMetricKey = "sessions" | "addToCart" | "checkout" | "purchase"

const TREND_METRICS = [
  { id: "sessions", label: "Sessions" },
  { id: "addToCart", label: "Add to cart" },
  { id: "checkout", label: "Checkout" },
  { id: "purchase", label: "Purchase" },
] as const satisfies ReadonlyArray<{
  id: TrendMetricKey
  label: string
}>

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatCountAxisTick(value: number) {
  const magnitude = Math.abs(value)

  return new Intl.NumberFormat("en-US", {
    notation: magnitude >= 1000 ? "compact" : "standard",
    maximumFractionDigits: magnitude >= 1000 ? 1 : 0,
  }).format(value)
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function metricValue(row: ShopifyFunnelDailyPoint, metricId: TrendMetricKey) {
  return row[metricId]
}

function totalMetricValue(
  rows: ShopifyFunnelDailyPoint[],
  metricId: TrendMetricKey
) {
  return rows.reduce((total, row) => total + metricValue(row, metricId), 0)
}

function formatDelta(currentValue: number, comparisonValue: number | null) {
  if (comparisonValue === null) {
    return null
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

export function FunnelDailyTrendChart({
  daily,
  comparisonDaily,
  compareLabel,
}: FunnelDailyTrendChartProps) {
  const chartId = useId().replace(/:/g, "")
  const [selectedMetricId, setSelectedMetricId] =
    useState<TrendMetricKey>("sessions")

  if (daily.length === 0) {
    return (
      <EmptyState
        title="Daily funnel trend unavailable"
        description="No Shopify daily funnel rows were returned for the selected period, so the trend chart cannot render yet."
      />
    )
  }

  const selectedMetric =
    TREND_METRICS.find((metric) => metric.id === selectedMetricId) ??
    TREND_METRICS[0]
  const currentTotal = totalMetricValue(daily, selectedMetric.id)
  const comparisonTotal =
    comparisonDaily.length > 0
      ? totalMetricValue(comparisonDaily, selectedMetric.id)
      : null
  const deltaLabel = formatDelta(currentTotal, comparisonTotal)
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
  const chartData = daily.map((row, index) => ({
    label: formatDateLabel(row.date),
    current: metricValue(row, selectedMetric.id),
    comparison:
      comparisonDaily[index] !== undefined
        ? metricValue(comparisonDaily[index], selectedMetric.id)
        : null,
  }))

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1">
            <CardDescription>Daily trend view</CardDescription>
            <CardTitle>
              Daily funnel movement across the selected range
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Toggle through the core funnel stages without adding a second
              chart system or a secondary workflow.
            </p>
          </div>
          <Tabs
            value={selectedMetric.id}
            onValueChange={(value) =>
              setSelectedMetricId(value as TrendMetricKey)
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
                    id={`shopify-funnel-daily-current-${chartId}`}
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
                  width={64}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) =>
                    formatCountAxisTick(Number(value ?? 0))
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <div className="flex min-w-32 items-center justify-between gap-4">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-mono font-medium text-foreground tabular-nums">
                            {formatCount(Number(value ?? 0))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                {comparisonTotal !== null ? (
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
                  fill={`url(#shopify-funnel-daily-current-${chartId})`}
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
                {formatCount(currentTotal)}
              </p>
            </div>
            <div className="border-y px-4 py-3 sm:border-x sm:border-y-0">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {comparisonTotal !== null
                  ? (compareLabel ?? "Comparison")
                  : "Daily average"}
              </p>
              <p className="mt-1 text-base font-semibold tracking-tight">
                {comparisonTotal !== null
                  ? formatCount(comparisonTotal)
                  : formatCount(currentTotal / daily.length)}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {comparisonTotal !== null ? "Delta" : "Range coverage"}
              </p>
              <p className="mt-1 text-base font-semibold tracking-tight">
                {comparisonTotal !== null
                  ? (deltaLabel ?? "Flat")
                  : `${daily.length} day${daily.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
