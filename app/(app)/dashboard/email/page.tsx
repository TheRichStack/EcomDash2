import { KpiCard } from "@/components/shared/kpi-card"
import { MetricHelpHoverCard } from "@/components/shared/metric-help-hover-card"
import { SectionHeader } from "@/components/shared/section-header"
import {
  formatDashboardDateRangeLabel,
  resolveDashboardRequestContext,
} from "@/lib/dashboard-state"
import { resolveDashboardSession } from "@/lib/dashboard-session"
import { getMetric } from "@/lib/metrics/registry"
import { loadEmailSlice } from "@/lib/server/loaders/email"
import type { EmailKpiTotals } from "@/types/backend"
import type { DashboardCompareMode } from "@/types/dashboard"
import type { EcomDashMetricId, MetricDefinition, MetricUnit } from "@/types/metrics"

import { EmailPageClient } from "./email-page-client"

type DashboardSearchParamsRecord = Record<
  string,
  string | string[] | undefined
>

function readSearchParam(
  searchParams: DashboardSearchParamsRecord | undefined,
  key: string
) {
  const value = searchParams?.[key]

  if (Array.isArray(value)) {
    return value[0] ?? ""
  }

  return value ?? ""
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

function getMetricDefinition(metricId: EcomDashMetricId): MetricDefinition {
  return (
    getMetric(metricId) ?? {
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

function getKpiValue(metricId: EcomDashMetricId, totals: EmailKpiTotals) {
  switch (metricId) {
    case "email_revenue":
      return totals.revenue
    case "email_sends":
      return totals.sends
    case "email_open_rate":
      return totals.openRate
    case "email_click_rate":
      return totals.clickRate
    case "email_revenue_per_recipient":
      return totals.revenuePerRecipient
    case "email_placed_orders":
      return totals.placedOrders
    default:
      return null
  }
}

function formatMetricValue(
  unit: MetricUnit,
  value: number | null,
  currency: string
) {
  if (value === null) {
    return "--"
  }

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

function formatKpiDelta(
  unit: MetricUnit,
  currentValue: number | null,
  comparisonValue: number | null
) {
  if (
    currentValue === null ||
    comparisonValue === null ||
    !Number.isFinite(currentValue) ||
    !Number.isFinite(comparisonValue)
  ) {
    return null
  }

  if (unit === "percent") {
    const delta = currentValue - comparisonValue
    const sign = delta > 0 ? "+" : ""

    return `${sign}${delta.toFixed(1)}pp`
  }

  if (comparisonValue <= 0) {
    return null
  }

  const deltaPct = ((currentValue - comparisonValue) / comparisonValue) * 100
  const sign = deltaPct > 0 ? "+" : ""

  return `${sign}${deltaPct.toFixed(1)}%`
}

function getKpiNote(
  metricId: EcomDashMetricId,
  compareText: string | null,
  totals: EmailKpiTotals
) {
  if (metricId === "email_placed_orders" && totals.placedOrders === null) {
    return "Unavailable in the current Klaviyo report-table schema."
  }

  if (compareText) {
    return `vs ${compareText.toLowerCase()}`
  }

  switch (metricId) {
    case "email_revenue":
      return "Combined campaign and flow revenue for the selected range."
    case "email_sends":
      return "Combined sends across campaigns and flows."
    case "email_open_rate":
      return "Weighted unique-open rate across delivered recipients."
    case "email_click_rate":
      return "Weighted unique-click rate across delivered recipients."
    case "email_revenue_per_recipient":
      return "Revenue divided by total delivered recipients."
    case "email_placed_orders":
      return "Email-attributed orders reported by Klaviyo."
    default:
      return "Selected range value."
  }
}

type EmailPageProps = {
  searchParams?: Promise<DashboardSearchParamsRecord>
}

export default async function EmailPage({ searchParams }: EmailPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const session = await resolveDashboardSession()
  const context = resolveDashboardRequestContext({
    session,
    searchParams: resolvedSearchParams,
  })
  const data = await loadEmailSlice(context)
  const dashboardState = {
    workspaceId: context.workspaceId,
    from: context.from,
    to: context.to,
    compare: context.compare,
  }
  const comparisonText = compareLabel(context.compare)
  const currentRangeLabel = formatDashboardDateRangeLabel(
    data.currentRange.range.from,
    data.currentRange.range.to
  )
  const initialTab = readSearchParam(resolvedSearchParams, "tab")
  const initialCampaignId = readSearchParam(resolvedSearchParams, "campaignId")
  const initialFlowId = readSearchParam(resolvedSearchParams, "flowId")

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SectionHeader
        eyebrow="Email"
        title="Campaigns and flows"
        description={`Email contribution, sends, and engagement reporting for ${formatLongDateSpan(
          data.currentRange.range.from,
          data.currentRange.range.to
        )}.`}
        action={
          <>
            <div className="rounded-lg border bg-background px-3 py-1.5 text-sm font-medium text-foreground">
              {currentRangeLabel}
            </div>
            {comparisonText ? (
              <div className="rounded-lg border bg-background px-3 py-1.5 text-sm text-muted-foreground">
                Compare: {comparisonText}
              </div>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.settings.kpiMetricIds.map((metricId) => {
          const metricDefinition = getMetric(metricId)
          const metric = getMetricDefinition(metricId)
          const currentValue = getKpiValue(metricId, data.currentRange.kpis)
          const comparisonValue = data.comparison
            ? getKpiValue(metricId, data.comparison.kpis)
            : null
          const delta = formatKpiDelta(metric.unit, currentValue, comparisonValue)

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
              value={formatMetricValue(
                metric.unit,
                currentValue,
                data.settings.currency
              )}
              badge={delta ? { label: delta, variant: "outline" } : null}
              note={getKpiNote(metricId, comparisonText, data.currentRange.kpis)}
            />
          )
        })}
      </div>

      <EmailPageClient
        key={[
          context.workspaceId,
          context.from,
          context.to,
          context.compare,
          initialTab,
          initialCampaignId,
          initialFlowId,
        ].join(":")}
        campaigns={data.currentRange.campaigns}
        flows={data.currentRange.flows}
        currency={data.settings.currency}
        flowSequence={data.settings.flowSequence}
        initialState={{
          tab: initialTab,
          campaignId: initialCampaignId,
          flowId: initialFlowId,
        }}
      />
    </div>
  )
}
