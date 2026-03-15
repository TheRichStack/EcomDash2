"use client"

import { type ReactNode, useDeferredValue, useEffect, useState } from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import type { MetricCatalogSource } from "@/types/metrics"

import type {
  MetricLibraryEntry,
  MetricLibraryProvenance,
} from "./metrics-library-data"

type MetricsLibraryClientProps = {
  catalogSource: Pick<
    MetricCatalogSource,
    "status" | "source" | "completeness" | "message"
  > & {
    totalEntries: number
  }
  runtimeRegistryCount: number
  metrics: MetricLibraryEntry[]
  initialMetricId: string
}

type DetailMetadataTileProps = {
  label: string
  value: string
  note?: string
}

type DetailSectionProps = {
  title: string
  description: string
  children: ReactNode
}

type MetricDetailContentProps = {
  metric: MetricLibraryEntry
  metricsById: Record<string, MetricLibraryEntry>
  onSelectMetric: (metricId: string) => void
}

type MetricDependencyTreeProps = {
  rootMetricId: string
  metricsById: Record<string, MetricLibraryEntry>
  onSelectMetric: (metricId: string) => void
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase()
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatMetricTypeLabel(value: string) {
  return value ? value.split(/[_-]+/).map(capitalizeWord).join(" ") : "Unknown"
}

function formatMetricUnitLabel(value: MetricLibraryEntry["unit"]) {
  return value === "unknown" ? "Unknown" : value.split(/[_-]+/).map(capitalizeWord).join(" ")
}

function formatMetricDirectionLabel(value: MetricLibraryEntry["direction"]) {
  if (value === "higher_is_better") {
    return "Higher is better"
  }

  if (value === "lower_is_better") {
    return "Lower is better"
  }

  if (value === "neutral") {
    return "Neutral"
  }

  return "Unknown"
}

function formatImplementationLabel(
  value: MetricLibraryEntry["implementationStatus"]
) {
  return value === "unknown"
    ? "Unknown"
    : value.split(/[_-]+/).map(capitalizeWord).join(" ")
}

function formatProvenanceLabel(value: MetricLibraryProvenance) {
  if (value === "source_reported") {
    return "Source reported"
  }

  if (value === "derived_internal") {
    return "Derived internal"
  }

  if (value === "blended_hybrid") {
    return "Blended hybrid"
  }

  return "Not reported"
}

function capitalizeWord(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value
}

function getImplementationBadgeVariant(
  value: MetricLibraryEntry["implementationStatus"]
) {
  return value === "implemented" ? "secondary" : "outline"
}

function getSourcePreview(sources: string[]) {
  const visibleSources = sources.slice(0, 2)
  const hiddenCount = Math.max(sources.length - visibleSources.length, 0)

  return {
    visibleSources,
    hiddenCount,
  }
}

function getInitialExpandedMetricIds(metric: MetricLibraryEntry | null) {
  if (!metric) {
    return []
  }

  return [metric.id, ...metric.dependencies]
}

function MetricListRow({
  metric,
  isActive,
  onSelect,
}: {
  metric: MetricLibraryEntry
  isActive: boolean
  onSelect: () => void
}) {
  const sourcePreview = getSourcePreview(metric.sources)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors",
        "border-b last:border-b-0",
        isActive ? "bg-muted/40" : "hover:bg-muted/20"
      )}
      aria-pressed={isActive}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{metric.label}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {metric.id}
          </p>
        </div>
        {metric.runtimeAvailable ? <Badge variant="secondary">Runtime</Badge> : null}
      </div>

      <p className="line-clamp-2 text-sm text-muted-foreground">
        {metric.description}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{formatMetricTypeLabel(metric.metricType)}</Badge>
        <Badge variant="outline">{formatProvenanceLabel(metric.provenance)}</Badge>
        <Badge variant={getImplementationBadgeVariant(metric.implementationStatus)}>
          {formatImplementationLabel(metric.implementationStatus)}
        </Badge>
        {sourcePreview.visibleSources.map((source) => (
          <Badge key={`${metric.id}-${source}`} variant="outline">
            {formatMetricTypeLabel(source)}
          </Badge>
        ))}
        {sourcePreview.hiddenCount > 0 ? (
          <Badge variant="outline">+{sourcePreview.hiddenCount} more</Badge>
        ) : null}
      </div>
    </button>
  )
}

function DetailMetadataTile({
  label,
  value,
  note,
}: DetailMetadataTileProps) {
  return (
    <div className="rounded-xl border bg-muted/10 p-3">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold tracking-tight">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}

function DetailSection({
  title,
  description,
  children,
}: DetailSectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

function MetricFormulaStrip({
  metric,
  metricsById,
  onSelectMetric,
}: MetricDetailContentProps) {
  if (metric.formulaTokens.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {metric.isBase ? "Base metric" : "No token formula"}
        </Badge>
        {metric.sources.map((source) => (
          <Badge key={`${metric.id}-source-${source}`} variant="outline">
            {formatMetricTypeLabel(source)}
          </Badge>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {metric.formulaTokens.map((token, index) => {
        if (token.type === "operator") {
          return (
            <span
              key={`${metric.id}-operator-${index}`}
              className="text-sm font-semibold text-muted-foreground"
            >
              {token.value}
            </span>
          )
        }

        const targetMetric = metricsById[token.metricId]

        return (
          <Button
            key={`${metric.id}-token-${token.metricId}-${index}`}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelectMetric(token.metricId)}
            className="rounded-full"
            title={targetMetric?.description ?? token.metricId}
          >
            {targetMetric?.label ?? formatMetricTypeLabel(token.metricId)}
          </Button>
        )
      })}
    </div>
  )
}

function MetricDependencyTree({
  rootMetricId,
  metricsById,
  onSelectMetric,
}: MetricDependencyTreeProps) {
  const rootMetric = metricsById[rootMetricId] ?? null
  const [expandedMetricIds, setExpandedMetricIds] = useState<string[]>(() =>
    getInitialExpandedMetricIds(rootMetric)
  )

  function toggleMetric(metricId: string) {
    setExpandedMetricIds((currentValue) =>
      currentValue.includes(metricId)
        ? currentValue.filter((entry) => entry !== metricId)
        : [...currentValue, metricId]
    )
  }

  function renderNode(metricId: string, depth: number, ancestry: string[]) {
    const metric = metricsById[metricId]

    if (!metric) {
      return (
        <div
          key={`${metricId}-${depth}`}
          style={{ marginLeft: `${depth * 16}px` }}
          className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
        >
          Missing dependency: {metricId}
        </div>
      )
    }

    const hasDependencies = metric.dependencies.length > 0
    const isExpanded = expandedMetricIds.includes(metricId)
    const isCycle = ancestry.includes(metricId)
    const nextAncestry = [...ancestry, metricId]

    return (
      <div key={`${metricId}-${depth}`} className="flex flex-col gap-2">
        <div
          style={{ marginLeft: `${depth * 16}px` }}
          className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/10 px-3 py-2"
        >
          {hasDependencies ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => toggleMetric(metricId)}
              aria-label={isExpanded ? "Collapse dependency" : "Expand dependency"}
            >
              {isExpanded ? "-" : "+"}
            </Button>
          ) : (
            <span className="inline-flex size-7 items-center justify-center text-xs text-muted-foreground">
              .
            </span>
          )}

          <Button
            type="button"
            variant={metricId === rootMetricId ? "secondary" : "outline"}
            size="sm"
            onClick={() => onSelectMetric(metric.id)}
            className="min-w-0 max-w-full justify-start"
          >
            <span className="truncate">{metric.label}</span>
          </Button>

          <Badge variant="outline">{formatMetricTypeLabel(metric.metricType)}</Badge>
          {metric.runtimeAvailable ? <Badge variant="secondary">Runtime</Badge> : null}
        </div>

        {isCycle ? (
          <p
            style={{ marginLeft: `${(depth + 1) * 16}px` }}
            className="text-sm text-muted-foreground"
          >
            Cycle stopped at {metric.id}.
          </p>
        ) : null}

        {hasDependencies && isExpanded && !isCycle ? (
          <div className="flex flex-col gap-2">
            {metric.dependencies.map((dependencyId) =>
              renderNode(dependencyId, depth + 1, nextAncestry)
            )}
          </div>
        ) : null}
      </div>
    )
  }

  if (!rootMetric) {
    return (
      <p className="text-sm text-muted-foreground">
        The selected metric is not available in the catalog.
      </p>
    )
  }

  return <div className="flex flex-col gap-2">{renderNode(rootMetric.id, 0, [])}</div>
}

function MetricDetailContent({
  metric,
  metricsById,
  onSelectMetric,
}: MetricDetailContentProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{metric.id}</Badge>
          <Badge variant={getImplementationBadgeVariant(metric.implementationStatus)}>
            {formatImplementationLabel(metric.implementationStatus)}
          </Badge>
          {metric.runtimeAvailable ? (
            <Badge variant="secondary">In current runtime</Badge>
          ) : (
            <Badge variant="outline">Catalog only</Badge>
          )}
          <Badge variant={metric.usedInDashboard ? "secondary" : "outline"}>
            {metric.usedInDashboard ? "Used in dashboard" : "Not used in dashboard"}
          </Badge>
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">{metric.label}</h2>
          <p className="text-sm text-muted-foreground">{metric.description}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailMetadataTile
          label="Type"
          value={formatMetricTypeLabel(metric.metricType)}
        />
        <DetailMetadataTile
          label="Unit"
          value={formatMetricUnitLabel(metric.unit)}
          note={formatMetricDirectionLabel(metric.direction)}
        />
        <DetailMetadataTile
          label="Provenance"
          value={formatProvenanceLabel(metric.provenance)}
        />
        <DetailMetadataTile
          label="Dependencies"
          value={formatCount(metric.dependencies.length)}
          note={metric.isBase ? "Base metric" : "Derived metric"}
        />
      </div>

      <div className="rounded-xl border bg-muted/10 p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Sources</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {metric.sources.length ? (
                metric.sources.map((source) => (
                  <Badge key={`${metric.id}-detail-source-${source}`} variant="outline">
                    {formatMetricTypeLabel(source)}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  No sources reported.
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Aliases</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {metric.aliases.length ? (
                metric.aliases.map((alias) => (
                  <Badge key={`${metric.id}-alias-${alias}`} variant="outline">
                    {alias}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  No aliases reported.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Separator />

      <DetailSection
        title="Formula"
        description="Dependency tokens stay clickable so you can move across the catalog without leaving Settings."
      >
        <div className="rounded-xl border bg-muted/10 p-4">
          <MetricFormulaStrip
            metric={metric}
            metricsById={metricsById}
            onSelectMetric={onSelectMetric}
          />
          <div className="mt-4 rounded-lg border bg-background px-3 py-3 text-sm text-muted-foreground">
            {metric.readableFormulaText}
          </div>
        </div>
      </DetailSection>

      <DetailSection
        title="Dependencies"
        description="Jump directly into upstream metrics from the same detail surface."
      >
        <div className="flex flex-wrap items-center gap-2">
          {metric.dependencies.length ? (
            metric.dependencies.map((dependencyId) => {
              const dependencyMetric = metricsById[dependencyId]

              return (
                <Button
                  key={`${metric.id}-dependency-${dependencyId}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onSelectMetric(dependencyId)}
                >
                  {dependencyMetric?.label ?? formatMetricTypeLabel(dependencyId)}
                </Button>
              )
            })
          ) : (
            <p className="text-sm text-muted-foreground">
              No dependency metrics were reported for this definition.
            </p>
          )}
        </div>
      </DetailSection>

      <DetailSection
        title="Dependency tree"
        description="Expand nested dependencies to inspect lineage without turning the page into an admin console."
      >
        <MetricDependencyTree
          key={metric.id}
          rootMetricId={metric.id}
          metricsById={metricsById}
          onSelectMetric={onSelectMetric}
        />
      </DetailSection>
    </div>
  )
}

export function MetricsLibraryClient({
  catalogSource,
  runtimeRegistryCount,
  metrics,
  initialMetricId,
}: MetricsLibraryClientProps) {
  const isMobile = useIsMobile()
  const [searchValue, setSearchValue] = useState("")
  const [selectedMetricId, setSelectedMetricId] = useState(() => {
    if (initialMetricId && metrics.some((metric) => metric.id === initialMetricId)) {
      return initialMetricId
    }

    return metrics[0]?.id ?? ""
  })
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const deferredSearchValue = useDeferredValue(searchValue)
  const normalizedSearchValue = normalizeSearchValue(deferredSearchValue)
  const metricsById = Object.fromEntries(
    metrics.map((metric) => [metric.id, metric] as const)
  )
  const filteredMetrics = normalizedSearchValue
    ? metrics.filter((metric) => metric.searchIndex.includes(normalizedSearchValue))
    : metrics
  const activeSelectedMetricId = filteredMetrics.some(
    (metric) => metric.id === selectedMetricId
  )
    ? selectedMetricId
    : filteredMetrics[0]?.id ?? ""
  const selectedMetric = activeSelectedMetricId
    ? metricsById[activeSelectedMetricId] ?? null
    : null
  const hasSearchValue = Boolean(searchValue.trim())

  useEffect(() => {
    const nextSearchParams = new URLSearchParams(window.location.search)

    if (activeSelectedMetricId) {
      nextSearchParams.set("metricId", activeSelectedMetricId)
    } else {
      nextSearchParams.delete("metricId")
    }

    const nextUrl = `${window.location.pathname}${
      nextSearchParams.toString() ? `?${nextSearchParams.toString()}` : ""
    }`

    window.history.replaceState(window.history.state, "", nextUrl)
  }, [activeSelectedMetricId])

  function handleSelectMetric(metricId: string) {
    const targetMetric = metricsById[metricId]

    if (!targetMetric) {
      return
    }

    setSelectedMetricId(metricId)

    if (
      searchValue.trim() &&
      !targetMetric.searchIndex.includes(normalizeSearchValue(searchValue))
    ) {
      setSearchValue("")
    }

    if (isMobile) {
      setMobileDetailOpen(true)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search name, id, alias, dependency, or source"
              className="pl-9"
              disabled={catalogSource.status !== "ready"}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Badge
              variant={catalogSource.status === "ready" ? "secondary" : "destructive"}
            >
              {catalogSource.status === "ready" ? "Catalog ready" : "Catalog unavailable"}
            </Badge>
            <Badge variant="outline">
              {formatCount(catalogSource.totalEntries)} catalog metrics
            </Badge>
            <Badge variant="outline">
              {formatCount(runtimeRegistryCount)} in runtime
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Source {formatMetricTypeLabel(catalogSource.source)} -{" "}
            {formatMetricTypeLabel(catalogSource.completeness)}
          </span>
          <span>
            Search covers names, ids, descriptions, aliases, dependencies, and
            source tokens.
          </span>
          {hasSearchValue ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSearchValue("")}
            >
              <XIcon data-icon="inline-start" />
              Clear search
            </Button>
          ) : null}
        </div>
      </div>

      {catalogSource.status !== "ready" ? (
        <EmptyState
          title="Canonical metrics catalog unavailable"
          description={
            catalogSource.message ||
            "The read-only catalog did not load, so this route cannot show the full metrics library. The smaller runtime registry remains secondary context only."
          }
        />
      ) : filteredMetrics.length === 0 ? (
        <EmptyState
          title="No matching metrics"
          description="The current search does not match any catalog metrics."
          action={
            <Button type="button" variant="outline" onClick={() => setSearchValue("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-xl border bg-background">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Metrics library</p>
                <p className="text-sm text-muted-foreground">
                  {formatCount(filteredMetrics.length)} visible metric
                  {filteredMetrics.length === 1 ? "" : "s"}
                </p>
              </div>
              <Badge variant="outline">Read-only</Badge>
            </div>

            <div className="max-h-[72vh] overflow-y-auto">
              {filteredMetrics.map((metric) => (
                <MetricListRow
                  key={metric.id}
                  metric={metric}
                  isActive={metric.id === activeSelectedMetricId}
                  onSelect={() => handleSelectMetric(metric.id)}
                />
              ))}
            </div>
          </div>

          {selectedMetric ? (
            <div className="hidden lg:block">
              <div className="sticky top-4 rounded-xl border bg-background p-5 shadow-sm">
                <MetricDetailContent
                  metric={selectedMetric}
                  metricsById={metricsById}
                  onSelectMetric={handleSelectMetric}
                />
              </div>
            </div>
          ) : (
            <div className="hidden lg:block">
              <EmptyState
                title="Select a metric"
                description="Choose a metric from the list to inspect its formula, dependencies, and catalog metadata."
              />
            </div>
          )}
        </div>
      )}

      <Sheet
        open={isMobile && mobileDetailOpen && Boolean(selectedMetric)}
        onOpenChange={setMobileDetailOpen}
      >
        <SheetContent
          side="bottom"
          className="h-[85svh] rounded-t-2xl px-0 pb-0 sm:max-w-none"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{selectedMetric?.label ?? "Metric detail"}</SheetTitle>
            <SheetDescription>
              {selectedMetric?.description ?? "Metric detail in the settings library."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 pb-6 pt-6 sm:px-6">
              {selectedMetric ? (
                <MetricDetailContent
                  metric={selectedMetric}
                  metricsById={metricsById}
                  onSelectMetric={handleSelectMetric}
                />
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
