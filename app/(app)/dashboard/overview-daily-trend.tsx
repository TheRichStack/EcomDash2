"use client"

import { useState } from "react"

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
import { cn } from "@/lib/utils"
import type { DailyOverviewRow, OverviewMetricTotals } from "@/types/backend"
import type { EcomDashMetricId, MetricUnit } from "@/types/metrics"
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts"

type TrendMetricOption = {
  id: EcomDashMetricId
  label: string
  unit: MetricUnit
}

type OverviewDailyTrendProps = {
  currency: string
  compareLabel: string | null
  currentRows: DailyOverviewRow[]
  comparisonRows: DailyOverviewRow[]
  currentTotals: OverviewMetricTotals
  comparisonTotals: OverviewMetricTotals | null
  metricOptions: TrendMetricOption[]
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function formatMetricValue(unit: MetricUnit, value: number, currency: string) {
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

function formatAxisTick(unit: MetricUnit, value: number, currency: string) {
  const magnitude = Math.abs(value)

  if (unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: magnitude >= 1000 ? "compact" : "standard",
      maximumFractionDigits: magnitude >= 1000 ? 1 : 0,
    }).format(value)
  }

  if (unit === "count") {
    return new Intl.NumberFormat("en-US", {
      notation: magnitude >= 1000 ? "compact" : "standard",
      maximumFractionDigits: magnitude >= 1000 ? 1 : 0,
    }).format(value)
  }

  if (unit === "percent") {
    return `${value.toFixed(magnitude < 10 ? 1 : 0)}%`
  }

  return `${value.toFixed(magnitude < 10 ? 1 : 0)}x`
}

function formatDelta(
  unit: MetricUnit,
  currentValue: number,
  comparisonValue: number | null,
  currency: string
) {
  if (comparisonValue === null) {
    return null
  }

  if (unit === "ratio" || unit === "percent") {
    const delta = currentValue - comparisonValue
    const sign = delta > 0 ? "+" : delta < 0 ? "-" : ""
    return `${sign}${formatMetricValue(unit, Math.abs(delta), currency)}`
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

function getMetricValueFromRow(
  row: DailyOverviewRow,
  metricId: EcomDashMetricId
) {
  switch (metricId) {
    case "shopify_net_revenue":
    case "total_sales":
      return row.totalRevenue
    case "blended_ad_spend":
      return row.totalSpend
    case "orders_count":
      return row.totalOrders
    case "cogs":
      return row.cogs
    case "allocated_overhead":
      return row.allocatedOverhead
    case "aov":
      return row.aov
    case "mer":
      return row.mer
    case "gross_profit":
      return row.grossProfit
    case "net_profit_after_ads":
      return row.netProfitAfterAds
    case "contribution_margin":
      return row.contributionMargin
    case "net_profit":
      return row.netProfit
    default:
      return 0
  }
}

function getMetricValueFromTotals(
  totals: OverviewMetricTotals,
  metricId: EcomDashMetricId
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

export function OverviewDailyTrend({
  currency,
  compareLabel,
  currentRows,
  comparisonRows,
  currentTotals,
  comparisonTotals,
  metricOptions,
}: OverviewDailyTrendProps) {
  const [selectedMetricId, setSelectedMetricId] = useState<EcomDashMetricId>(
    metricOptions[0]?.id ?? "shopify_net_revenue"
  )

  const selectedMetric = metricOptions.find(
    (metric) => metric.id === selectedMetricId
  ) ??
    metricOptions[0] ?? {
      id: "shopify_net_revenue" as const,
      label: "Revenue",
      unit: "currency" as const,
    }

  if (currentRows.length === 0) {
    return (
      <div>
        <EmptyState
          title="Daily trend unavailable"
          description="No daily overview rows were returned for the selected range, so the trend module cannot render yet."
        />
      </div>
    )
  }

  const chartData = currentRows.map((row, index) => ({
    label: formatDateLabel(row.date),
    current: getMetricValueFromRow(row, selectedMetric.id),
    comparison:
      comparisonRows[index] !== undefined
        ? getMetricValueFromRow(comparisonRows[index], selectedMetric.id)
        : null,
  }))
  const currentTotal = getMetricValueFromTotals(
    currentTotals,
    selectedMetric.id
  )
  const comparisonTotal = comparisonTotals
    ? getMetricValueFromTotals(comparisonTotals, selectedMetric.id)
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
            <CardDescription>Daily trend</CardDescription>
            <CardTitle>
              {selectedMetric.label} across the selected range
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Toggle between the locked overview metrics without introducing a
              second chart system.
            </p>
          </div>
          <Tabs
            value={selectedMetric.id}
            onValueChange={(value) =>
              setSelectedMetricId(value as EcomDashMetricId)
            }
          >
            <TabsList className="flex h-auto flex-wrap">
              {metricOptions.map((metric) => (
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
                    id="overview-trend-current"
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
                  width={selectedMetric.unit === "currency" ? 80 : 64}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  allowDecimals={selectedMetric.unit !== "count"}
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
                        <div className="flex min-w-28 items-center justify-between gap-4">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-mono font-medium text-foreground tabular-nums">
                            {formatMetricValue(
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
                  fill="url(#overview-trend-current)"
                  stroke="var(--color-current)"
                  strokeWidth={2.25}
                  dot={false}
                />
              </AreaChart>
            </ChartContainer>
          </div>
          <div
            className={cn(
              "grid border-t bg-muted/25",
              comparisonTotal !== null ? "sm:grid-cols-3" : "sm:grid-cols-2"
            )}
          >
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Current
              </p>
              <p className="mt-1 text-base font-semibold tracking-tight">
                {formatMetricValue(selectedMetric.unit, currentTotal, currency)}
              </p>
            </div>
            <div
              className={cn(
                "px-4 py-3",
                comparisonTotal !== null
                  ? "border-y sm:border-x sm:border-y-0"
                  : "border-t sm:border-t-0 sm:border-l"
              )}
            >
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {comparisonTotal !== null
                  ? (compareLabel ?? "Comparison")
                  : "Comparison"}
              </p>
              <p className="mt-1 text-base font-semibold tracking-tight">
                {comparisonTotal !== null
                  ? formatMetricValue(
                      selectedMetric.unit,
                      comparisonTotal,
                      currency
                    )
                  : "Off"}
              </p>
            </div>
            {comparisonTotal !== null ? (
              <div className="px-4 py-3">
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Delta
                </p>
                <p className="mt-1 text-base font-semibold tracking-tight">
                  {deltaLabel ?? "Flat"}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
