"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

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
import type {
  ShopifyFunnelStageSource,
  ShopifyFunnelStageSummary,
} from "@/types/backend"

type FunnelStageConversionCardProps = {
  stages: ShopifyFunnelStageSummary[]
  comparisonStages: ShopifyFunnelStageSummary[] | null
  compareLabel: string | null
  latestAvailableDate: string | null
  stageCountSource: ShopifyFunnelStageSource
}

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

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Unavailable"
  }

  return `${value.toFixed(1)}%`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function formatDelta(
  currentValue: number | null,
  comparisonValue: number | null
) {
  if (currentValue === null || comparisonValue === null) {
    return null
  }

  const delta = currentValue - comparisonValue

  if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) {
    return "Flat"
  }

  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp`
}

function sourceDescription(source: ShopifyFunnelStageSource) {
  switch (source) {
    case "shopify_totals":
      return "Stage counts resolved from exact-range Shopify analytics totals."
    case "mixed":
      return "Stage counts use Shopify exact-range totals when present and daily analytics rows for the missing stages."
    case "shopify_daily":
      return "Stage counts resolved from Shopify daily analytics rows for the selected period."
    case "unavailable":
    default:
      return "No Shopify funnel stage rows were returned for the selected period."
  }
}

export function FunnelStageConversionCard({
  stages,
  comparisonStages,
  compareLabel,
  latestAvailableDate,
  stageCountSource,
}: FunnelStageConversionCardProps) {
  if (!stages.some((stage) => stage.count > 0)) {
    return (
      <EmptyState
        title="Stage conversion unavailable"
        description="No Shopify funnel stage rows were returned for the selected period, so the stage conversion visual cannot render yet."
      />
    )
  }

  const chartConfig = {
    count: {
      label: "Stage count",
      color: "var(--color-chart-1)",
    },
  } satisfies ChartConfig
  const chartData = stages.map((stage) => ({
    label: stage.label,
    count: stage.count,
  }))
  const transitionRows = stages.slice(1).map((stage, index) => {
    const previousStage = stages[index]
    const comparisonStage = comparisonStages?.find(
      (candidate) => candidate.id === stage.id
    )

    return {
      id: stage.id,
      label: `${previousStage.label} to ${stage.label}`,
      convertedCount: stage.count,
      dropOffCount: stage.dropOffCount ?? 0,
      stepRate: stage.stepRate,
      deltaLabel: formatDelta(
        stage.stepRate,
        comparisonStage?.stepRate ?? null
      ),
    }
  })

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-1">
          <CardDescription>Stage conversion visual</CardDescription>
          <CardTitle>Sessions through purchase</CardTitle>
          <p className="text-sm text-muted-foreground">
            {sourceDescription(stageCountSource)}
            {latestAvailableDate
              ? ` Data available through ${formatDate(latestAvailableDate)}.`
              : ""}
          </p>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)]">
          <div className="chart-surface p-0">
            <div className="p-4">
              <ChartContainer className="h-72 w-full" config={chartConfig}>
                <BarChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ top: 12, right: 12, left: 4, bottom: 0 }}
                >
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
                            <span className="text-muted-foreground">
                              {name}
                            </span>
                            <span className="font-mono font-medium text-foreground tabular-nums">
                              {formatCount(Number(value ?? 0))}
                            </span>
                          </div>
                        )}
                      />
                    }
                  />
                  <Bar
                    dataKey="count"
                    name="Stage count"
                    fill="var(--color-count)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={56}
                  />
                </BarChart>
              </ChartContainer>
            </div>
            <div className="grid border-t bg-muted/25 sm:grid-cols-4">
              {stages.map((stage, index) => (
                <div
                  key={stage.id}
                  className={
                    index < stages.length - 1
                      ? "border-b px-4 py-3 sm:border-r sm:border-b-0"
                      : "px-4 py-3"
                  }
                >
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {stage.label}
                  </p>
                  <p className="mt-1 text-base font-semibold tracking-tight">
                    {formatCount(stage.count)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {stage.id === "sessions"
                      ? "100.0% of sessions"
                      : `${formatPercent(stage.overallRate)} of sessions`}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
            {transitionRows.map((transition) => (
              <div
                key={transition.id}
                className="rounded-xl border bg-muted/10 p-4"
              >
                <p className="text-sm font-medium">{transition.label}</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight">
                  {formatPercent(transition.stepRate)}
                </p>
                <div className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
                  <span>
                    Converted {formatCount(transition.convertedCount)}
                  </span>
                  <span>Dropped {formatCount(transition.dropOffCount)}</span>
                  <span>
                    {compareLabel && transition.deltaLabel
                      ? `${transition.deltaLabel} vs ${compareLabel.toLowerCase()}`
                      : "Current period step conversion"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
