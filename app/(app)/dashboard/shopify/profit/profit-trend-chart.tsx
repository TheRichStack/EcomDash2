"use client"

import { useId } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

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
import { safeDivide } from "@/lib/metrics/formulas"
import type { ProfitSeriesRow, ProfitTotals } from "@/types/backend"

type ShopifyProfitTrendChartProps = {
  currency: string
  compareLabel: string | null
  currentRows: ProfitSeriesRow[]
  comparisonRows: ProfitSeriesRow[]
  currentTotals: ProfitTotals
  comparisonTotals: ProfitTotals | null
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
    maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
  }).format(value)
}

function formatCurrencyAxisTick(value: number, currency: string) {
  const magnitude = Math.abs(value)

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: magnitude >= 1000 ? "compact" : "standard",
    maximumFractionDigits: magnitude >= 1000 ? 1 : 0,
  }).format(value)
}

function formatDelta(currentValue: number, comparisonValue: number | null) {
  if (comparisonValue === null) {
    return null
  }

  if (comparisonValue === 0) {
    return currentValue === 0 ? "Flat" : "New"
  }

  const deltaPct =
    ((currentValue - comparisonValue) / Math.abs(comparisonValue)) * 100

  if (!Number.isFinite(deltaPct) || Math.abs(deltaPct) < 0.1) {
    return "Flat"
  }

  return `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%`
}

export function ShopifyProfitTrendChart({
  currency,
  compareLabel,
  currentRows,
  comparisonRows,
  currentTotals,
  comparisonTotals,
}: ShopifyProfitTrendChartProps) {
  const chartId = useId().replace(/:/g, "")

  if (currentRows.length === 0) {
    return (
      <div>
        <EmptyState
          title="Profit trend unavailable"
          description="No Shopify Profit rows were returned for the selected range, so the time-series chart cannot render yet."
        />
      </div>
    )
  }

  const chartData = currentRows.map((row, index) => ({
    label: formatDateLabel(row.date),
    current: row.netProfit,
    comparison:
      comparisonRows[index] !== undefined
        ? comparisonRows[index].netProfit
        : null,
  }))
  const chartConfig = {
    current: {
      label: "Net profit",
      color: "var(--color-chart-2)",
    },
    comparison: {
      label: compareLabel ?? "Comparison",
      color: "var(--color-chart-5)",
    },
  } satisfies ChartConfig
  const comparisonDelta = formatDelta(
    currentTotals.netProfit,
    comparisonTotals?.netProfit ?? null
  )
  const dailyAverage = safeDivide(currentTotals.netProfit, currentRows.length)

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-1">
          <CardDescription>Profit trend chart</CardDescription>
          <CardTitle>Net profit across the selected range</CardTitle>
          <p className="text-sm text-muted-foreground">
            Daily net profit after COGS, marketing costs, and the allocated
            overhead rule used by the Shopify Profit slice.
          </p>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="chart-surface p-0">
          <div className="p-4">
            <ChartContainer
              className="h-72 w-full"
              config={chartConfig}
              id={chartId}
            >
              <AreaChart
                accessibilityLayer
                data={chartData}
                margin={{ top: 12, right: 12, left: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`shopify-profit-current-${chartId}`}
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
                <ReferenceLine
                  y={0}
                  stroke="hsl(var(--border))"
                  strokeDasharray="4 4"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  width={80}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) =>
                    formatCurrencyAxisTick(Number(value ?? 0), currency)
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <div className="flex min-w-32 items-center justify-between gap-4">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-mono font-medium text-foreground tabular-nums">
                            {formatCurrency(Number(value ?? 0), currency)}
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
                  name="Net profit"
                  fill={`url(#shopify-profit-current-${chartId})`}
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
                {formatCurrency(currentTotals.netProfit, currency)}
              </p>
            </div>
            <div className="border-y px-4 py-3 sm:border-x sm:border-y-0">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {comparisonTotals
                  ? (compareLabel ?? "Comparison")
                  : "Daily average"}
              </p>
              <p className="mt-1 text-base font-semibold tracking-tight">
                {comparisonTotals
                  ? formatCurrency(comparisonTotals.netProfit, currency)
                  : formatCurrency(dailyAverage, currency)}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {comparisonTotals ? "Delta" : "Range coverage"}
              </p>
              <p className="mt-1 text-base font-semibold tracking-tight">
                {comparisonTotals
                  ? (comparisonDelta ?? "Flat")
                  : `${currentRows.length} day${currentRows.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
