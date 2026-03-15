import { FunnelBreakdownTable } from "./funnel-breakdown-table"
import { FunnelDailyTrendChart } from "./funnel-daily-trend-chart"
import { FunnelProductBreakdownTable } from "./funnel-product-breakdown-table"
import { FunnelStageConversionCard } from "./funnel-stage-conversion-card"

import { KpiCard } from "@/components/shared/kpi-card"
import { MetricHelpHoverCard } from "@/components/shared/metric-help-hover-card"
import { SectionHeader } from "@/components/shared/section-header"
import { listMetrics } from "@/lib/metrics/registry"
import {
  resolveDashboardRequestContext,
} from "@/lib/dashboard-state"
import { resolveDashboardSession } from "@/lib/dashboard-session"
import { loadShopifyFunnelSlice } from "@/lib/server/loaders/shopify-funnel"
import type { ShopifyFunnelKpiTotals } from "@/types/backend"
import type { DashboardCompareMode } from "@/types/dashboard"
import type { EcomDashMetricId, MetricDefinition, MetricUnit } from "@/types/metrics"

type DashboardSearchParamsRecord = Record<
  string,
  string | string[] | undefined
>

type ShopifyFunnelPageProps = {
  searchParams?: Promise<DashboardSearchParamsRecord>
}

type MetricDelta = {
  label: string
  variant: "secondary" | "outline"
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

function humanizeMetricId(metricId: string) {
  return metricId
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
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

function getMetricDefinition(
  metricMap: Map<EcomDashMetricId, MetricDefinition>,
  metricId: EcomDashMetricId
) {
  return (
    metricMap.get(metricId) ?? {
      id: metricId,
      label: humanizeMetricId(metricId),
      description: "No description available.",
      unit: "count",
      direction: "neutral",
      formulaReadable: "",
      formulaTokens: [],
      dependencies: [],
      sources: [],
      isBase: false,
    }
  )
}

function getKpiMetricValue(
  metricId: EcomDashMetricId,
  totals: ShopifyFunnelKpiTotals
) {
  switch (metricId) {
    case "sessions":
      return totals.sessions
    case "add_to_cart_rate":
      return totals.addToCartRate
    case "checkout_rate":
      return totals.checkoutRate
    case "purchase_conversion_rate":
      return totals.purchaseConversionRate
    case "orders_count":
      return totals.orders
    case "shopify_net_revenue":
      return totals.revenue
    default:
      return 0
  }
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
    if (Math.abs(rawDelta) < 0.05) {
      return {
        label: "Flat",
        variant: "outline",
      }
    }

    return {
      label: `${rawDelta > 0 ? "+" : ""}${formatMetricValue(
        metric.unit,
        rawDelta,
        currency
      )}`,
      variant:
        metric.direction === "lower_is_better"
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
      variant:
        metric.direction === "lower_is_better" ? "outline" : "secondary",
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

function metricNote(metricId: EcomDashMetricId, comparisonText: string | null) {
  if (comparisonText) {
    return `vs ${comparisonText.toLowerCase()}`
  }

  switch (metricId) {
    case "sessions":
      return "Store sessions from Shopify analytics"
    case "add_to_cart_rate":
      return "Overall session to add to cart rate"
    case "checkout_rate":
      return "Overall session to checkout rate"
    case "purchase_conversion_rate":
      return "Overall session to purchase rate"
    case "orders_count":
      return "Orders derived from fact_orders"
    case "shopify_net_revenue":
      return "Net revenue derived from fact_orders"
    default:
      return "Selected period metric"
  }
}

export default async function ShopifyFunnelPage({
  searchParams,
}: ShopifyFunnelPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const session = await resolveDashboardSession()
  const context = resolveDashboardRequestContext({
    session,
    searchParams: resolvedSearchParams,
  })
  const data = await loadShopifyFunnelSlice(context)
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
  const freshnessNote =
    data.currentRange.latestAvailableDate &&
    data.currentRange.latestAvailableDate < data.currentRange.range.to
      ? ` Data available through ${formatDate(data.currentRange.latestAvailableDate)}.`
      : ""

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SectionHeader
        eyebrow="Shopify"
        title="Funnel"
        description={`Store-level sessions through purchase reporting for ${formatLongDateSpan(
          data.currentRange.range.from,
          data.currentRange.range.to
        )}.${freshnessNote}`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {data.settings.kpiMetricIds.map((metricId) => {
          const metricDefinition = metricMap.get(metricId) ?? null
          const metric = getMetricDefinition(metricMap, metricId)
          const currentValue = getKpiMetricValue(metricId, data.currentRange.kpis)
          const comparisonValue = data.comparison
            ? getKpiMetricValue(metricId, data.comparison.kpis)
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
              note={metricNote(metricId, comparisonText)}
            />
          )
        })}
      </div>

      <FunnelStageConversionCard
        stages={data.currentRange.stages}
        comparisonStages={data.comparison?.stages ?? null}
        compareLabel={comparisonText}
        latestAvailableDate={data.currentRange.latestAvailableDate}
        stageCountSource={data.currentRange.stageCountSource}
      />

      <FunnelDailyTrendChart
        daily={data.currentRange.daily}
        comparisonDaily={data.comparison?.daily ?? []}
        compareLabel={comparisonText}
      />

      <FunnelBreakdownTable
        breakdowns={data.currentRange.breakdowns}
        availableDimensions={data.currentRange.availableBreakdownDimensions}
        latestAvailableDate={data.currentRange.latestAvailableDate}
      />

      <FunnelProductBreakdownTable
        breakdown={data.currentRange.productBreakdown}
        selectedRange={data.currentRange.range}
      />
    </div>
  )
}
