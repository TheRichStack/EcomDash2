"use client"

import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import type { AgentChartSpec, AgentChartValueFormat } from "@/lib/agent/types"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"

function formatChartValue(value: number, format: AgentChartValueFormat = "number") {
  if (!Number.isFinite(value)) {
    return "-"
  }

  if (format === "currency") {
    return new Intl.NumberFormat("en-GB", {
      maximumFractionDigits: value >= 100 ? 0 : 2,
      minimumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value)
  }

  if (format === "percent") {
    return `${value.toFixed(1)}%`
  }

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value)
}

function compactTickValue(value: number, format: AgentChartValueFormat = "number") {
  if (!Number.isFinite(value)) {
    return ""
  }

  if (format === "currency") {
    if (Math.abs(value) >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}m`
    }

    if (Math.abs(value) >= 1_000) {
      return `${(value / 1_000).toFixed(1)}k`
    }

    return `${Math.round(value)}`
  }

  if (format === "percent") {
    return `${value.toFixed(0)}%`
  }

  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`
  }

  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`
  }

  return `${Math.round(value)}`
}

function AgentInlineChart({ chart }: { chart: AgentChartSpec }) {
  const config = useMemo(() => {
    return Object.fromEntries(
      chart.series.map((series) => [
        series.key,
        {
          color: series.color,
          label: series.label,
        },
      ])
    ) satisfies ChartConfig
  }, [chart.series])
  const primaryFormat = chart.series[0]?.format ?? "number"

  return (
    <div className="rounded-xl border bg-background/90 p-3">
      <div className="mb-3 grid gap-1">
        <p className="text-sm font-medium text-foreground">{chart.title}</p>
        {chart.description ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {chart.description}
          </p>
        ) : null}
      </div>

      <ChartContainer className="h-52 w-full" config={config}>
        {chart.kind === "line" ? (
          <LineChart
            accessibilityLayer
            data={chart.rows}
            margin={{
              left: 4,
              right: 8,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey={chart.xKey}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              axisLine={false}
              tickFormatter={(value) => compactTickValue(Number(value), primaryFormat)}
              tickLine={false}
              width={50}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => {
                    const series = chart.series.find((entry) => entry.key === name)
                    return (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          {series?.label ?? String(name)}
                        </span>
                        <span className="font-medium text-foreground">
                          {formatChartValue(Number(value), series?.format)}
                        </span>
                      </div>
                    )
                  }}
                  indicator="line"
                />
              }
              cursor={false}
            />
            {chart.series.map((series) => (
              <Line
                dataKey={series.key}
                dot={false}
                key={series.key}
                stroke={`var(--color-${series.key})`}
                strokeWidth={2}
                type="monotone"
              />
            ))}
          </LineChart>
        ) : (
          <BarChart
            accessibilityLayer
            data={chart.rows}
            margin={{
              left: 4,
              right: 8,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey={chart.xKey}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              axisLine={false}
              tickFormatter={(value) => compactTickValue(Number(value), primaryFormat)}
              tickLine={false}
              width={50}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => {
                    const series = chart.series.find((entry) => entry.key === name)
                    return (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          {series?.label ?? String(name)}
                        </span>
                        <span className="font-medium text-foreground">
                          {formatChartValue(Number(value), series?.format)}
                        </span>
                      </div>
                    )
                  }}
                  indicator="dashed"
                />
              }
              cursor={false}
            />
            {chart.series.map((series) => (
              <Bar
                dataKey={series.key}
                fill={`var(--color-${series.key})`}
                key={series.key}
                radius={6}
              />
            ))}
          </BarChart>
        )}
      </ChartContainer>
    </div>
  )
}

export function AgentInlineCharts({
  charts,
  className,
}: {
  charts: AgentChartSpec[]
  className?: string
}) {
  if (charts.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        "mt-3 grid gap-3",
        charts.length > 1 ? "xl:grid-cols-2" : "grid-cols-1",
        className
      )}
    >
      {charts.map((chart) => (
        <AgentInlineChart chart={chart} key={chart.id} />
      ))}
    </div>
  )
}
