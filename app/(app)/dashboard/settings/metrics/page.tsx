import { SectionHeader } from "@/components/shared/section-header"

import { loadSettingsPageData, type SettingsRoutePageProps } from "../settings-data"

import { MetricsLibraryClient } from "./metrics-library-client"
import { buildMetricsLibraryEntries } from "./metrics-library-data"

function readSingleSearchParam(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value.trim()
  }

  if (Array.isArray(value)) {
    return value[0]?.trim() ?? ""
  }

  return ""
}

export default async function SettingsMetricsPage({
  searchParams,
}: SettingsRoutePageProps) {
  const data = await loadSettingsPageData(searchParams)
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const initialMetricId = readSingleSearchParam(resolvedSearchParams?.metricId)
  const catalogSource = data.metrics.catalogSource
  const runtimeRegistry = data.metrics.runtimeRegistry
  const metrics =
    catalogSource.status === "ready"
      ? await buildMetricsLibraryEntries({
          catalogEntries: catalogSource.entries,
          runtimeRegistry,
        })
      : []

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SectionHeader
        eyebrow="Metrics"
        title="Canonical metrics library"
        description="Search the full read-only catalog on the left, then inspect formula lineage, dependencies, and implementation context without turning Settings into a broad admin console."
      />

      <MetricsLibraryClient
        catalogSource={{
          status: catalogSource.status,
          source: catalogSource.source,
          completeness: catalogSource.completeness,
          message: catalogSource.message,
          totalEntries: catalogSource.entries.length,
        }}
        runtimeRegistryCount={runtimeRegistry.length}
        metrics={metrics}
        initialMetricId={initialMetricId}
      />
    </div>
  )
}
