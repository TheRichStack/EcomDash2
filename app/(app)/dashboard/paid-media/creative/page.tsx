import Link from "next/link"

import { CreativePageClient } from "./creative-page-client"

import { SectionHeader } from "@/components/shared/section-header"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/lib/constants"
import {
  buildDashboardHref,
  resolveDashboardRequestContext,
} from "@/lib/dashboard-state"
import { resolveDashboardSession } from "@/lib/dashboard-session"
import { getMetricPool, listMetrics } from "@/lib/metrics/registry"
import { loadCreativeSlice } from "@/lib/server/loaders/paid-media"
import type {
  DashboardCompareMode,
  DashboardStateFields,
} from "@/types/dashboard"
import type { MetricDefinition } from "@/types/metrics"

import { formatPaidMediaDateRange } from "../paid-media-utils"

type DashboardSearchParamsRecord = Record<
  string,
  string | string[] | undefined
>

type CreativePageProps = {
  searchParams?: Promise<DashboardSearchParamsRecord>
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

export default async function CreativePage({
  searchParams,
}: CreativePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const session = await resolveDashboardSession()
  const context = resolveDashboardRequestContext({
    session,
    searchParams: resolvedSearchParams,
  })
  const data = await loadCreativeSlice(context)
  const metricMap = new Map(
    listMetrics().map((metric) => [metric.id, metric] as const)
  )
  const creativeMetricPool = getMetricPool("creative-card")
  const comparisonText = compareLabel(context.compare)
  const dashboardState: DashboardStateFields = {
    workspaceId: context.workspaceId,
    from: context.from,
    to: context.to,
    compare: context.compare,
  }
  const metrics = creativeMetricPool.metricIds.map((metricId) => {
    const metric = metricMap.get(metricId)

    return (
      metric ?? {
        id: metricId,
        label: metricId,
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
  })

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SectionHeader
        eyebrow="Paid Media"
        title="Creative"
        description={`Combined cross-platform creative reporting for ${formatPaidMediaDateRange(
          data.currentRange.range
        )}. The global dashboard header remains the source of truth for workspace, date range, and comparison mode.`}
        action={
          <Button asChild size="sm" variant="outline">
            <Link href={buildDashboardHref(ROUTES.paidMediaAll, context)}>
              All channels
            </Link>
          </Button>
        }
      />

      <CreativePageClient
        data={data}
        metrics={metrics as MetricDefinition[]}
        comparisonText={comparisonText}
        dashboardState={dashboardState}
      />
    </div>
  )
}
