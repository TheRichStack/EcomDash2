"use client"

import Image, { type ImageLoaderProps } from "next/image"
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  LayoutGridIcon,
  PlayIcon,
  RotateCcwIcon,
  SearchIcon,
  Settings2Icon,
  TablePropertiesIcon,
} from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { KpiCard } from "@/components/shared/kpi-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getNextTriStateSort,
  type TriStateSortState,
} from "@/lib/tri-state-sort"
import { cn } from "@/lib/utils"
import type {
  CreativePerformanceRow,
  CreativeSliceData,
  CreativeTotals,
} from "@/types/backend"
import type {
  EcomDashMetricId,
  MetricDefinition,
} from "@/types/metrics"

import {
  MetricHelpHoverCard,
} from "@/components/shared/metric-help-hover-card"
import {
  formatPaidMediaDateLabel,
  formatPaidMediaMetricDelta,
  formatPaidMediaMetricValue,
  humanizePaidMediaToken,
} from "../paid-media-utils"
import type { DashboardStateFields } from "@/types/dashboard"

type ViewMode = "grid" | "table"
type FormatFilter = "all" | "image" | "video" | "carousel"
type CreativeSortKey =
  | "creative"
  | "platform"
  | "spend"
  | "revenue"
  | "purchases"
  | "cpa"
  | "roas"
  | "thumbstopRate"
  | "holdRate"
type CreativeSortDirection = "asc" | "desc"

type CreativeMetricCategory = "baseline" | "outcome" | "delivery" | "video"

type CreativeMetricOption = MetricDefinition

type CreativePageClientProps = {
  data: CreativeSliceData
  metrics: CreativeMetricOption[]
  comparisonText: string | null
  dashboardState: DashboardStateFields
}

const VIEW_MODE_STORAGE_KEY =
  "ecomdash2.dashboard.paid_media.creative.view_mode.v1"
const CARDS_PER_ROW_STORAGE_KEY =
  "ecomdash2.dashboard.paid_media.creative.cards_per_row.v1"
const CARD_METRICS_STORAGE_KEY =
  "ecomdash2.dashboard.paid_media.creative.card_metrics.v1"
const LOCAL_STORAGE_EVENT = "ecomdash2-local-storage-change"

const DEFAULT_VIEW_MODE: ViewMode = "grid"
const DEFAULT_CARDS_PER_ROW = 4
const MIN_CARDS_PER_ROW = 2
const MAX_CARDS_PER_ROW = 6

const DEFAULT_SORT = {
  key: "spend",
  direction: "desc",
} as const satisfies TriStateSortState<CreativeSortKey>

const SORT_OPTIONS: ReadonlyArray<{
  key: CreativeSortKey
  direction: CreativeSortDirection
  label: string
}> = [
  { key: "spend", direction: "desc", label: "Spend high to low" },
  { key: "spend", direction: "asc", label: "Spend low to high" },
  { key: "revenue", direction: "desc", label: "Revenue high to low" },
  { key: "revenue", direction: "asc", label: "Revenue low to high" },
  { key: "purchases", direction: "desc", label: "Purchases high to low" },
  { key: "purchases", direction: "asc", label: "Purchases low to high" },
  { key: "roas", direction: "desc", label: "ROAS high to low" },
  { key: "roas", direction: "asc", label: "ROAS low to high" },
  { key: "cpa", direction: "asc", label: "CPA low to high" },
  { key: "cpa", direction: "desc", label: "CPA high to low" },
  {
    key: "thumbstopRate",
    direction: "desc",
    label: "Thumbstop high to low",
  },
  {
    key: "thumbstopRate",
    direction: "asc",
    label: "Thumbstop low to high",
  },
  { key: "holdRate", direction: "desc", label: "Hold high to low" },
  { key: "holdRate", direction: "asc", label: "Hold low to high" },
  { key: "creative", direction: "asc", label: "Creative A to Z" },
  { key: "creative", direction: "desc", label: "Creative Z to A" },
  { key: "platform", direction: "asc", label: "Platform A to Z" },
  { key: "platform", direction: "desc", label: "Platform Z to A" },
] as const

const METRIC_CATEGORY_LABELS: Record<CreativeMetricCategory, string> = {
  baseline: "Baseline",
  outcome: "Outcome",
  delivery: "Delivery",
  video: "Video",
}

function getCreativeMetricCategory(metricId: EcomDashMetricId): CreativeMetricCategory {
  if (
    metricId === "blended_ad_spend" ||
    metricId === "paid_purchases" ||
    metricId === "paid_cpa" ||
    metricId === "paid_roas" ||
    metricId === "thumbstop_rate" ||
    metricId === "hold_rate"
  ) {
    return "baseline"
  }

  if (metricId === "platform_attributed_revenue") {
    return "outcome"
  }

  if (
    metricId === "video_3s_views" ||
    metricId === "video_15s_views" ||
    metricId === "video_p25_viewed" ||
    metricId === "video_p50_viewed" ||
    metricId === "video_p75_viewed" ||
    metricId === "video_p100_viewed"
  ) {
    return "video"
  }

  return "delivery"
}

function createFallbackMetric(metricId: EcomDashMetricId): CreativeMetricOption {
  return {
    id: metricId,
    label: humanizePaidMediaToken(metricId),
    description: "No description available.",
    unit: "currency",
    direction: "neutral",
    formulaReadable: "",
    formulaTokens: [],
    dependencies: [],
    sources: [],
    isBase: false,
  }
}

function getCreativeMetricValue(
  metricId: EcomDashMetricId,
  source: CreativePerformanceRow | CreativeTotals
) {
  switch (metricId) {
    case "blended_ad_spend":
      return source.spend
    case "platform_attributed_revenue":
      return source.revenue
    case "paid_purchases":
      return source.purchases
    case "paid_cpa":
      return source.cpa
    case "paid_roas":
      return source.roas
    case "impressions":
      return source.impressions
    case "view_content":
      return source.viewContent
    case "outbound_clicks":
      return source.outboundClicks
    case "video_3s_views":
      return source.video3sViews
    case "video_15s_views":
      return source.video15sViews
    case "video_p25_viewed":
      return source.videoP25Viewed
    case "video_p50_viewed":
      return source.videoP50Viewed
    case "video_p75_viewed":
      return source.videoP75Viewed
    case "video_p100_viewed":
      return source.videoP100Viewed
    case "thumbstop_rate":
      return source.thumbstopRate
    case "hold_rate":
      return source.holdRate
    default:
      return 0
  }
}

function isVideoCreative(row: CreativePerformanceRow) {
  return (
    row.mediaType === "video" ||
    Boolean(row.videoUrl) ||
    row.video3sViews > 0 ||
    row.video15sViews > 0
  )
}

function isMetricApplicable(
  row: CreativePerformanceRow,
  metricId: EcomDashMetricId
) {
  if (metricId === "thumbstop_rate" || metricId === "hold_rate") {
    return isVideoCreative(row)
  }

  return true
}

function formatCreativeMetricDisplay(input: {
  metric: CreativeMetricOption
  value: number
  currency: string
  applicable?: boolean
}) {
  if (input.applicable === false) {
    return "-"
  }

  return formatPaidMediaMetricValue(input.metric.unit, input.value, input.currency)
}

function parseStoredMetricIds(value: string | null) {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : []
  } catch {
    return []
  }
}

function normalizeMetricSelection(
  metricIds: readonly string[],
  allowedMetricIds: readonly EcomDashMetricId[],
  fallbackMetricIds: readonly EcomDashMetricId[]
) {
  const allowed = new Set(allowedMetricIds)
  const seen = new Set<EcomDashMetricId>()
  const normalized = metricIds.filter((metricId): metricId is EcomDashMetricId => {
    if (!allowed.has(metricId as EcomDashMetricId)) {
      return false
    }

    if (seen.has(metricId as EcomDashMetricId)) {
      return false
    }

    seen.add(metricId as EcomDashMetricId)
    return true
  })

  return normalized.length > 0 ? normalized : [...fallbackMetricIds]
}

function clampCardsPerRow(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_CARDS_PER_ROW
  }

  return Math.min(MAX_CARDS_PER_ROW, Math.max(MIN_CARDS_PER_ROW, Math.round(value)))
}

function readStoredValue(key: string, fallbackValue: string) {
  try {
    const value = window.localStorage.getItem(key)
    return value === null ? fallbackValue : value
  } catch {
    return fallbackValue
  }
}

function subscribeToLocalStorage(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handleStorage = (event: Event) => {
    if (event instanceof StorageEvent) {
      if (
        event.key &&
        event.key !== VIEW_MODE_STORAGE_KEY &&
        event.key !== CARDS_PER_ROW_STORAGE_KEY &&
        event.key !== CARD_METRICS_STORAGE_KEY
      ) {
        return
      }
    }

    onStoreChange()
  }

  window.addEventListener("storage", handleStorage)
  window.addEventListener(LOCAL_STORAGE_EVENT, handleStorage)

  return () => {
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(LOCAL_STORAGE_EVENT, handleStorage)
  }
}

function useStoredLocalValue(key: string, fallbackValue: string) {
  return useSyncExternalStore(
    subscribeToLocalStorage,
    () => readStoredValue(key, fallbackValue),
    () => fallbackValue
  )
}

function persistLocalValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
    window.dispatchEvent(new Event(LOCAL_STORAGE_EVENT))
  } catch {
    // Ignore unavailable storage in local-only persistence.
  }
}

function getCreativeSortSelectionValue(
  sortKey: CreativeSortKey,
  sortDirection: CreativeSortDirection
) {
  return `${sortKey}:${sortDirection}`
}

function parseCreativeSortSelection(
  value: string
): TriStateSortState<CreativeSortKey> | null {
  const [sortKey, sortDirection] = value.split(":")

  if (
    !SORT_OPTIONS.some(
      (option) =>
        option.key === sortKey && option.direction === sortDirection
    )
  ) {
    return null
  }

  return {
    key: sortKey as CreativeSortKey,
    direction: sortDirection as CreativeSortDirection,
  }
}

function getInitialSortDirection(
  sortKey: CreativeSortKey
): CreativeSortDirection {
  if (sortKey === "creative" || sortKey === "platform" || sortKey === "cpa") {
    return "asc"
  }

  return "desc"
}

function getCreativeLabel(row: CreativePerformanceRow) {
  return row.headline || row.adName || row.creativeId
}

function getSortValue(row: CreativePerformanceRow, sortKey: CreativeSortKey) {
  switch (sortKey) {
    case "creative":
      return getCreativeLabel(row)
    case "platform":
      return row.platform
    case "revenue":
      return row.revenue
    case "purchases":
      return row.purchases
    case "roas":
      return row.roas
    case "cpa":
      return row.cpa
    case "thumbstopRate":
      return row.thumbstopRate
    case "holdRate":
      return row.holdRate
    case "spend":
    default:
      return row.spend
  }
}

function compareCreativeRows(
  left: CreativePerformanceRow,
  right: CreativePerformanceRow,
  sortKey: CreativeSortKey
) {
  const leftValue = getSortValue(left, sortKey)
  const rightValue = getSortValue(right, sortKey)

  if (typeof leftValue === "string" && typeof rightValue === "string") {
    return leftValue.localeCompare(rightValue)
  }

  return Number(leftValue) - Number(rightValue)
}

function matchesFormatFilter(row: CreativePerformanceRow, formatFilter: FormatFilter) {
  if (formatFilter === "all") {
    return true
  }

  if (formatFilter === "video") {
    return row.mediaType === "video"
  }

  if (formatFilter === "carousel") {
    return row.mediaType === "carousel"
  }

  return row.mediaType !== "video" && row.mediaType !== "carousel"
}

function buildPosterCandidates(row: CreativePerformanceRow) {
  return Array.from(
    new Set([row.thumbnailUrl, row.imageUrl].map((value) => value.trim()).filter(Boolean))
  )
}

function creativeImageLoader({ src }: ImageLoaderProps) {
  return src
}

function CreativeMetricCustomizerDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  metrics: CreativeMetricOption[]
  selectedMetricIds: EcomDashMetricId[]
  defaultMetricIds: EcomDashMetricId[]
  onApply: (metricIds: EcomDashMetricId[]) => void
}) {
  const { metrics, selectedMetricIds, defaultMetricIds, onApply, open, onOpenChange } =
    props
  const [draftMetricIds, setDraftMetricIds] =
    useState<EcomDashMetricId[]>(selectedMetricIds)
  const [searchValue, setSearchValue] = useState("")
  const deferredSearchValue = useDeferredValue(searchValue)

  useEffect(() => {
    setDraftMetricIds(selectedMetricIds)
  }, [selectedMetricIds])

  const query = deferredSearchValue.trim().toLowerCase()
  const filteredMetrics = metrics.filter((metric) => {
    if (!query) {
      return true
    }

    return `${metric.label} ${metric.description}`.toLowerCase().includes(query)
  })

  const groupedMetrics = filteredMetrics.reduce<
    Record<CreativeMetricCategory, CreativeMetricOption[]>
  >(
    (accumulator, metric) => {
      accumulator[getCreativeMetricCategory(metric.id)].push(metric)
      return accumulator
    },
    {
      baseline: [],
      outcome: [],
      delivery: [],
      video: [],
    }
  )

  const toggleMetric = (metricId: EcomDashMetricId, checked: boolean) => {
    setDraftMetricIds((currentMetricIds) => {
      if (checked) {
        return normalizeMetricSelection(
          [...currentMetricIds, metricId],
          metrics.map((metric) => metric.id),
          defaultMetricIds
        )
      }

      const nextMetricIds = currentMetricIds.filter(
        (currentMetricId) => currentMetricId !== metricId
      )

      return nextMetricIds.length > 0 ? nextMetricIds : currentMetricIds
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Creative card metrics</DialogTitle>
          <DialogDescription>
            Card-metric selection is stored locally under the EcomDash2 namespaced
            creative key.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search metrics"
          />

          <div className="max-h-[26rem] space-y-4 overflow-y-auto pr-1">
            {(
              ["baseline", "outcome", "delivery", "video"] as const
            ).map((category) => {
              const categoryMetrics = groupedMetrics[category]

              if (categoryMetrics.length === 0) {
                return null
              }

              return (
                <section key={category} className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">
                    {METRIC_CATEGORY_LABELS[category]}
                  </h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    {categoryMetrics.map((metric) => {
                      const checked = draftMetricIds.includes(metric.id)

                      return (
                        <label
                          key={metric.id}
                          className="flex items-start gap-3 rounded-xl border bg-muted/10 p-3"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              toggleMetric(metric.id, Boolean(value))
                            }
                          />
                          <span className="flex flex-col gap-1">
                            <span className="font-medium">{metric.label}</span>
                            <span className="text-sm text-muted-foreground">
                              {metric.description}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDraftMetricIds([...defaultMetricIds])}
          >
            Reset defaults
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onApply(
                normalizeMetricSelection(
                  draftMetricIds,
                  metrics.map((metric) => metric.id),
                  defaultMetricIds
                )
              )
              onOpenChange(false)
            }}
          >
            Apply metrics
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreativeMediaPreview(props: {
  row: CreativePerformanceRow
  variant: "grid" | "table"
}) {
  const { row, variant } = props
  const posterCandidates = buildPosterCandidates(row)
  const [posterIndex, setPosterIndex] = useState(0)
  const [videoFailed, setVideoFailed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  const poster = posterCandidates[posterIndex] || ""
  const canPlayInline = Boolean(row.videoUrl) && !videoFailed
  const containerClassName =
    variant === "grid"
      ? "aspect-[4/5] w-full overflow-hidden bg-muted/30"
      : "aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-lg border bg-muted/30"

  if (isPlaying && canPlayInline) {
    return (
      <div className={containerClassName}>
        <video
          className="h-full w-full object-cover"
          src={row.videoUrl}
          poster={poster || undefined}
          controls
          autoPlay
          muted
          playsInline
          preload="metadata"
          onError={() => {
            setVideoFailed(true)
            setIsPlaying(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className={`relative ${containerClassName}`}>
      {poster ? (
        <Image
          fill
          src={poster}
          loader={creativeImageLoader}
          unoptimized
          alt={row.headline || row.adName || "Creative preview"}
          className="object-cover"
          sizes={
            variant === "grid"
              ? "(min-width: 1536px) 16vw, (min-width: 1024px) 20vw, (min-width: 640px) 33vw, 100vw"
              : "80px"
          }
          onError={() => {
            if (posterIndex < posterCandidates.length - 1) {
              setPosterIndex((currentIndex) => currentIndex + 1)
            }
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
          Preview unavailable
        </div>
      )}

      {canPlayInline ? (
        <button
          type="button"
          className="absolute inset-0 flex items-center justify-center bg-black/25 text-white transition hover:bg-black/35"
          onClick={() => setIsPlaying(true)}
          aria-label={`Play ${row.headline || row.adName || "creative"} inline`}
        >
          <span className="rounded-full bg-black/55 p-3 shadow-sm">
            <PlayIcon className="size-4 fill-current" />
          </span>
        </button>
      ) : null}
    </div>
  )
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean
  direction: CreativeSortDirection
}) {
  if (!active) {
    return <ArrowUpDownIcon className="size-3.5 text-muted-foreground" />
  }

  return direction === "asc" ? (
    <ArrowUpIcon className="size-3.5 text-foreground" />
  ) : (
    <ArrowDownIcon className="size-3.5 text-foreground" />
  )
}

function SortableTableHead({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
  align = "right",
  className,
}: {
  label: string
  sortKey: CreativeSortKey
  activeSortKey: CreativeSortKey
  direction: CreativeSortDirection
  onSort: (sortKey: CreativeSortKey) => void
  align?: "left" | "right"
  className?: string
}) {
  return (
    <TableHead
      className={cn(align === "right" ? "text-right" : undefined, className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
          align === "right" ? "justify-end" : "justify-start"
        )}
      >
        <span>{label}</span>
        <SortIndicator
          active={activeSortKey === sortKey}
          direction={direction}
        />
      </button>
    </TableHead>
  )
}

export function CreativePageClient({
  data,
  metrics,
  comparisonText,
  dashboardState,
}: CreativePageClientProps) {
  const metricById = new Map(metrics.map((metric) => [metric.id, metric] as const))
  const allowedMetricIds = metrics.map((metric) => metric.id)
  const allowedMetricIdsKey = allowedMetricIds.join(",")
  const defaultMetricIds = data.settings.defaultCardMetricIds
  const defaultMetricIdsJson = JSON.stringify(defaultMetricIds)
  const [searchValue, setSearchValue] = useState("")
  const [platformFilter, setPlatformFilter] = useState("all")
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all")
  const [sortKey, setSortKey] = useState<CreativeSortKey>(DEFAULT_SORT.key)
  const [sortDirection, setSortDirection] = useState<CreativeSortDirection>(
    DEFAULT_SORT.direction
  )
  const [customizerOpen, setCustomizerOpen] = useState(false)
  const deferredSearchValue = useDeferredValue(searchValue)
  const viewMode =
    useStoredLocalValue(VIEW_MODE_STORAGE_KEY, DEFAULT_VIEW_MODE) === "table"
      ? "table"
      : DEFAULT_VIEW_MODE
  const safeCardsPerRow = clampCardsPerRow(
    Number(
      useStoredLocalValue(
        CARDS_PER_ROW_STORAGE_KEY,
        String(DEFAULT_CARDS_PER_ROW)
      )
    )
  )
  const selectedMetricIds = normalizeMetricSelection(
    parseStoredMetricIds(
      useStoredLocalValue(
        CARD_METRICS_STORAGE_KEY,
        JSON.stringify(defaultMetricIds)
      )
    ),
    allowedMetricIdsKey
      ? (allowedMetricIdsKey.split(",") as EcomDashMetricId[])
      : [],
    JSON.parse(defaultMetricIdsJson) as EcomDashMetricId[]
  )

  const platformOptions = Array.from(
    new Set(data.currentRange.rows.map((row) => row.platform).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right))
  const query = deferredSearchValue.trim().toLowerCase()
  const filteredRows = data.currentRange.rows
    .filter((row) => {
      if (platformFilter !== "all" && row.platform !== platformFilter) {
        return false
      }

      if (!matchesFormatFilter(row, formatFilter)) {
        return false
      }

      if (!query) {
        return true
      }

      return `${row.headline} ${row.adName} ${row.creativeId} ${row.adId} ${row.primaryText} ${row.landingPage}`
        .toLowerCase()
        .includes(query)
    })
    .sort((left, right) => {
      const result = compareCreativeRows(left, right, sortKey)

      if (result !== 0) {
        return sortDirection === "asc" ? result : -result
      }

      if (right.spend !== left.spend) {
        return right.spend - left.spend
      }

      const creativeLabelComparison = getCreativeLabel(left).localeCompare(
        getCreativeLabel(right)
      )

      if (creativeLabelComparison !== 0) {
        return creativeLabelComparison
      }

      return left.creativeId.localeCompare(right.creativeId)
    })
  const activeFilters =
    searchValue.trim().length > 0 ||
    platformFilter !== "all" ||
    formatFilter !== "all"
  const gridStyle = {
    "--creative-columns": safeCardsPerRow,
  } as CSSProperties
  const handleSortSelectionChange = (value: string) => {
    const nextSort = parseCreativeSortSelection(value) ?? DEFAULT_SORT

    setSortKey(nextSort.key)
    setSortDirection(nextSort.direction)
  }
  const handleColumnSort = (nextSortKey: CreativeSortKey) => {
    const nextSort = getNextTriStateSort({
      currentSort: {
        key: sortKey,
        direction: sortDirection,
      },
      nextKey: nextSortKey,
      defaultSort: DEFAULT_SORT,
      getInitialDirection: getInitialSortDirection,
    })

    setSortKey(nextSort.key)
    setSortDirection(nextSort.direction)
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {data.settings.kpiMetricIds.map((metricId) => {
          const metricDefinition = metricById.get(metricId) ?? null
          const metric = metricDefinition ?? createFallbackMetric(metricId)
          const currentValue = getCreativeMetricValue(metricId, data.currentRange.totals)
          const comparisonValue = data.comparison
            ? getCreativeMetricValue(metricId, data.comparison.totals)
            : null
          const delta = formatPaidMediaMetricDelta(
            metric as Pick<MetricDefinition, "unit" | "direction">,
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

      <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search creative, ad name, or creative ID"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Platform: All</SelectItem>
                {platformOptions.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {platform}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={formatFilter}
              onValueChange={(value) => setFormatFilter(value as FormatFilter)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Format: All</SelectItem>
                <SelectItem value="image">Format: Image</SelectItem>
                <SelectItem value="video">Format: Video</SelectItem>
                <SelectItem value="carousel">Format: Carousel</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={getCreativeSortSelectionValue(sortKey, sortDirection)}
              onValueChange={handleSortSelectionChange}
            >
              <SelectTrigger className="w-[210px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem
                    key={getCreativeSortSelectionValue(
                      option.key,
                      option.direction
                    )}
                    value={getCreativeSortSelectionValue(
                      option.key,
                      option.direction
                    )}
                  >
                    Sort: {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeFilters ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchValue("")
                  setPlatformFilter("all")
                  setFormatFilter("all")
                }}
              >
                <RotateCcwIcon data-icon="inline-start" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{filteredRows.length} visible creatives</span>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <span>{platformOptions.length} platform groups</span>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <span>One combined cross-platform creative dataset</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs
            value={viewMode}
            onValueChange={(value) => {
              if (value !== "grid" && value !== "table") {
                return
              }

              startTransition(() =>
                persistLocalValue(VIEW_MODE_STORAGE_KEY, value)
              )
            }}
          >
            <TabsList>
              <TabsTrigger value="grid">
                <LayoutGridIcon data-icon="inline-start" />
                Grid view
              </TabsTrigger>
              <TabsTrigger value="table">
                <TablePropertiesIcon data-icon="inline-start" />
                Table view
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-3">
            {viewMode === "grid" ? (
              <div className="flex items-center gap-3 text-sm">
                <label htmlFor="creative-cards-per-row" className="text-muted-foreground">
                  Cards / row
                </label>
                <input
                  id="creative-cards-per-row"
                  type="range"
                  min={MIN_CARDS_PER_ROW}
                  max={MAX_CARDS_PER_ROW}
                  value={safeCardsPerRow}
                  onChange={(event) =>
                    persistLocalValue(
                      CARDS_PER_ROW_STORAGE_KEY,
                      String(clampCardsPerRow(Number(event.target.value)))
                    )
                  }
                  className="accent-primary"
                />
                <span className="w-6 text-right font-medium tabular-nums">
                  {safeCardsPerRow}
                </span>
              </div>
            ) : null}

            <Button variant="outline" onClick={() => setCustomizerOpen(true)}>
              <Settings2Icon data-icon="inline-start" />
              Card metrics
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{selectedMetricIds.length} metrics on creative cards</span>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <span>View mode and grid density are stored locally for this route</span>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-1">
          <CardDescription>Creative performance</CardDescription>
          <CardTitle>Combined cross-platform asset view</CardTitle>
          <p className="text-sm text-muted-foreground">
            Grid and table modes stay tied to the same filtered creative dataset.
            Video assets attempt inline playback when a creative video URL is present.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {filteredRows.length === 0 ? (
            <EmptyState
              title="No matching creatives"
              description="Adjust the platform, format, or search filters to widen the current cross-platform creative view."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchValue("")
                    setPlatformFilter("all")
                    setFormatFilter("all")
                  }}
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Clear filters
                </Button>
              }
            />
          ) : viewMode === "grid" ? (
            <div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--creative-columns),minmax(0,1fr))]"
              style={gridStyle}
            >
              {filteredRows.map((row) => (
                <Card key={row.id} className="overflow-hidden border shadow-sm">
                  <CreativeMediaPreview row={row} variant="grid" />
                  <CardContent className="flex flex-col gap-4 pt-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{row.platform}</Badge>
                        {row.format ? (
                          <Badge variant="secondary">{row.format}</Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="line-clamp-2 font-medium">
                          {row.headline || row.adName || row.creativeId}
                        </p>
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {row.adName || row.primaryText || row.creativeId}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2 border-t pt-4">
                      {selectedMetricIds.map((metricId) => {
                        const metric = metricById.get(metricId) ?? createFallbackMetric(metricId)

                        return (
                          <div
                            key={`${row.id}:${metricId}`}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-muted-foreground">{metric.label}</span>
                            <span className="font-medium tabular-nums">
                              {formatCreativeMetricDisplay({
                                metric,
                                value: getCreativeMetricValue(metricId, row),
                                currency: data.settings.currency,
                                applicable: isMetricApplicable(row, metricId),
                              })}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                      <span className="truncate">{row.creativeId}</span>
                      <span className="shrink-0">
                        {row.lastSeen
                          ? `Seen ${formatPaidMediaDateLabel(row.lastSeen)}`
                          : "Current range"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-background">
              <Table className="min-w-[1180px] table-fixed">
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="Creative"
                      sortKey="creative"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={handleColumnSort}
                      align="left"
                      className="w-[34%]"
                    />
                    <SortableTableHead
                      label="Platform"
                      sortKey="platform"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={handleColumnSort}
                      align="left"
                      className="w-[12%]"
                    />
                    <SortableTableHead
                      label="Spend"
                      sortKey="spend"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={handleColumnSort}
                      className="w-[10%]"
                    />
                    <SortableTableHead
                      label="Revenue"
                      sortKey="revenue"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={handleColumnSort}
                      className="w-[10%]"
                    />
                    <SortableTableHead
                      label="Purchases"
                      sortKey="purchases"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={handleColumnSort}
                      className="w-[10%]"
                    />
                    <SortableTableHead
                      label="CPA"
                      sortKey="cpa"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={handleColumnSort}
                      className="w-[8%]"
                    />
                    <SortableTableHead
                      label="ROAS"
                      sortKey="roas"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={handleColumnSort}
                      className="w-[8%]"
                    />
                    <SortableTableHead
                      label="Thumbstop"
                      sortKey="thumbstopRate"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={handleColumnSort}
                      className="w-[9%]"
                    />
                    <SortableTableHead
                      label="Hold"
                      sortKey="holdRate"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={handleColumnSort}
                      className="w-[9%]"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => {
                    const thumbstopMetric =
                      metricById.get("thumbstop_rate") ??
                      createFallbackMetric("thumbstop_rate")
                    const holdMetric =
                      metricById.get("hold_rate") ?? createFallbackMetric("hold_rate")

                    return (
                      <TableRow key={row.id}>
                        <TableCell className="align-top">
                          <div className="flex items-start gap-3">
                            <CreativeMediaPreview row={row} variant="table" />
                            <div className="min-w-0">
                              <p className="line-clamp-2 font-medium">
                                {row.headline || row.adName || row.creativeId}
                              </p>
                              <p className="line-clamp-1 text-sm text-muted-foreground">
                                {row.adName || row.creativeId}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>{row.creativeId}</span>
                                {row.lastSeen ? (
                                  <>
                                    <span className="h-3 w-px bg-border" aria-hidden="true" />
                                    <span>Seen {formatPaidMediaDateLabel(row.lastSeen)}</span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{row.platform}</span>
                            <span className="text-sm text-muted-foreground">
                              {row.format || row.mediaType}
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
                          {formatPaidMediaMetricValue(
                            "currency",
                            row.revenue,
                            data.settings.currency
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPaidMediaMetricValue(
                            "count",
                            row.purchases,
                            data.settings.currency
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPaidMediaMetricValue(
                            "currency",
                            row.cpa,
                            data.settings.currency
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPaidMediaMetricValue(
                            "ratio",
                            row.roas,
                            data.settings.currency
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCreativeMetricDisplay({
                            metric: thumbstopMetric,
                            value: row.thumbstopRate,
                            currency: data.settings.currency,
                            applicable: isMetricApplicable(row, "thumbstop_rate"),
                          })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCreativeMetricDisplay({
                            metric: holdMetric,
                            value: row.holdRate,
                            currency: data.settings.currency,
                            applicable: isMetricApplicable(row, "hold_rate"),
                          })}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreativeMetricCustomizerDialog
        open={customizerOpen}
        onOpenChange={setCustomizerOpen}
        metrics={metrics}
        selectedMetricIds={selectedMetricIds}
        defaultMetricIds={defaultMetricIds}
        onApply={(metricIds) =>
          persistLocalValue(CARD_METRICS_STORAGE_KEY, JSON.stringify(metricIds))
        }
      />
    </>
  )
}
