import Link from "next/link"

import { CampaignPerformanceTable } from "./campaign-performance-table"
import { PaidMediaTrendChart } from "./paid-media-trend-chart"
import {
  compareLabel,
  formatPaidMediaDateRange,
  formatPaidMediaMetricDelta,
  formatPaidMediaMetricValue,
  getPaidMediaMetricDefinition,
  getPaidMediaMetricValue,
} from "./paid-media-utils"

import { KpiCard } from "@/components/shared/kpi-card"
import { MetricHelpHoverCard } from "@/components/shared/metric-help-hover-card"
import { SectionHeader } from "@/components/shared/section-header"
import { Button } from "@/components/ui/button"
import {
  buildDashboardHref,
  resolveDashboardRequestContext,
} from "@/lib/dashboard-state"
import { resolveDashboardSession } from "@/lib/dashboard-session"
import { ROUTES } from "@/lib/constants"
import { listMetrics } from "@/lib/metrics/registry"
import { loadPaidMediaPlatformSlice } from "@/lib/server/loaders/paid-media"
import type { PaidMediaPlatformId } from "@/types/backend"

type DashboardSearchParamsRecord = Record<
  string,
  string | string[] | undefined
>

type PaidMediaPlatformPageProps = {
  platform: PaidMediaPlatformId
  searchParams?: Promise<DashboardSearchParamsRecord>
}

const PLATFORM_CONTENT: Record<
  PaidMediaPlatformId,
  {
    title: string
    description: string
    storageKey: string
  }
> = {
  meta: {
    title: "Meta",
    description:
      "Meta spend, platform-attributed revenue, efficiency, and inline campaign hierarchy for the selected range.",
    storageKey:
      "ecomdash2.dashboard.paid_media.meta.campaign_table.visible_columns.v1",
  },
  google: {
    title: "Google",
    description:
      "Google spend, platform-attributed revenue, efficiency, and inline campaign hierarchy for the selected range.",
    storageKey:
      "ecomdash2.dashboard.paid_media.google.campaign_table.visible_columns.v1",
  },
  tiktok: {
    title: "TikTok",
    description:
      "TikTok spend, platform-attributed revenue, efficiency, and inline campaign hierarchy for the selected range.",
    storageKey:
      "ecomdash2.dashboard.paid_media.tiktok.campaign_table.visible_columns.v1",
  },
}

export async function PaidMediaPlatformPage({
  platform,
  searchParams,
}: PaidMediaPlatformPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const session = await resolveDashboardSession()
  const context = resolveDashboardRequestContext({
    session,
    searchParams: resolvedSearchParams,
  })
  const data = await loadPaidMediaPlatformSlice(context, platform)
  const content = PLATFORM_CONTENT[platform]
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
      <SectionHeader
        eyebrow="Paid Media"
        title={content.title}
        description={`${content.description} Reporting window: ${formatPaidMediaDateRange(
          data.currentRange.range
        )}.`}
        action={
          <>
            <Button asChild size="sm" variant="outline">
              <Link href={buildDashboardHref(ROUTES.paidMediaAll, context)}>
                All channels
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={buildDashboardHref(ROUTES.settingsInputsTargets, context)}>
                Inputs - Targets
              </Link>
            </Button>
          </>
        }
      />

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
        eyebrow={`${content.title} trend`}
        title="Spend, attributed revenue, and ROAS"
        description={`${content.title}-scoped performance on the shared paid-media chart card, using the same comparison mode as the all-channels route.`}
      />

      <CampaignPerformanceTable
        currency={data.settings.currency}
        rows={data.currentRange.campaignRows}
        hierarchy={data.currentRange.hierarchy}
        managerContext={data.managerContext}
        targetFormatting={data.targetFormatting}
        profitProxyModel={data.profitProxyModel}
        mode="platform"
        platform={platform}
        storageKey={content.storageKey}
        eyebrow={`${content.title} campaign performance`}
        title="Campaigns, ad sets, and ads"
        description="The shared paid-media table shell stays intact while this route adds inline hierarchy expansion, selection-driven trend analysis, platform-specific manager links, status filtering, and route-scoped column visibility."
      />
    </div>
  )
}
