"use client"

import { Label, Pie, PieChart } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export type OverviewChannelShareDatum = {
  id: string
  label: string
  revenue: number
  revenueShare: number
  spend: number
  purchases: number
  mer: number
  color: string
}

type OverviewChannelShareChartProps = {
  currency: string
  data: OverviewChannelShareDatum[]
  totalRevenue: number
}

function formatCurrency(value: number, currency: string) {
  const magnitude = Math.abs(value)

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: magnitude < 100 ? 2 : 0,
    maximumFractionDigits: magnitude < 100 ? 2 : 0,
  }).format(value)
}

function formatCompactCurrency(value: number, currency: string) {
  const magnitude = Math.abs(value)

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: magnitude >= 1000 ? "compact" : "standard",
    minimumFractionDigits: magnitude >= 1000 ? 1 : 0,
    maximumFractionDigits: magnitude >= 1000 ? 1 : 0,
  }).format(value)
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatRatio(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : "n/a"
}

const chartConfig = {
  revenue: {
    label: "Revenue",
  },
} satisfies ChartConfig

export function OverviewChannelShareChart({
  currency,
  data,
  totalRevenue,
}: OverviewChannelShareChartProps) {
  if (data.length === 0) {
    return null
  }

  const hasRevenueData = totalRevenue > 0 && data.some((item) => item.revenue > 0)
  const chartData = hasRevenueData
    ? data.map((item) => ({
        ...item,
        fill: item.color,
      }))
    : [
        {
          id: "no-revenue",
          label: "No revenue",
          revenue: 1,
          revenueShare: 1,
          spend: 0,
          purchases: 0,
          mer: 0,
          color: "color-mix(in oklab, var(--color-muted) 78%, var(--color-border))",
          fill: "color-mix(in oklab, var(--color-muted) 78%, var(--color-border))",
        },
      ]
  const topChannel = data[0] ?? null
  const topTwoShare = data
    .slice(0, 2)
    .reduce((total, item) => total + item.revenueShare, 0)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-center">
      <div className="flex flex-col items-center gap-3">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[240px] w-full"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name, item) => {
                    const revenue = Number(value ?? 0)
                    const channel = item.payload as OverviewChannelShareDatum

                    return (
                      <div className="flex min-w-44 flex-col gap-2">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-mono font-medium text-foreground tabular-nums">
                            {formatCurrency(revenue, currency)}
                          </span>
                        </div>
                        {hasRevenueData ? (
                          <div className="flex items-center justify-between gap-4 text-[11px]">
                            <span className="text-muted-foreground">
                              Revenue share
                            </span>
                            <span className="font-medium text-foreground">
                              {formatPercent(channel.revenueShare)}
                            </span>
                          </div>
                        ) : null}
                        <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-[11px]">
                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground uppercase">
                              Spend
                            </span>
                            <span className="font-mono font-medium text-foreground tabular-nums">
                              {formatCurrency(channel.spend, currency)}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground uppercase">
                              Purchases
                            </span>
                            <span className="font-mono font-medium text-foreground tabular-nums">
                              {formatCount(channel.purchases)}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground uppercase">
                              MER
                            </span>
                            <span className="font-mono font-medium text-foreground tabular-nums">
                              {formatRatio(channel.mer)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  }}
                />
              }
            />
            <Pie
              data={chartData}
              dataKey="revenue"
              nameKey="label"
              innerRadius={68}
              outerRadius={96}
              paddingAngle={hasRevenueData ? 2 : 0}
              cornerRadius={hasRevenueData ? 10 : 0}
              stroke="var(--color-background)"
              strokeWidth={4}
              isAnimationActive={false}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-[28px] font-semibold tracking-tight"
                        >
                          {hasRevenueData
                            ? formatCompactCurrency(totalRevenue, currency)
                            : "No revenue"}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 22}
                          className="fill-muted-foreground text-[11px] font-medium tracking-wide uppercase"
                        >
                          Revenue share
                        </tspan>
                      </text>
                    )
                  }

                  return null
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <p className="max-w-[16rem] text-center text-xs text-muted-foreground">
          {hasRevenueData
            ? "Hover a slice for spend, purchases, and MER."
            : "Channel rows exist, but no attributed revenue was returned for this range."}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Leading channel
            </p>
            <p className="mt-1 text-sm font-semibold tracking-tight">
              {topChannel?.label ?? "Unavailable"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {topChannel
                ? `${formatPercent(topChannel.revenueShare)} of selected-range revenue`
                : "No channel rows returned."}
            </p>
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Top 2 concentration
            </p>
            <p className="mt-1 text-base font-semibold tracking-tight">
              {formatPercent(topTwoShare)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Combined revenue share of the two largest slices.
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          {data.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border bg-background/70 px-3 py-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate font-medium">{item.label}</span>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-medium text-foreground tabular-nums">
                    {formatPercent(item.revenueShare)}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(item.revenue, currency)}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border/60 pt-3">
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    Spend
                  </p>
                  <p className="font-mono text-sm font-medium text-foreground tabular-nums">
                    {formatCurrency(item.spend, currency)}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    Purchases
                  </p>
                  <p className="font-mono text-sm font-medium text-foreground tabular-nums">
                    {formatCount(item.purchases)}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    MER
                  </p>
                  <p className="font-mono text-sm font-medium text-foreground tabular-nums">
                    {formatRatio(item.mer)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Hover a slice or use the channel rows to compare revenue, spend,
          purchases, and MER.
        </p>
      </div>
    </div>
  )
}
