import { KpiCard } from "@/components/shared/kpi-card"
import { MetricHelpHoverCard } from "@/components/shared/metric-help-hover-card"
import { SectionHeader } from "@/components/shared/section-header"
import {
  formatDashboardDateRangeLabel,
  resolveDashboardRequestContext,
} from "@/lib/dashboard-state"
import { resolveDashboardSession } from "@/lib/dashboard-session"
import { getMetric } from "@/lib/metrics/registry"
import { loadShopifyProductsSlice } from "@/lib/server/loaders/shopify-products"
import type { ShopifyProductsKpiTotals } from "@/types/backend"
import type { DashboardCompareMode } from "@/types/dashboard"
import type { EcomDashMetricId, MetricDefinition, MetricUnit } from "@/types/metrics"

import { ShopifyProductsPageClient } from "./products-page-client"

type DashboardSearchParamsRecord = Record<
  string,
  string | string[] | undefined
>

const SHOPIFY_PRODUCTS_KPI_METRIC_IDS = [
  "total_sales",
  "units_sold",
  "gross_profit",
  "product_net_profit_proxy",
  "refund_amount",
  "return_rate",
] as const satisfies readonly EcomDashMetricId[]

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

function getKpiValue(metricId: EcomDashMetricId, totals: ShopifyProductsKpiTotals) {
  switch (metricId) {
    case "total_sales":
      return totals.totalSales
    case "units_sold":
      return totals.unitsSold
    case "gross_profit":
      return totals.grossProfit
    case "product_net_profit_proxy":
      return totals.netProfit
    case "refund_amount":
      return totals.refundAmount
    case "return_rate":
      return totals.returnRate
    default:
      return 0
  }
}

function getKpiNote(metricId: EcomDashMetricId) {
  switch (metricId) {
    case "total_sales":
      return "Line-item sales in the selected range."
    case "units_sold":
      return "Sold quantity before refunds."
    case "gross_profit":
      return "Fact row gross profit summed by line item."
    case "product_net_profit_proxy":
      return "Gross profit less refund amount in v1."
    case "refund_amount":
      return "Refund value matched to selected-range orders."
    case "return_rate":
      return "Qty refunded divided by qty sold."
    default:
      return "Selected range value."
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

type ShopifyProductsPageProps = {
  searchParams?: Promise<DashboardSearchParamsRecord>
}

export default async function ShopifyProductsPage({
  searchParams,
}: ShopifyProductsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const session = await resolveDashboardSession()
  const context = resolveDashboardRequestContext({
    session,
    searchParams: resolvedSearchParams,
  })
  const data = await loadShopifyProductsSlice(context)
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

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SectionHeader
        eyebrow="Shopify"
        title="Products"
        description={`Product, SKU, and variant performance for ${formatLongDateSpan(
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
        {SHOPIFY_PRODUCTS_KPI_METRIC_IDS.map((metricId) => {
          const metricDefinition = getMetric(metricId)
          const metric = getMetricDefinition(metricId)

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
                getKpiValue(metricId, data.currentRange.kpis),
                data.settings.currency
              )}
              note={getKpiNote(metricId)}
            />
          )
        })}
      </div>

      <ShopifyProductsPageClient
        availableTags={data.currentRange.availableTags}
        breakdowns={data.currentRange.breakdowns}
        currency={data.settings.currency}
        range={data.currentRange.range}
        velocityWindows={data.velocityWindows}
        initialState={{
          breakdown: readSearchParam(resolvedSearchParams, "breakdown"),
          tag: readSearchParam(resolvedSearchParams, "tag"),
          query: readSearchParam(resolvedSearchParams, "q"),
          sort: readSearchParam(resolvedSearchParams, "sort"),
          direction: readSearchParam(resolvedSearchParams, "dir"),
        }}
      />
    </div>
  )
}
