import Link from "next/link"

import { CampaignPerformanceTable } from "./campaign-performance-table"
import { PaidMediaTrendChart } from "./paid-media-trend-chart"
import {
  compareLabel,
  confidenceBadgeClass,
  confidenceShort,
  formatPaidMediaDateRange,
  formatPaidMediaMetricDelta,
  formatPaidMediaMetricValue,
  formatPaidMediaNumber,
  formatPaidMediaRatio,
  getPaidMediaMetricDefinition,
  getPaidMediaMetricValue,
} from "./paid-media-utils"

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
  resolveDashboardRequestContext,
} from "@/lib/dashboard-state"
import { resolveDashboardSession } from "@/lib/dashboard-session"
import { ROUTES } from "@/lib/constants"
import { listMetrics } from "@/lib/metrics/registry"
import { loadPaidMediaSlice } from "@/lib/server/loaders/paid-media"

type DashboardSearchParamsRecord = Record<string, string | string[] | undefined>

type PaidMediaPageProps = {
  searchParams?: Promise<DashboardSearchParamsRecord>
}

export default async function PaidMediaPage({
  searchParams,
}: PaidMediaPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const session = await resolveDashboardSession()
  const context = resolveDashboardRequestContext({
    session,
    searchParams: resolvedSearchParams,
  })
  const data = await loadPaidMediaSlice(context)
  const metricMap = new Map(
    listMetrics().map((metric) => [metric.id, metric] as const)
  )
  const dashboardState = {
    workspaceId: context.workspaceId,
    from: context.from,
    to: context.to,
    compare: context.compare,
  }
  const comparisonText = compareLabel(context.compare)

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div>
        <SectionHeader
          eyebrow="Paid Media"
          title="All channels"
          description={`Cross-channel spend, attributed revenue, efficiency, and campaign reporting for ${formatPaidMediaDateRange(
            data.currentRange.range
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
                  href={buildDashboardHref(
                    ROUTES.settingsInputsTargets,
                    context
                  )}
                >
                  Inputs - Targets
                </Link>
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.settings.kpiMetricIds.map((metricId) => {
          const metricDefinition = metricMap.get(metricId) ?? null
          const metric = getPaidMediaMetricDefinition(metricMap, metricId)
          const currentValue = getPaidMediaMetricValue(
            metricId,
            data.currentRange.totals
          )
          const comparisonValue = data.comparison
            ? getPaidMediaMetricValue(metricId, data.comparison.totals)
            : null
          const delta = formatPaidMediaMetricDelta(
            metric,
            currentValue,
            comparisonValue,
            data.settings.currency
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
              value={formatPaidMediaMetricValue(
                metric.unit,
                currentValue,
                data.settings.currency
              )}
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

      <PaidMediaTrendChart
        currency={data.settings.currency}
        compareLabel={comparisonText}
        trend={data.currentRange.trend}
        currentTotals={data.currentRange.totals}
        comparisonTotals={data.comparison?.totals ?? null}
      />

      <div>
        {data.currentRange.channelSummary.length === 0 ? (
          <EmptyState
            title="No channel summary rows"
            description="The selected range did not return any paid-media channel totals, so the compact all-channels summary is empty."
          />
        ) : (
          <Card>
            <CardHeader className="gap-1">
              <CardDescription>Channel summary</CardDescription>
              <CardTitle>
                Compact platform view for the selected range
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Reporting-first channel totals with budget snapshots,
                efficiency, and the estimated profit proxy baseline.
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto rounded-xl border bg-background">
                <Table className="min-w-[920px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[28%]">Channel</TableHead>
                      <TableHead className="w-[12%] text-right">
                        Spend
                      </TableHead>
                      <TableHead className="w-[12%] text-right">
                        Budget
                      </TableHead>
                      <TableHead className="w-[16%] text-right">
                        Attributed Revenue
                      </TableHead>
                      <TableHead className="w-[10%] text-right">
                        Purchases
                      </TableHead>
                      <TableHead className="w-[8%] text-right">ROAS</TableHead>
                      <TableHead className="w-[8%] text-right">CPA</TableHead>
                      <TableHead className="w-[16%] text-right">
                        Est. Profit Proxy
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.currentRange.channelSummary.map((row) => (
                      <TableRow key={row.platform}>
                        <TableCell className="whitespace-normal">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{row.platform}</span>
                            <span className="text-sm text-muted-foreground">
                              {formatPaidMediaNumber(row.campaignCount)}{" "}
                              campaigns
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPaidMediaMetricValue(
                            "currency",
                            row.spend,
                            data.settings.currency
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.budget > 0
                            ? formatPaidMediaMetricValue(
                                "currency",
                                row.budget,
                                data.settings.currency
                              )
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPaidMediaMetricValue(
                            "currency",
                            row.attributedRevenue,
                            data.settings.currency
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPaidMediaNumber(row.purchases)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPaidMediaRatio(row.roas)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.cpa > 0
                            ? formatPaidMediaMetricValue(
                                "currency",
                                row.cpa,
                                data.settings.currency
                              )
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div className="inline-flex w-full items-center justify-end gap-1.5">
                            <span className="font-semibold">
                              {row.estimatedProfitProxy.value === null
                                ? "-"
                                : formatPaidMediaMetricValue(
                                    "currency",
                                    row.estimatedProfitProxy.value,
                                    data.settings.currency
                                  )}
                            </span>
                            <Badge
                              variant="outline"
                              className={confidenceBadgeClass(
                                row.estimatedProfitProxy.confidence
                              )}
                            >
                              {confidenceShort(
                                row.estimatedProfitProxy.confidence
                              )}
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <CampaignPerformanceTable
        currency={data.settings.currency}
        rows={data.currentRange.campaignRows}
        targetFormatting={data.targetFormatting}
        profitProxyModel={data.profitProxyModel}
      />
    </div>
  )
}
