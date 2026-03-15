import Link from "next/link"

import { ShopifyProfitTrendChart } from "./profit-trend-chart"

import { EmptyState } from "@/components/shared/empty-state"
import { KpiCard } from "@/components/shared/kpi-card"
import { MetricHelpHoverCard } from "@/components/shared/metric-help-hover-card"
import { SectionHeader } from "@/components/shared/section-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  buildDashboardHref,
  formatDashboardDateRangeLabel,
  resolveDashboardRequestContext,
} from "@/lib/dashboard-state"
import { resolveDashboardSession } from "@/lib/dashboard-session"
import { ROUTES } from "@/lib/constants"
import { listMetrics } from "@/lib/metrics/registry"
import { loadShopifyProfitSlice } from "@/lib/server/loaders/shopify-profit"
import type { ProfitTotals } from "@/types/backend"
import type { DashboardCompareMode } from "@/types/dashboard"
import type {
  EcomDashMetricId,
  MetricDefinition,
  MetricUnit,
} from "@/types/metrics"

type DashboardSearchParamsRecord = Record<string, string | string[] | undefined>

type ShopifyProfitPageProps = {
  searchParams?: Promise<DashboardSearchParamsRecord>
}

type ProfitBreakdownRow = {
  id: string
  label: string
  current: number
  comparison: number | null
  emphasize?: boolean
  expense?: boolean
}

type MetricDelta = {
  label: string
  variant: "secondary" | "outline"
}

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

function formatLongDateSpan(from: string, to: string) {
  return `${formatDate(from)} to ${formatDate(to)}`
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

function getProfitMetricValue(
  metricId: EcomDashMetricId,
  totals: ProfitTotals
) {
  switch (metricId) {
    case "total_sales":
    case "shopify_net_revenue":
      return totals.totalSales
    case "blended_ad_spend":
      return totals.marketingCosts
    case "cogs":
      return totals.cogs
    case "allocated_overhead":
      return totals.allocatedOverhead
    case "contribution_margin":
      return totals.contributionMargin
    case "net_profit":
      return totals.netProfit
    default:
      return 0
  }
}

function getMetricDefinition(
  metricMap: Map<EcomDashMetricId, MetricDefinition>,
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

function formatMetricDelta(
  metric: Pick<MetricDefinition, "unit" | "direction">,
  currentValue: number,
  comparisonValue: number | null,
  currency: string
): MetricDelta | null {
  if (comparisonValue === null) {
    return null
  }

  const rawDelta = currentValue - comparisonValue

  if (!Number.isFinite(rawDelta)) {
    return null
  }

  if (metric.unit === "ratio" || metric.unit === "percent") {
    const sign = rawDelta > 0 ? "+" : rawDelta < 0 ? "-" : ""
    const label =
      rawDelta === 0
        ? "Flat"
        : `${sign}${formatMetricValue(metric.unit, Math.abs(rawDelta), currency)}`

    return {
      label,
      variant:
        rawDelta === 0
          ? "outline"
          : metric.direction === "lower_is_better"
            ? rawDelta < 0
              ? "secondary"
              : "outline"
            : rawDelta > 0
              ? "secondary"
              : "outline",
    }
  }

  if (comparisonValue <= 0) {
    if (currentValue <= 0) {
      return {
        label: "Flat",
        variant: "outline",
      }
    }

    return {
      label: "New",
      variant: metric.direction === "lower_is_better" ? "outline" : "secondary",
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
    variant:
      metric.direction === "lower_is_better"
        ? deltaPct < 0
          ? "secondary"
          : "outline"
        : deltaPct > 0
          ? "secondary"
          : "outline",
  }
}

function formatPnlValue(
  value: number,
  currency: string,
  options?: { expense?: boolean }
) {
  const normalizedValue = options?.expense ? -Math.abs(value) : value

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Math.abs(normalizedValue) < 100 ? 2 : 0,
    maximumFractionDigits: Math.abs(normalizedValue) < 100 ? 2 : 0,
  }).format(normalizedValue)
}

function formatPnlDelta(
  currentValue: number,
  comparisonValue: number | null,
  currency: string,
  options?: { expense?: boolean }
) {
  if (comparisonValue === null) {
    return null
  }

  const displayedCurrent = options?.expense
    ? -Math.abs(currentValue)
    : currentValue
  const displayedComparison = options?.expense
    ? -Math.abs(comparisonValue)
    : comparisonValue
  const delta = displayedCurrent - displayedComparison

  if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) {
    return "Flat"
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Math.abs(delta) < 100 ? 2 : 0,
    maximumFractionDigits: Math.abs(delta) < 100 ? 2 : 0,
    signDisplay: "always",
  }).format(delta)
}

function buildProfitBreakdownRows(
  currentTotals: ProfitTotals,
  comparisonTotals: ProfitTotals | null
): ProfitBreakdownRow[] {
  return [
    {
      id: "total-sales",
      label: "Total sales",
      current: currentTotals.totalSales,
      comparison: comparisonTotals?.totalSales ?? null,
    },
    {
      id: "taxes",
      label: "Taxes",
      current: 0,
      comparison: comparisonTotals ? 0 : null,
    },
    {
      id: "net-sales",
      label: "Net sales",
      current: currentTotals.totalSales,
      comparison: comparisonTotals?.totalSales ?? null,
      emphasize: true,
    },
    {
      id: "cogs",
      label: "COGS",
      current: currentTotals.cogs,
      comparison: comparisonTotals?.cogs ?? null,
      expense: true,
    },
    {
      id: "marketing-costs",
      label: "Marketing costs",
      current: currentTotals.marketingCosts,
      comparison: comparisonTotals?.marketingCosts ?? null,
      expense: true,
    },
    {
      id: "contribution-margin",
      label: "Contribution margin",
      current: currentTotals.contributionMargin,
      comparison: comparisonTotals?.contributionMargin ?? null,
      emphasize: true,
    },
    {
      id: "allocated-overhead",
      label: "Allocated overhead",
      current: currentTotals.allocatedOverhead,
      comparison: comparisonTotals?.allocatedOverhead ?? null,
      expense: true,
    },
    {
      id: "net-profit",
      label: "Net profit",
      current: currentTotals.netProfit,
      comparison: comparisonTotals?.netProfit ?? null,
      emphasize: true,
    },
  ]
}

export default async function ShopifyProfitPage({
  searchParams,
}: ShopifyProfitPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const session = await resolveDashboardSession()
  const context = resolveDashboardRequestContext({
    session,
    searchParams: resolvedSearchParams,
  })
  const data = await loadShopifyProfitSlice(context)
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
  const currentRangeLabel = formatDashboardDateRangeLabel(
    data.currentRange.range.from,
    data.currentRange.range.to
  )
  const comparisonRangeLabel = data.comparison
    ? formatLongDateSpan(data.comparison.range.from, data.comparison.range.to)
    : "No comparison selected"
  const breakdownRows = buildProfitBreakdownRows(
    data.currentRange.totals,
    data.comparison?.totals ?? null
  )

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div>
        <SectionHeader
          eyebrow="Shopify"
          title="Profit"
          description={`Clean P&L reporting for ${formatLongDateSpan(
            data.currentRange.range.from,
            data.currentRange.range.to
          )}.`}
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
                  href={buildDashboardHref(ROUTES.settingsInputsCosts, context)}
                >
                  Inputs - Costs
                </Link>
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.settings.kpis.selectedMetricIds.map((metricId) => {
          const metricDefinition = metricMap.get(metricId) ?? null
          const metric = getMetricDefinition(metricMap, metricId)
          const currentValue = getProfitMetricValue(
            metricId,
            data.currentRange.totals
          )
          const comparisonValue = data.comparison
            ? getProfitMetricValue(metricId, data.comparison.totals)
            : null
          const delta = formatMetricDelta(
            metric,
            currentValue,
            comparisonValue,
            currency
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
              value={formatMetricValue(metric.unit, currentValue, currency)}
              badge={delta ? { label: delta.label, variant: delta.variant } : null}
              note={
                comparisonText
                  ? `vs ${comparisonText.toLowerCase()}`
                  : metric.description
              }
            />
          )
        })}
      </div>

      <Card>
        <CardHeader className="gap-1">
          <CardDescription>Timeframe and comparison</CardDescription>
          <CardTitle>Shared dashboard reporting context</CardTitle>
          <p className="text-sm text-muted-foreground">
            The global header remains the source of truth for date range and
            comparison mode. This section mirrors that state without duplicating
            the controls.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-muted/10 p-4">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Selected range
            </p>
            <p className="mt-2 text-base font-semibold tracking-tight">
              {currentRangeLabel}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatLongDateSpan(
                data.currentRange.range.from,
                data.currentRange.range.to
              )}
            </p>
          </div>
          <div className="rounded-xl border bg-muted/10 p-4">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Range coverage
            </p>
            <p className="mt-2 text-base font-semibold tracking-tight">
              {data.currentRange.daily.length} day
              {data.currentRange.daily.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Daily profit rows returned for the selected window.
            </p>
          </div>
          <div className="rounded-xl border bg-muted/10 p-4">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Compare mode
            </p>
            <p className="mt-2 text-base font-semibold tracking-tight">
              {comparisonText ?? "No comparison"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {comparisonText
                ? "Aligned to the shared dashboard compare setting."
                : "Turn on a shared comparison mode in the header if needed."}
            </p>
          </div>
          <div className="rounded-xl border bg-muted/10 p-4">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Comparison window
            </p>
            <p className="mt-2 text-base font-semibold tracking-tight">
              {comparisonText ?? "Off"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {comparisonRangeLabel}
            </p>
          </div>
        </CardContent>
      </Card>

      <ShopifyProfitTrendChart
        currency={currency}
        compareLabel={comparisonText}
        currentRows={data.currentRange.daily}
        comparisonRows={data.comparison?.daily ?? []}
        currentTotals={data.currentRange.totals}
        comparisonTotals={data.comparison?.totals ?? null}
      />

      <div>
        {data.currentRange.daily.length === 0 ? (
          <EmptyState
            title="Breakdown unavailable"
            description="No Shopify Profit rows were returned for the selected range, so the P&L breakdown cannot render yet."
          />
        ) : (
          <Card>
            <CardHeader className="gap-1">
              <CardDescription>Breakdown table</CardDescription>
              <CardTitle>P&L-style breakdown for the selected period</CardTitle>
              <p className="text-sm text-muted-foreground">
                Taxes stay in this table only. Cost lines are shown as negative
                amounts, and overhead uses the same daily allocation rule
                applied in the current Shopify Profit loader.
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto rounded-xl border bg-background">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[34%]">
                        Income statement
                      </TableHead>
                      <TableHead className="w-[22%] text-right">
                        Selected period
                      </TableHead>
                      {comparisonText ? (
                        <>
                          <TableHead className="w-[22%] text-right">
                            {comparisonText}
                          </TableHead>
                          <TableHead className="w-[22%] text-right">
                            Delta
                          </TableHead>
                        </>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdownRows.map((row) => {
                      const deltaLabel = formatPnlDelta(
                        row.current,
                        row.comparison,
                        currency,
                        {
                          expense: row.expense,
                        }
                      )

                      return (
                        <TableRow key={row.id}>
                          <TableCell
                            className={
                              row.emphasize
                                ? "font-semibold text-foreground"
                                : "font-medium text-foreground"
                            }
                          >
                            {row.label}
                          </TableCell>
                          <TableCell
                            className={
                              row.emphasize
                                ? "text-right font-semibold tabular-nums"
                                : "text-right tabular-nums"
                            }
                          >
                            {formatPnlValue(row.current, currency, {
                              expense: row.expense,
                            })}
                          </TableCell>
                          {comparisonText ? (
                            <>
                              <TableCell
                                className={
                                  row.emphasize
                                    ? "text-right font-semibold tabular-nums"
                                    : "text-right tabular-nums"
                                }
                              >
                                {formatPnlValue(row.comparison ?? 0, currency, {
                                  expense: row.expense,
                                })}
                              </TableCell>
                              <TableCell
                                className={
                                  deltaLabel === "Flat"
                                    ? "text-right text-muted-foreground tabular-nums"
                                    : "text-right font-medium tabular-nums"
                                }
                              >
                                {deltaLabel ?? "Off"}
                              </TableCell>
                            </>
                          ) : null}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
