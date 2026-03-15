import { KpiCard } from "@/components/shared/kpi-card"
import { SectionHeader } from "@/components/shared/section-header"
import {
  formatDashboardDateRangeLabel,
  resolveDashboardRequestContext,
} from "@/lib/dashboard-state"
import { resolveDashboardSession } from "@/lib/dashboard-session"
import { loadShopifyInventorySlice } from "@/lib/server/loaders/shopify-inventory"

import { InventoryPageClient } from "./inventory-page-client"

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

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)
}

type ShopifyInventoryPageProps = {
  searchParams?: Promise<DashboardSearchParamsRecord>
}

export default async function ShopifyInventoryPage({
  searchParams,
}: ShopifyInventoryPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const session = await resolveDashboardSession()
  const context = resolveDashboardRequestContext({
    session,
    searchParams: resolvedSearchParams,
  })
  const data = await loadShopifyInventorySlice(context)
  const currentRangeLabel = formatDashboardDateRangeLabel(
    data.selectedRange.range.from,
    data.selectedRange.range.to
  )
  const latestSnapshotLabel = data.selectedRange.latestSnapshotDate
    ? formatDate(data.selectedRange.latestSnapshotDate)
    : "No snapshot yet"
  const metricCards = [
    {
      label: "Tracked variants",
      value: formatCount(data.kpis.trackedVariants),
      note: "Variants with Shopify inventory tracking enabled.",
    },
    {
      label: "Total units in stock",
      value: formatCount(data.kpis.totalUnitsInStock),
      note: "Latest snapshot units across tracked variants.",
    },
    {
      label: "At-risk variants",
      value: formatCount(data.kpis.atRiskVariants),
      note: "Tracked variants projected to last 14 days or fewer.",
    },
    {
      label: "Out-of-stock variants",
      value: formatCount(data.kpis.outOfStockVariants),
      note: "Tracked variants at zero or below on the latest snapshot.",
    },
  ] as const

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SectionHeader
        eyebrow="Shopify"
        title="Inventory"
        description={`Inventory position for ${formatLongDateSpan(
          data.selectedRange.range.from,
          data.selectedRange.range.to
        )}. Velocity windows recalculate sold, rate per day, days left, and estimated stockout from the latest usable snapshot.`}
        action={
          <>
            <div className="rounded-lg border bg-background px-3 py-1.5 text-sm font-medium text-foreground">
              {currentRangeLabel}
            </div>
            <div className="rounded-lg border bg-background px-3 py-1.5 text-sm text-muted-foreground">
              Snapshot: {latestSnapshotLabel}
            </div>
            {data.selectedRange.usedRangeFallback ? (
              <div className="rounded-lg border bg-background px-3 py-1.5 text-sm text-muted-foreground">
                Latest available snapshot
              </div>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => (
          <KpiCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            note={metric.note}
          />
        ))}
      </div>

      <InventoryPageClient
        rows={data.rows}
        range={data.selectedRange.range}
        latestSnapshotDate={data.selectedRange.latestSnapshotDate}
        usedRangeFallback={data.selectedRange.usedRangeFallback}
        velocity={data.velocity}
        initialState={{
          velocityWindow: readSearchParam(resolvedSearchParams, "velocityWindow"),
          stock: readSearchParam(resolvedSearchParams, "stock"),
          status: readSearchParam(resolvedSearchParams, "status"),
          query: readSearchParam(resolvedSearchParams, "q"),
          sort: readSearchParam(resolvedSearchParams, "sort"),
          direction: readSearchParam(resolvedSearchParams, "dir"),
        }}
      />
    </div>
  )
}
