"use client"

import {
  Fragment,
  Suspense,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowUpRightIcon,
  ChartNoAxesColumnIcon,
  ChevronRightIcon,
  SearchIcon,
  Settings2Icon,
} from "lucide-react"
import { useSearchParams } from "next/navigation"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type {
  PaidMediaCampaignRow,
  PaidMediaEntityLevel,
  PaidMediaManagerContext,
  PaidMediaPlatformAdNode,
  PaidMediaPlatformAdsetNode,
  PaidMediaPlatformCampaignNode,
  PaidMediaPlatformDailyPoint,
  PaidMediaPlatformId,
  PaidMediaProfitProxyModel,
  PaidMediaProfitProxyValue,
  PaidMediaTargetFormattingConfig,
} from "@/types/backend"
import {
  buildPaidMediaEntityLink,
  type PaidMediaEntityLinkResult,
} from "@/lib/paid-media/ad-entity-links"
import {
  getNextTriStateSort,
  type TriStateSortState,
} from "@/lib/tri-state-sort"
import { cn } from "@/lib/utils"

import {
  confidenceBadgeClass,
  confidenceShort,
  evaluateTargetState,
  formatPaidMediaDateLabel,
  formatPaidMediaMetricValue,
  formatPaidMediaNumber,
  formatPaidMediaPercent,
  formatPaidMediaRatio,
  humanizePaidMediaToken,
  targetCellClass,
} from "./paid-media-utils"

type CampaignPerformanceTableProps = {
  currency: string
  rows: PaidMediaCampaignRow[]
  targetFormatting: PaidMediaTargetFormattingConfig
  profitProxyModel: PaidMediaProfitProxyModel
  mode?: "all_channels" | "platform"
  platform?: PaidMediaPlatformId
  hierarchy?: PaidMediaPlatformCampaignNode[]
  managerContext?: PaidMediaManagerContext
  storageKey?: string
  eyebrow?: string
  title?: string
  description?: string
}

type SearchParamsReader = {
  get: (name: string) => string | null
}

type ColumnCategory =
  | "core"
  | "efficiency"
  | "delivery"
  | "engagement"
  | "financial"
  | "extra"

type ColumnDefinition = {
  id: string
  label: string
  description: string
  category: ColumnCategory
}

type MetricRow = {
  spend: number
  budget: number
  attributedRevenue: number
  purchases: number
  roas: number
  cpa: number
  cpm: number
  ctr: number
  impressions: number
  clicks: number
  extraMetrics: Record<string, number>
  estimatedProfitProxy: PaidMediaProfitProxyValue
}

type SortDirection = "asc" | "desc"

type SortDefinition = {
  id: string
  label: string
  key: string
  direction: SortDirection
}

type PlatformEntityIndex = {
  campaigns: PaidMediaPlatformCampaignNode[]
  campaignById: Map<string, PaidMediaPlatformCampaignNode>
  adsetById: Map<
    string,
    {
      campaign: PaidMediaPlatformCampaignNode
      adset: PaidMediaPlatformAdsetNode
    }
  >
  adsetByRawId: Map<
    string,
    {
      campaign: PaidMediaPlatformCampaignNode
      adset: PaidMediaPlatformAdsetNode
    }
  >
  adById: Map<
    string,
    {
      campaign: PaidMediaPlatformCampaignNode
      adset: PaidMediaPlatformAdsetNode
      ad: PaidMediaPlatformAdNode
    }
  >
  adByRawId: Map<
    string,
    {
      campaign: PaidMediaPlatformCampaignNode
      adset: PaidMediaPlatformAdsetNode
      ad: PaidMediaPlatformAdNode
    }
  >
}

type FlatSelectionEntity = {
  key: string
  level: PaidMediaEntityLevel
  label: string
  parentCampaignKey?: string
  parentAdsetKey?: string
  daily: PaidMediaPlatformDailyPoint[]
}

type TrendMetricUnit = "currency" | "count" | "percent" | "ratio"

type TrendMetricDefinition = {
  id: string
  label: string
  unit: TrendMetricUnit
  axis: "left" | "right"
  color: string
}

type ConditionalFormattingState = {
  cpa: boolean
  roas: boolean
}

const TREND_METRIC_MIN = 1
const TREND_METRIC_MAX = 8
const DEFAULT_TREND_METRIC_IDS = ["spend", "revenue", "roas", "cpa"] as const
const TREND_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
] as const

const DEFAULT_ALL_CHANNELS_STORAGE_KEY =
  "ecomdash2.dashboard.paid_media.all.campaign_table.visible_columns.v1"

const EMPTY_SEARCH_PARAMS: SearchParamsReader = {
  get: () => null,
}

const DEFAULT_VISIBLE_COLUMN_IDS = [
  "spend",
  "budget",
  "roas",
  "cpa",
  "cpm",
  "ctr",
  "impressions",
  "clicks",
  "purchases",
  "revenue",
  "estimated_profit_proxy",
] as const

const STATIC_COLUMN_DEFINITIONS: ColumnDefinition[] = [
  {
    id: "spend",
    label: "Spend",
    description: "Selected-range ad spend.",
    category: "core",
  },
  {
    id: "budget",
    label: "Budget",
    description: "Latest positive daily budget within the selected range.",
    category: "core",
  },
  {
    id: "revenue",
    label: "Revenue",
    description: "Platform attributed revenue.",
    category: "core",
  },
  {
    id: "purchases",
    label: "Purchases",
    description: "Attributed purchases or conversions.",
    category: "core",
  },
  {
    id: "roas",
    label: "ROAS",
    description: "Attributed revenue divided by spend.",
    category: "efficiency",
  },
  {
    id: "cpa",
    label: "CPA",
    description: "Spend per attributed purchase.",
    category: "efficiency",
  },
  {
    id: "cpm",
    label: "CPM",
    description: "Cost per thousand impressions.",
    category: "efficiency",
  },
  {
    id: "ctr",
    label: "CTR",
    description: "Clicks divided by impressions.",
    category: "efficiency",
  },
  {
    id: "impressions",
    label: "Impressions",
    description: "Selected-range impressions.",
    category: "delivery",
  },
  {
    id: "clicks",
    label: "Clicks",
    description: "Selected-range clicks.",
    category: "delivery",
  },
  {
    id: "estimated_profit_proxy",
    label: "Est. Profit Proxy",
    description:
      "Dashboard-calculated profit proxy using the trailing baseline window.",
    category: "financial",
  },
  {
    id: "view_content",
    label: "View Content",
    description: "Content-view actions captured in the paid contract.",
    category: "engagement",
  },
  {
    id: "outbound_clicks",
    label: "Outbound Clicks",
    description: "Clicks to external destinations.",
    category: "engagement",
  },
  {
    id: "video_3s_views",
    label: "Video 3s Views",
    description: "Video views reaching 3 seconds.",
    category: "engagement",
  },
  {
    id: "video_15s_views",
    label: "Video 15s Views",
    description: "Video views reaching 15 seconds.",
    category: "engagement",
  },
  {
    id: "video_p25_viewed",
    label: "Video 25% Views",
    description: "Video views reaching 25%.",
    category: "engagement",
  },
  {
    id: "video_p50_viewed",
    label: "Video 50% Views",
    description: "Video views reaching 50%.",
    category: "engagement",
  },
  {
    id: "video_p75_viewed",
    label: "Video 75% Views",
    description: "Video views reaching 75%.",
    category: "engagement",
  },
  {
    id: "video_p100_viewed",
    label: "Video 100% Views",
    description: "Video views reaching 100%.",
    category: "engagement",
  },
  {
    id: "all_conversions",
    label: "All Conversions",
    description: "Additional conversion actions reported by the platform.",
    category: "engagement",
  },
]

const CATEGORY_LABELS: Record<ColumnCategory, string> = {
  core: "Core",
  efficiency: "Efficiency",
  delivery: "Delivery",
  engagement: "Engagement",
  financial: "Financial",
  extra: "Extra",
}

const CATEGORY_ORDER: ColumnCategory[] = [
  "core",
  "efficiency",
  "delivery",
  "engagement",
  "financial",
  "extra",
]

const DEFAULT_SORT = {
  key: "spend",
  direction: "desc",
} as const satisfies TriStateSortState<string>
const NAME_SORT_KEY = "name"
const STATUS_SORT_KEY = "status"

function readStoredColumns(storageKey: string) {
  try {
    const rawValue = window.localStorage.getItem(storageKey)

    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue) as unknown

    return Array.isArray(parsed)
      ? parsed.map((value) => String(value ?? "").trim()).filter(Boolean)
      : []
  } catch {
    return []
  }
}

function persistColumns(storageKey: string, columnIds: string[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(columnIds))
  } catch {
    // Ignore unavailable storage in local-only persistence.
  }
}

function readStoredBoolean(storageKey: string, fallback: boolean) {
  try {
    const rawValue = window.localStorage.getItem(storageKey)

    if (rawValue === null) {
      return fallback
    }

    const parsed = JSON.parse(rawValue) as unknown

    return typeof parsed === "boolean" ? parsed : fallback
  } catch {
    return fallback
  }
}

function persistBoolean(storageKey: string, value: boolean) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // Ignore unavailable storage in local-only persistence.
  }
}

function conditionalFormattingStorageKey(
  storageKey: string,
  columnId: keyof ConditionalFormattingState
) {
  return `${storageKey}.conditional_formatting.${columnId}.v1`
}

function sanitizeColumnIds(columnIds: string[], availableColumnIds: string[]) {
  const allowed = new Set(availableColumnIds)
  const seen = new Set<string>()
  const sanitized = columnIds.filter((columnId) => {
    if (!allowed.has(columnId) || seen.has(columnId)) {
      return false
    }

    seen.add(columnId)
    return true
  })

  if (sanitized.length > 0) {
    return sanitized
  }

  return DEFAULT_VISIBLE_COLUMN_IDS.filter((columnId) => allowed.has(columnId))
}

function collectExtraMetricKeys(
  rows: PaidMediaCampaignRow[],
  hierarchy: PaidMediaPlatformCampaignNode[]
) {
  const keys = new Set<string>()

  for (const row of rows) {
    Object.keys(row.extraMetrics).forEach((key) => keys.add(key))
  }

  for (const campaign of hierarchy) {
    Object.keys(campaign.extraMetrics).forEach((key) => keys.add(key))
    for (const adset of campaign.adsets) {
      Object.keys(adset.extraMetrics).forEach((key) => keys.add(key))
      for (const ad of adset.ads) {
        Object.keys(ad.extraMetrics).forEach((key) => keys.add(key))
      }
    }
  }

  return Array.from(keys)
}

function buildColumnDefinitions(
  rows: PaidMediaCampaignRow[],
  hierarchy: PaidMediaPlatformCampaignNode[]
) {
  const definitions = new Map(
    STATIC_COLUMN_DEFINITIONS.map((column) => [column.id, column] as const)
  )

  for (const key of collectExtraMetricKeys(rows, hierarchy)) {
    if (definitions.has(key)) {
      continue
    }

    definitions.set(key, {
      id: key,
      label: humanizePaidMediaToken(key),
      description:
        "Additional metric exposed from the paid-media extra-metrics map.",
      category: "extra",
    })
  }

  return Array.from(definitions.values()).sort((left, right) => {
    if (left.category !== right.category) {
      return (
        CATEGORY_ORDER.indexOf(left.category) -
        CATEGORY_ORDER.indexOf(right.category)
      )
    }

    return left.label.localeCompare(right.label)
  })
}

function getColumnValue(row: MetricRow, columnId: string) {
  if (columnId === "spend") {
    return row.spend
  }

  if (columnId === "budget") {
    return row.budget
  }

  if (columnId === "revenue") {
    return row.attributedRevenue
  }

  if (columnId === "purchases") {
    return row.purchases
  }

  if (columnId === "roas") {
    return row.roas
  }

  if (columnId === "cpa") {
    return row.cpa
  }

  if (columnId === "cpm") {
    return row.cpm
  }

  if (columnId === "ctr") {
    return row.ctr
  }

  if (columnId === "impressions") {
    return row.impressions
  }

  if (columnId === "clicks") {
    return row.clicks
  }

  if (columnId === "estimated_profit_proxy") {
    return row.estimatedProfitProxy.value ?? 0
  }

  return Number(row.extraMetrics[columnId] ?? 0)
}

function createSortId(key: string, direction: SortDirection) {
  return `${key}:${direction}`
}

function isCampaignMetricRow(
  row: MetricRow
): row is MetricRow & Pick<PaidMediaCampaignRow, "campaignName" | "campaignId"> {
  return "campaignName" in row && "campaignId" in row
}

function isHierarchyMetricRow(
  row: MetricRow
): row is MetricRow &
  Pick<PaidMediaPlatformCampaignNode, "name" | "id" | "status"> {
  return "name" in row && "id" in row && "status" in row
}

function getSortLabel(
  availableColumns: ColumnDefinition[],
  key: string,
  nameLabel: string
) {
  if (key === NAME_SORT_KEY) {
    return nameLabel
  }

  if (key === STATUS_SORT_KEY) {
    return "Status"
  }

  return (
    availableColumns.find((column) => column.id === key)?.label ??
    humanizePaidMediaToken(key)
  )
}

function getInitialSortDirection(key: string): SortDirection {
  if (key === NAME_SORT_KEY || key === STATUS_SORT_KEY || key === "cpa") {
    return "asc"
  }

  return "desc"
}

function getSortOptionDirectionLabel(
  key: string,
  direction: SortDirection
) {
  if (key === NAME_SORT_KEY || key === STATUS_SORT_KEY) {
    return direction === "asc" ? "A-Z" : "Z-A"
  }

  return direction === "asc" ? "low-high" : "high-low"
}

function buildSortOptions(args: {
  availableColumns: ColumnDefinition[]
  includeStatus: boolean
  nameLabel: string
}) {
  const { availableColumns, includeStatus, nameLabel } = args
  const sortKeys = [
    NAME_SORT_KEY,
    ...(includeStatus ? [STATUS_SORT_KEY] : []),
    ...availableColumns.map((column) => column.id),
  ]

  return sortKeys.flatMap((key) => {
    const initialDirection = getInitialSortDirection(key)
    const oppositeDirection = initialDirection === "asc" ? "desc" : "asc"
    const label = getSortLabel(availableColumns, key, nameLabel)

    return [
      {
        id: createSortId(key, initialDirection),
        key,
        direction: initialDirection,
        label: `${label} (${getSortOptionDirectionLabel(key, initialDirection)})`,
      },
      {
        id: createSortId(key, oppositeDirection),
        key,
        direction: oppositeDirection,
        label: `${label} (${getSortOptionDirectionLabel(key, oppositeDirection)})`,
      },
    ] satisfies SortDefinition[]
  })
}

function getSortableRowLabel(row: MetricRow) {
  if (isCampaignMetricRow(row)) {
    return row.campaignName || row.campaignId
  }

  if (isHierarchyMetricRow(row)) {
    return row.name || row.id
  }

  return ""
}

function getSortableRowIdentity(row: MetricRow) {
  if (isCampaignMetricRow(row)) {
    return row.campaignId
  }

  if (isHierarchyMetricRow(row)) {
    return row.id
  }

  return ""
}

function getSortableRowStatus(row: MetricRow) {
  return isHierarchyMetricRow(row) ? normalizeStatus(row.status) : ""
}

function compareRowsForSort<T extends MetricRow>(
  left: T,
  right: T,
  sortKey: string
) {
  if (sortKey === NAME_SORT_KEY) {
    const labelDifference = getSortableRowLabel(left).localeCompare(
      getSortableRowLabel(right)
    )

    if (labelDifference !== 0) {
      return labelDifference
    }

    return getSortableRowIdentity(left).localeCompare(getSortableRowIdentity(right))
  }

  if (sortKey === STATUS_SORT_KEY) {
    const statusDifference = getSortableRowStatus(left).localeCompare(
      getSortableRowStatus(right)
    )

    if (statusDifference !== 0) {
      return statusDifference
    }

    return compareRowsForSort(left, right, NAME_SORT_KEY)
  }

  const difference = getColumnValue(left, sortKey) - getColumnValue(right, sortKey)

  if (difference !== 0) {
    return difference
  }

  return compareRowsForSort(left, right, NAME_SORT_KEY)
}

function sortMetricRows<T extends MetricRow>(
  rows: T[],
  sortDefinition: SortDefinition
) {
  const nextRows = [...rows]

  nextRows.sort((left, right) => {
    const difference = compareRowsForSort(left, right, sortDefinition.key)

    if (difference !== 0) {
      return sortDefinition.direction === "asc" ? difference : -difference
    }

    return 0
  })

  return nextRows
}

function normalizeStatus(value: string) {
  return (
    String(value ?? "")
      .trim()
      .toLowerCase() || "unknown"
  )
}

function formatStatusLabel(value: string) {
  const normalized = normalizeStatus(value)
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ")
}

function buildPlatformEntityIndex(
  hierarchy: PaidMediaPlatformCampaignNode[]
): PlatformEntityIndex {
  const campaignById = new Map<string, PaidMediaPlatformCampaignNode>()
  const adsetById = new Map<
    string,
    {
      campaign: PaidMediaPlatformCampaignNode
      adset: PaidMediaPlatformAdsetNode
    }
  >()
  const adsetByRawId = new Map<
    string,
    {
      campaign: PaidMediaPlatformCampaignNode
      adset: PaidMediaPlatformAdsetNode
    }
  >()
  const adById = new Map<
    string,
    {
      campaign: PaidMediaPlatformCampaignNode
      adset: PaidMediaPlatformAdsetNode
      ad: PaidMediaPlatformAdNode
    }
  >()
  const adByRawId = new Map<
    string,
    {
      campaign: PaidMediaPlatformCampaignNode
      adset: PaidMediaPlatformAdsetNode
      ad: PaidMediaPlatformAdNode
    }
  >()

  for (const campaign of hierarchy) {
    campaignById.set(campaign.id, campaign)

    for (const adset of campaign.adsets) {
      const adsetPath = { campaign, adset }
      adsetById.set(`${campaign.id}::${adset.id}`, adsetPath)

      if (!adsetByRawId.has(adset.id)) {
        adsetByRawId.set(adset.id, adsetPath)
      }

      for (const ad of adset.ads) {
        const adPath = {
          campaign,
          adset,
          ad,
        }

        adById.set(`${campaign.id}::${adset.id}::${ad.id}`, adPath)

        if (!adByRawId.has(ad.id)) {
          adByRawId.set(ad.id, adPath)
        }
      }
    }
  }

  return {
    campaigns: hierarchy,
    campaignById,
    adsetById,
    adsetByRawId,
    adById,
    adByRawId,
  }
}

function campaignSelectionKey(campaignId: string) {
  return `c:${campaignId}`
}

function adsetSelectionKey(campaignId: string, adsetId: string) {
  return `s:${campaignId}|${adsetId}`
}

function adSelectionKey(campaignId: string, adsetId: string, adId: string) {
  return `a:${campaignId}|${adsetId}|${adId}`
}

function selectionLevelFromKey(key: string): PaidMediaEntityLevel | "unknown" {
  if (key.startsWith("c:")) {
    return "campaign"
  }

  if (key.startsWith("s:")) {
    return "adset"
  }

  if (key.startsWith("a:")) {
    return "ad"
  }

  return "unknown"
}

function matchesSearchQuery(query: string, value: string) {
  if (!query) {
    return true
  }

  return value.toLowerCase().includes(query)
}

function formatTrendMetricValue(
  unit: TrendMetricUnit,
  value: number,
  currency: string
) {
  if (unit === "currency") {
    return formatPaidMediaMetricValue("currency", value, currency)
  }

  if (unit === "ratio") {
    return formatPaidMediaRatio(value)
  }

  if (unit === "percent") {
    return formatPaidMediaPercent(value)
  }

  return formatPaidMediaNumber(value)
}

function formatCompactAxisValue(value: number) {
  const magnitude = Math.abs(value)

  return new Intl.NumberFormat("en-US", {
    notation: magnitude >= 1000 ? "compact" : "standard",
    maximumFractionDigits: magnitude >= 1000 ? 1 : 0,
  }).format(value)
}

function formatAxisTickForUnit(
  unit: TrendMetricUnit,
  value: number,
  currency: string
) {
  const magnitude = Math.abs(value)

  if (unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: magnitude >= 1000 ? "compact" : "standard",
      maximumFractionDigits: magnitude >= 1000 ? 1 : 0,
    }).format(value)
  }

  if (unit === "count") {
    return formatCompactAxisValue(value)
  }

  if (unit === "percent") {
    return `${value.toFixed(magnitude < 10 ? 1 : 0)}%`
  }

  return `${value.toFixed(magnitude < 10 ? 1 : 0)}x`
}

function collectAxisUnits(
  metricIds: string[],
  metricDefinitionMap: Map<string, TrendMetricDefinition>,
  axis: TrendMetricDefinition["axis"]
) {
  const units = new Set<TrendMetricUnit>()

  metricIds.forEach((metricId) => {
    const metric = metricDefinitionMap.get(metricId)

    if (metric?.axis === axis) {
      units.add(metric.unit)
    }
  })

  return Array.from(units)
}

function formatAxisTickForUnits(
  units: TrendMetricUnit[],
  value: number,
  currency: string
) {
  if (units.length !== 1) {
    return formatCompactAxisValue(value)
  }

  return formatAxisTickForUnit(units[0], value, currency)
}

function metricUnitForColumn(columnId: string): TrendMetricUnit {
  if (
    columnId === "spend" ||
    columnId === "budget" ||
    columnId === "revenue" ||
    columnId === "cpa" ||
    columnId === "cpm" ||
    columnId === "estimated_profit_proxy"
  ) {
    return "currency"
  }

  if (columnId === "roas") {
    return "ratio"
  }

  if (columnId === "ctr") {
    return "percent"
  }

  return "count"
}

function buildTrendMetricDefinitions(columns: ColumnDefinition[]) {
  return columns.map((column, index) => {
    const unit = metricUnitForColumn(column.id)

    return {
      id: column.id,
      label: column.label,
      unit,
      axis: unit === "ratio" || unit === "percent" ? "right" : "left",
      color: TREND_COLORS[index % TREND_COLORS.length],
    } satisfies TrendMetricDefinition
  })
}

function sanitizeTrendMetricIds(
  metricIds: string[],
  availableMetricIds: string[]
) {
  const available = new Set(availableMetricIds)
  const seen = new Set<string>()
  const sanitized = metricIds.filter((metricId) => {
    if (!available.has(metricId) || seen.has(metricId)) {
      return false
    }

    seen.add(metricId)
    return true
  })

  if (sanitized.length >= TREND_METRIC_MIN) {
    return sanitized.slice(0, TREND_METRIC_MAX)
  }

  const fallback = DEFAULT_TREND_METRIC_IDS.filter((metricId) =>
    available.has(metricId)
  )

  if (fallback.length > 0) {
    return fallback.slice(0, TREND_METRIC_MAX)
  }

  return availableMetricIds.slice(0, Math.max(1, TREND_METRIC_MIN))
}

function calculateEstimatedProfitProxyValue(
  model: PaidMediaProfitProxyModel,
  attributedRevenue: number,
  spend: number
) {
  if (model.effectiveMarginPct === null) {
    return null
  }

  return attributedRevenue * model.effectiveMarginPct - spend
}

function dailyMetricValue(
  point: PaidMediaPlatformDailyPoint,
  metricId: string,
  profitProxyModel: PaidMediaProfitProxyModel
) {
  if (metricId === "spend") {
    return point.spend
  }

  if (metricId === "budget") {
    return point.budget
  }

  if (metricId === "revenue") {
    return point.attributedRevenue
  }

  if (metricId === "purchases") {
    return point.purchases
  }

  if (metricId === "roas") {
    return point.spend > 0 ? point.attributedRevenue / point.spend : 0
  }

  if (metricId === "cpa") {
    return point.purchases > 0 ? point.spend / point.purchases : 0
  }

  if (metricId === "cpm") {
    return point.impressions > 0 ? (point.spend * 1000) / point.impressions : 0
  }

  if (metricId === "ctr") {
    return point.impressions > 0 ? (point.clicks / point.impressions) * 100 : 0
  }

  if (metricId === "impressions") {
    return point.impressions
  }

  if (metricId === "clicks") {
    return point.clicks
  }

  if (metricId === "estimated_profit_proxy") {
    return (
      calculateEstimatedProfitProxyValue(
        profitProxyModel,
        point.attributedRevenue,
        point.spend
      ) ?? 0
    )
  }

  return Number(point.extraMetrics[metricId] ?? 0)
}

function buildSelectionEntityIndex(hierarchy: PaidMediaPlatformCampaignNode[]) {
  const map = new Map<string, FlatSelectionEntity>()

  for (const campaign of hierarchy) {
    const campaignKey = campaignSelectionKey(campaign.id)
    map.set(campaignKey, {
      key: campaignKey,
      level: "campaign",
      label: campaign.name || campaign.id,
      daily: campaign.daily,
    })

    for (const adset of campaign.adsets) {
      const nextAdsetKey = adsetSelectionKey(campaign.id, adset.id)
      map.set(nextAdsetKey, {
        key: nextAdsetKey,
        level: "adset",
        label: adset.name || adset.id,
        parentCampaignKey: campaignKey,
        daily: adset.daily,
      })

      for (const ad of adset.ads) {
        const nextAdKey = adSelectionKey(campaign.id, adset.id, ad.id)
        map.set(nextAdKey, {
          key: nextAdKey,
          level: "ad",
          label: ad.name || ad.id,
          parentCampaignKey: campaignKey,
          parentAdsetKey: nextAdsetKey,
          daily: ad.daily,
        })
      }
    }
  }

  return map
}

function buildCampaignSelectionEntityIndex(rows: PaidMediaCampaignRow[]) {
  const map = new Map<string, FlatSelectionEntity>()

  for (const row of rows) {
    const key = campaignSelectionKey(row.campaignId)
    map.set(key, {
      key,
      level: "campaign",
      label: row.campaignName || row.campaignId,
      daily: row.daily,
    })
  }

  return map
}

function aggregateSelectedDailyPoints(entities: FlatSelectionEntity[]) {
  const byDate = new Map<string, PaidMediaPlatformDailyPoint>()

  for (const entity of entities) {
    for (const point of entity.daily) {
      const existing = byDate.get(point.date) ?? {
        date: point.date,
        spend: 0,
        budget: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        attributedRevenue: 0,
        extraMetrics: {},
      }

      existing.spend += point.spend
      existing.budget = Math.max(existing.budget, point.budget)
      existing.impressions += point.impressions
      existing.clicks += point.clicks
      existing.purchases += point.purchases
      existing.attributedRevenue += point.attributedRevenue
      Object.entries(point.extraMetrics).forEach(([key, value]) => {
        existing.extraMetrics[key] =
          Number(existing.extraMetrics[key] ?? 0) + value
      })
      byDate.set(point.date, existing)
    }
  }

  return Array.from(byDate.values()).sort((left, right) =>
    left.date.localeCompare(right.date)
  )
}

function buildMetricTotals(
  rows: MetricRow[],
  profitProxyModel: PaidMediaProfitProxyModel
): MetricRow {
  const totals = rows.reduce<MetricRow>(
    (accumulator, row) => {
      accumulator.spend += row.spend
      accumulator.budget += row.budget
      accumulator.attributedRevenue += row.attributedRevenue
      accumulator.purchases += row.purchases
      accumulator.impressions += row.impressions
      accumulator.clicks += row.clicks
      Object.entries(row.extraMetrics).forEach(([key, value]) => {
        accumulator.extraMetrics[key] =
          Number(accumulator.extraMetrics[key] ?? 0) + value
      })
      return accumulator
    },
    {
      spend: 0,
      budget: 0,
      attributedRevenue: 0,
      purchases: 0,
      roas: 0,
      cpa: 0,
      cpm: 0,
      ctr: 0,
      impressions: 0,
      clicks: 0,
      extraMetrics: {},
      estimatedProfitProxy: {
        value: null,
        band: 0,
        confidence: profitProxyModel.confidence,
        state: "unavailable",
      },
    }
  )

  totals.roas = totals.spend > 0 ? totals.attributedRevenue / totals.spend : 0
  totals.cpa = totals.purchases > 0 ? totals.spend / totals.purchases : 0
  totals.cpm =
    totals.impressions > 0 ? (totals.spend * 1000) / totals.impressions : 0
  totals.ctr =
    totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
  totals.estimatedProfitProxy = {
    value: calculateEstimatedProfitProxyValue(
      profitProxyModel,
      totals.attributedRevenue,
      totals.spend
    ),
    band: Math.max(10, totals.spend * 0.03),
    confidence: profitProxyModel.confidence,
    state: "unavailable",
  }

  if (totals.estimatedProfitProxy.value !== null) {
    const band = totals.estimatedProfitProxy.band
    totals.estimatedProfitProxy.state =
      totals.estimatedProfitProxy.value > band
        ? "profit"
        : totals.estimatedProfitProxy.value < -band
          ? "loss"
          : "breakeven"
  }

  return totals
}

function collectHierarchyStatuses(hierarchy: PaidMediaPlatformCampaignNode[]) {
  const statuses = new Set<string>()

  for (const campaign of hierarchy) {
    statuses.add(normalizeStatus(campaign.status))

    for (const adset of campaign.adsets) {
      statuses.add(normalizeStatus(adset.status))

      for (const ad of adset.ads) {
        statuses.add(normalizeStatus(ad.status))
      }
    }
  }

  return Array.from(statuses)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
}

function filterPlatformHierarchy(args: {
  campaigns: PaidMediaPlatformCampaignNode[]
  query: string
  statusFilter: string
  sortDefinition: SortDefinition
}) {
  const { campaigns, query, statusFilter, sortDefinition } = args
  const normalizedQuery = query.trim().toLowerCase()
  const statusMatches = (status: string) =>
    statusFilter === "all" || normalizeStatus(status) === statusFilter

  const filteredCampaigns = campaigns.flatMap((campaign) => {
    const campaignQueryMatches = matchesSearchQuery(
      normalizedQuery,
      `${campaign.name} ${campaign.id}`
    )

    const filteredAdsets = sortMetricRows(
      campaign.adsets.flatMap((adset) => {
        const adsetQueryMatches = matchesSearchQuery(
          normalizedQuery,
          `${adset.name} ${adset.id}`
        )
        const filteredAds = sortMetricRows(
          adset.ads.filter((ad) => {
            if (!statusMatches(ad.status)) {
              return false
            }

            if (!normalizedQuery) {
              return true
            }

            return (
              campaignQueryMatches ||
              adsetQueryMatches ||
              matchesSearchQuery(normalizedQuery, `${ad.name} ${ad.id}`)
            )
          }),
          sortDefinition
        )
        const includeAdset =
          (statusMatches(adset.status) &&
            (!normalizedQuery || campaignQueryMatches || adsetQueryMatches)) ||
          filteredAds.length > 0

        if (!includeAdset) {
          return []
        }

        return [
          {
            ...adset,
            ads: filteredAds,
          },
        ]
      }),
      sortDefinition
    )
    const includeCampaign =
      (statusMatches(campaign.status) &&
        (!normalizedQuery || campaignQueryMatches)) ||
      filteredAdsets.length > 0

    if (!includeCampaign) {
      return []
    }

    return [
      {
        ...campaign,
        adsets: filteredAdsets,
      },
    ]
  })

  return sortMetricRows(filteredCampaigns, sortDefinition)
}

function statusToneClass(status: string) {
  const normalized = normalizeStatus(status)

  if (
    normalized === "active" ||
    normalized === "enabled" ||
    normalized === "serving"
  ) {
    return "bg-emerald-500"
  }

  if (
    normalized === "paused" ||
    normalized === "inactive" ||
    normalized === "limited"
  ) {
    return "bg-amber-500"
  }

  if (
    normalized === "deleted" ||
    normalized === "disapproved" ||
    normalized === "rejected"
  ) {
    return "bg-rose-500"
  }

  return "bg-muted-foreground"
}

function StatusIndicator({ status }: { status: string }) {
  return (
    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${statusToneClass(status)}`}
      />
      <span>{formatStatusLabel(status)}</span>
    </div>
  )
}

function EntityLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
    >
      <span className="truncate">{label}</span>
      <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  )
}

function SelectionTrendChartCard({
  currency,
  metricDefinitions,
  selectedLabel,
  dailyPoints,
  profitProxyModel,
}: {
  currency: string
  metricDefinitions: TrendMetricDefinition[]
  selectedLabel: string
  dailyPoints: PaidMediaPlatformDailyPoint[]
  profitProxyModel: PaidMediaProfitProxyModel
}) {
  const chartId = useId().replace(/:/g, "")
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>(() =>
    sanitizeTrendMetricIds(
      [...DEFAULT_TREND_METRIC_IDS],
      metricDefinitions.map((metric) => metric.id)
    )
  )
  const [metricNotice, setMetricNotice] = useState("")
  const metricDefinitionMap = useMemo(
    () =>
      new Map(metricDefinitions.map((metric) => [metric.id, metric] as const)),
    [metricDefinitions]
  )
  const metricLabelMap = useMemo(
    () =>
      new Map(
        metricDefinitions.map((metric) => [metric.label, metric] as const)
      ),
    [metricDefinitions]
  )
  const allowedMetricIds = useMemo(
    () => metricDefinitions.map((metric) => metric.id),
    [metricDefinitions]
  )
  const effectiveMetricIds = useMemo(
    () => sanitizeTrendMetricIds(selectedMetricIds, allowedMetricIds),
    [allowedMetricIds, selectedMetricIds]
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedMetricIds((currentMetricIds) =>
      sanitizeTrendMetricIds(currentMetricIds, allowedMetricIds)
    )
  }, [allowedMetricIds])

  useEffect(() => {
    if (!metricNotice) {
      return
    }

    const timeoutId = window.setTimeout(() => setMetricNotice(""), 2200)

    return () => window.clearTimeout(timeoutId)
  }, [metricNotice])

  const chartData = dailyPoints.map((point) => {
    const row: Record<string, number | string> = {
      label: point.date,
    }

    effectiveMetricIds.forEach((metricId) => {
      row[metricId] = dailyMetricValue(point, metricId, profitProxyModel)
    })

    return row
  })
  const chartConfig = Object.fromEntries(
    effectiveMetricIds.map((metricId) => {
      const metric = metricDefinitionMap.get(metricId)

      return [
        metricId,
        {
          label: metric?.label ?? humanizePaidMediaToken(metricId),
          color: metric?.color ?? TREND_COLORS[0],
        },
      ]
    })
  ) satisfies ChartConfig
  const leftAxisUnits = useMemo(
    () => collectAxisUnits(effectiveMetricIds, metricDefinitionMap, "left"),
    [effectiveMetricIds, metricDefinitionMap]
  )
  const rightAxisUnits = useMemo(
    () => collectAxisUnits(effectiveMetricIds, metricDefinitionMap, "right"),
    [effectiveMetricIds, metricDefinitionMap]
  )
  const hasRightAxis = rightAxisUnits.length > 0

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1">
            <CardDescription>Selection trend</CardDescription>
            <CardTitle>Selected entities over time</CardTitle>
            <p className="text-sm text-muted-foreground">
              Aggregated from the checked campaign, ad set, and ad rows. Parent
              selections suppress selected children to avoid double-counting.
            </p>
          </div>
          <div className="text-sm text-muted-foreground">{selectedLabel}</div>
        </div>
        <div className="flex flex-col gap-2">
          <ToggleGroup
            type="multiple"
            value={effectiveMetricIds}
            onValueChange={(nextMetricIds) => {
              const seen = new Set<string>()
              const normalized = nextMetricIds.filter((metricId) => {
                if (
                  !allowedMetricIds.includes(metricId) ||
                  seen.has(metricId)
                ) {
                  return false
                }

                seen.add(metricId)
                return true
              })

              if (normalized.length < TREND_METRIC_MIN) {
                setMetricNotice("Keep at least one metric selected.")
                return
              }

              if (normalized.length > TREND_METRIC_MAX) {
                setMetricNotice(`Select up to ${TREND_METRIC_MAX} metrics.`)
                return
              }

              setSelectedMetricIds(normalized)
            }}
            className="flex flex-wrap gap-2"
          >
            {metricDefinitions.map((metric) => {
              const selected = effectiveMetricIds.includes(metric.id)
              const disableAdd =
                !selected && effectiveMetricIds.length >= TREND_METRIC_MAX

              return (
                <ToggleGroupItem
                  key={metric.id}
                  value={metric.id}
                  variant="outline"
                  size="sm"
                  disabled={disableAdd}
                >
                  {metric.label}
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Select {TREND_METRIC_MIN}-{TREND_METRIC_MAX} chart metrics
              independently from the visible table columns.
            </span>
            {metricNotice ? (
              <>
                <span className="h-4 w-px bg-border" aria-hidden="true" />
                <span>{metricNotice}</span>
              </>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {effectiveMetricIds.length === 0 || chartData.length === 0 ? (
          <EmptyState
            title="Selection trend unavailable"
            description={
              effectiveMetricIds.length === 0
                ? "Select at least one metric to render the selected-entity chart."
                : "The selected rows did not return daily data for the current range."
            }
          />
        ) : (
          <ChartContainer
            className="h-80 w-full"
            config={chartConfig}
            id={chartId}
          >
            <LineChart
              data={chartData}
              margin={{
                top: 12,
                right: hasRightAxis ? 12 : 8,
                left: 4,
                bottom: 0,
              }}
            >
              <CartesianGrid vertical={false} strokeDasharray="4 4" />
              <ChartLegend
                verticalAlign="top"
                align="left"
                content={
                  <ChartLegendContent
                    verticalAlign="top"
                    className="justify-start"
                  />
                }
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={formatPaidMediaDateLabel}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                yAxisId="left"
                width={
                  leftAxisUnits.length === 1 && leftAxisUnits[0] === "currency"
                    ? 80
                    : 64
                }
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  formatAxisTickForUnits(
                    leftAxisUnits,
                    Number(value ?? 0),
                    currency
                  )
                }
              />
              {hasRightAxis ? (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  width={60}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) =>
                    formatAxisTickForUnits(
                      rightAxisUnits,
                      Number(value ?? 0),
                      currency
                    )
                  }
                />
              ) : null}
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) =>
                      formatPaidMediaDateLabel(String(value ?? ""))
                    }
                    formatter={(value, name) => {
                      const metric = metricLabelMap.get(String(name ?? ""))

                      return (
                        <div className="flex min-w-36 items-center justify-between gap-4">
                          <span className="text-muted-foreground">
                            {metric?.label ?? name}
                          </span>
                          <span className="font-mono font-medium text-foreground tabular-nums">
                            {formatTrendMetricValue(
                              metric?.unit ?? "count",
                              Number(value ?? 0),
                              currency
                            )}
                          </span>
                        </div>
                      )
                    }}
                  />
                }
              />
              {effectiveMetricIds.map((metricId) => {
                const metric = metricDefinitionMap.get(metricId)

                return (
                  <Line
                    key={metricId}
                    type="monotone"
                    dataKey={metricId}
                    name={metric?.label ?? metricId}
                    yAxisId={metric?.axis ?? "left"}
                    stroke={`var(--color-${metricId})`}
                    strokeWidth={2.25}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    connectNulls
                  />
                )
              })}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

function ColumnCustomizerDialog({
  open,
  onOpenChange,
  availableColumns,
  selectedColumns,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableColumns: ColumnDefinition[]
  selectedColumns: string[]
  onApply: (columnIds: string[]) => void
}) {
  const [draftColumns, setDraftColumns] = useState<string[]>(selectedColumns)
  const [searchValue, setSearchValue] = useState("")
  const deferredSearchValue = useDeferredValue(searchValue)

  const filteredColumns = availableColumns.filter((column) => {
    const query = deferredSearchValue.trim().toLowerCase()

    if (!query) {
      return true
    }

    return `${column.label} ${column.description}`.toLowerCase().includes(query)
  })

  const groupedColumns = filteredColumns.reduce<
    Record<ColumnCategory, ColumnDefinition[]>
  >(
    (accumulator, column) => {
      accumulator[column.category].push(column)
      return accumulator
    },
    {
      core: [],
      efficiency: [],
      delivery: [],
      engagement: [],
      financial: [],
      extra: [],
    }
  )

  const toggleColumn = (columnId: string, checked: boolean) => {
    setDraftColumns((currentColumns) => {
      if (checked) {
        return sanitizeColumnIds(
          [...currentColumns, columnId],
          availableColumns.map((column) => column.id)
        )
      }

      const nextColumns = currentColumns.filter(
        (currentColumnId) => currentColumnId !== columnId
      )

      return nextColumns.length > 0 ? nextColumns : currentColumns
    })
  }

  useEffect(() => {
    setDraftColumns(selectedColumns)
  }, [selectedColumns])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Customize campaign columns</DialogTitle>
          <DialogDescription>
            Column visibility is stored locally for this route under the
            EcomDash2 namespaced key.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search metrics"
          />

          <div className="max-h-[26rem] space-y-4 overflow-y-auto pr-1">
            {CATEGORY_ORDER.map((category) => {
              const columns = groupedColumns[category]

              if (columns.length === 0) {
                return null
              }

              return (
                <section key={category} className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    {columns.map((column) => {
                      const checked = draftColumns.includes(column.id)

                      return (
                        <label
                          key={column.id}
                          className="flex items-start gap-3 rounded-xl border bg-muted/10 p-3"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              toggleColumn(column.id, Boolean(value))
                            }
                          />
                          <span className="flex flex-col gap-1">
                            <span className="font-medium">{column.label}</span>
                            <span className="text-sm text-muted-foreground">
                              {column.description}
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
            onClick={() =>
              setDraftColumns(
                sanitizeColumnIds(
                  [...DEFAULT_VISIBLE_COLUMN_IDS],
                  availableColumns.map((column) => column.id)
                )
              )
            }
          >
            Reset defaults
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onApply(
                sanitizeColumnIds(
                  draftColumns,
                  availableColumns.map((column) => column.id)
                )
              )
              onOpenChange(false)
            }}
          >
            Apply columns
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean
  direction: SortDirection
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

function SortableTableHead(props: {
  label: string
  sortKey: string
  activeSortKey: string
  direction: SortDirection
  onSort: (sortKey: string) => void
  align?: "left" | "right"
  className?: string
  title?: string
  trailing?: ReactNode
}) {
  const {
    label,
    sortKey,
    activeSortKey,
    direction,
    onSort,
    align = "right",
    className,
    title,
    trailing,
  } = props

  return (
    <TableHead
      key={sortKey}
      className={cn(align === "right" ? "text-right" : undefined, className)}
      title={title}
    >
      <div
        className={cn(
          "flex w-full items-center gap-2",
          align === "right" ? "justify-end" : "justify-between"
        )}
      >
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
            align === "right" ? "justify-end" : "justify-start",
            trailing ? "min-w-0" : "w-full"
          )}
        >
          <span>{label}</span>
          <SortIndicator
            active={activeSortKey === sortKey}
            direction={direction}
          />
        </button>
        {trailing}
      </div>
    </TableHead>
  )
}

function renderColumnHeader(args: {
  availableColumns: ColumnDefinition[]
  columnId: string
  activeSortKey: string
  direction: SortDirection
  conditionalFormatting: ConditionalFormattingState
  currency: string
  onSort: (sortKey: string) => void
  onToggleConditionalFormatting: (
    columnId: keyof ConditionalFormattingState
  ) => void
  profitProxyModel: PaidMediaProfitProxyModel
  targetFormatting: PaidMediaTargetFormattingConfig
}) {
  const {
    availableColumns,
    activeSortKey,
    columnId,
    conditionalFormatting,
    currency,
    direction,
    onSort,
    onToggleConditionalFormatting,
    profitProxyModel,
    targetFormatting,
  } = args

  const label = getSortLabel(availableColumns, columnId, "Campaign")

  if (columnId === "roas") {
    return (
      <SortableTableHead
        key={columnId}
        label={label}
        sortKey={columnId}
        activeSortKey={activeSortKey}
        direction={direction}
        onSort={onSort}
        title={
          targetFormatting.roasTarget !== null
            ? `Target ${targetFormatting.roasTarget.toFixed(2)}x`
            : "No ROAS target is configured for paid-media formatting."
        }
        trailing={
          targetFormatting.roasTarget !== null ? (
            <Button
              type="button"
              variant={conditionalFormatting.roas ? "secondary" : "outline"}
              size="sm"
              className="h-6 rounded-md px-2 text-xs"
              onClick={() => onToggleConditionalFormatting("roas")}
              title={`Turn ROAS conditional formatting ${
                conditionalFormatting.roas ? "off" : "on"
              }`}
            >
              tgt {targetFormatting.roasTarget.toFixed(2)}x
            </Button>
          ) : null
        }
      />
    )
  }

  if (columnId === "cpa") {
    return (
      <SortableTableHead
        key={columnId}
        label={label}
        sortKey={columnId}
        activeSortKey={activeSortKey}
        direction={direction}
        onSort={onSort}
        title={
          targetFormatting.cpaTarget !== null
            ? `Target ${formatPaidMediaMetricValue(
                "currency",
                targetFormatting.cpaTarget,
                currency
              )}`
            : "No CPA target is configured for paid-media formatting."
        }
        trailing={
          targetFormatting.cpaTarget !== null ? (
            <Button
              type="button"
              variant={conditionalFormatting.cpa ? "secondary" : "outline"}
              size="sm"
              className="h-6 rounded-md px-2 text-xs"
              onClick={() => onToggleConditionalFormatting("cpa")}
              title={`Turn CPA conditional formatting ${
                conditionalFormatting.cpa ? "off" : "on"
              }`}
            >
              tgt{" "}
              {formatPaidMediaMetricValue(
                "currency",
                targetFormatting.cpaTarget,
                currency
              )}
            </Button>
          ) : null
        }
      />
    )
  }

  if (columnId === "estimated_profit_proxy") {
    return (
      <SortableTableHead
        key={columnId}
        label={label}
        sortKey={columnId}
        activeSortKey={activeSortKey}
        direction={direction}
        onSort={onSort}
        title={
          profitProxyModel.notes.length > 0
            ? profitProxyModel.notes.join(" ")
            : "Dashboard-calculated proxy."
        }
        trailing={<Badge variant="outline">Proxy</Badge>}
      />
    )
  }

  return (
    <SortableTableHead
      key={columnId}
      label={label}
      sortKey={columnId}
      activeSortKey={activeSortKey}
      direction={direction}
      onSort={onSort}
    />
  )
}

function renderMetricCell(args: {
  columnId: string
  conditionalFormatting: ConditionalFormattingState
  currency: string
  row: MetricRow
  targetFormatting: PaidMediaTargetFormattingConfig
}) {
  const { columnId, conditionalFormatting, currency, row, targetFormatting } =
    args
  const roasState = evaluateTargetState(
    row.roas,
    targetFormatting.roasTarget,
    "higher_is_better",
    targetFormatting
  )
  const cpaState = evaluateTargetState(
    row.cpa > 0 ? row.cpa : null,
    targetFormatting.cpaTarget,
    "lower_is_better",
    targetFormatting
  )

  if (columnId === "spend") {
    return (
      <TableCell key={columnId} className="text-right tabular-nums">
        {formatPaidMediaMetricValue("currency", row.spend, currency)}
      </TableCell>
    )
  }

  if (columnId === "budget") {
    return (
      <TableCell key={columnId} className="text-right tabular-nums">
        {row.budget > 0
          ? formatPaidMediaMetricValue("currency", row.budget, currency)
          : "-"}
      </TableCell>
    )
  }

  if (columnId === "roas") {
    return (
      <TableCell
        key={columnId}
        className={
          conditionalFormatting.roas
            ? targetCellClass(roasState, targetFormatting)
            : "text-right tabular-nums"
        }
      >
        {formatPaidMediaRatio(row.roas)}
      </TableCell>
    )
  }

  if (columnId === "cpa") {
    return (
      <TableCell
        key={columnId}
        className={
          conditionalFormatting.cpa
            ? targetCellClass(cpaState, targetFormatting)
            : "text-right tabular-nums"
        }
      >
        {row.cpa > 0
          ? formatPaidMediaMetricValue("currency", row.cpa, currency)
          : "-"}
      </TableCell>
    )
  }

  if (columnId === "cpm") {
    return (
      <TableCell key={columnId} className="text-right tabular-nums">
        {row.cpm > 0
          ? formatPaidMediaMetricValue("currency", row.cpm, currency)
          : "-"}
      </TableCell>
    )
  }

  if (columnId === "ctr") {
    return (
      <TableCell key={columnId} className="text-right tabular-nums">
        {formatPaidMediaPercent(row.ctr)}
      </TableCell>
    )
  }

  if (columnId === "impressions") {
    return (
      <TableCell key={columnId} className="text-right tabular-nums">
        {formatPaidMediaNumber(row.impressions)}
      </TableCell>
    )
  }

  if (columnId === "clicks") {
    return (
      <TableCell key={columnId} className="text-right tabular-nums">
        {formatPaidMediaNumber(row.clicks)}
      </TableCell>
    )
  }

  if (columnId === "purchases") {
    return (
      <TableCell key={columnId} className="text-right tabular-nums">
        {formatPaidMediaNumber(row.purchases)}
      </TableCell>
    )
  }

  if (columnId === "revenue") {
    return (
      <TableCell key={columnId} className="text-right tabular-nums">
        {formatPaidMediaMetricValue(
          "currency",
          row.attributedRevenue,
          currency
        )}
      </TableCell>
    )
  }

  if (columnId === "estimated_profit_proxy") {
    return (
      <TableCell key={columnId} className="text-right tabular-nums">
        <div className="inline-flex w-full items-center justify-end gap-1.5">
          <span className="font-semibold">
            {row.estimatedProfitProxy.value === null
              ? "-"
              : formatPaidMediaMetricValue(
                  "currency",
                  row.estimatedProfitProxy.value,
                  currency
                )}
          </span>
          <Badge
            variant="outline"
            className={confidenceBadgeClass(
              row.estimatedProfitProxy.confidence
            )}
          >
            {confidenceShort(row.estimatedProfitProxy.confidence)}
          </Badge>
        </div>
      </TableCell>
    )
  }

  return (
    <TableCell key={columnId} className="text-right tabular-nums">
      {formatPaidMediaNumber(getColumnValue(row, columnId))}
    </TableCell>
  )
}

function platformLabel(platform: PaidMediaPlatformId | undefined) {
  if (platform === "meta") {
    return "Meta"
  }

  if (platform === "google") {
    return "Google"
  }

  if (platform === "tiktok") {
    return "TikTok"
  }

  return "Paid media"
}

function CampaignPerformanceTableWithRouteState(
  props: CampaignPerformanceTableProps
) {
  const searchParams = useSearchParams()

  return (
    <CampaignPerformanceTableContent
      {...props}
      searchParams={searchParams}
    />
  )
}

export function CampaignPerformanceTable(
  props: CampaignPerformanceTableProps
) {
  return (
    <Suspense
      fallback={
        <CampaignPerformanceTableContent
          {...props}
          searchParams={EMPTY_SEARCH_PARAMS}
        />
      }
    >
      <CampaignPerformanceTableWithRouteState {...props} />
    </Suspense>
  )
}

function CampaignPerformanceTableContent({
  currency,
  rows,
  targetFormatting,
  profitProxyModel,
  mode = "all_channels",
  platform,
  hierarchy = [],
  managerContext,
  storageKey = DEFAULT_ALL_CHANNELS_STORAGE_KEY,
  eyebrow = "Campaign performance",
  title = "Reporting-first campaign table",
  description = "Structured fields cover the primary metrics, while extra and future metrics stay discoverable through the route-owned column customizer.",
  searchParams,
}: CampaignPerformanceTableProps & {
  searchParams: SearchParamsReader
}) {
  const availableColumns = useMemo(
    () => buildColumnDefinitions(rows, hierarchy),
    [rows, hierarchy]
  )
  const availableColumnIds = availableColumns.map((column) => column.id)
  const availableColumnSignature = availableColumnIds.join("|")
  const roasFormattingStorageKey = conditionalFormattingStorageKey(
    storageKey,
    "roas"
  )
  const cpaFormattingStorageKey = conditionalFormattingStorageKey(
    storageKey,
    "cpa"
  )
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    sanitizeColumnIds([...DEFAULT_VISIBLE_COLUMN_IDS], availableColumnIds)
  )
  const [conditionalFormatting, setConditionalFormatting] =
    useState<ConditionalFormattingState>({
      cpa: true,
      roas: true,
    })
  const [hasHydratedColumns, setHasHydratedColumns] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const [platformFilter, setPlatformFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortId, setSortId] = useState(
    createSortId(DEFAULT_SORT.key, DEFAULT_SORT.direction)
  )
  const [customizerOpen, setCustomizerOpen] = useState(false)
  const [expandedCampaigns, setExpandedCampaigns] = useState<
    Record<string, boolean>
  >({})
  const [expandedAdsets, setExpandedAdsets] = useState<Record<string, boolean>>(
    {}
  )
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({})
  const deferredSearchValue = useDeferredValue(searchValue)
  const focusedCampaignId = searchParams.get("campaignId") || ""
  const focusedAdsetId = searchParams.get("adsetId") || ""
  const focusedAdId = searchParams.get("adId") || ""
  const lastFocusSignature = useRef("")

  useEffect(() => {
    const storedColumns = readStoredColumns(storageKey)
    const storedConditionalFormatting = {
      cpa: readStoredBoolean(cpaFormattingStorageKey, true),
      roas: readStoredBoolean(roasFormattingStorageKey, true),
    }
    const nextAvailableColumnIds = availableColumnSignature
      ? availableColumnSignature.split("|")
      : []
    const frame = window.requestAnimationFrame(() => {
      setVisibleColumns(
        sanitizeColumnIds(storedColumns, nextAvailableColumnIds)
      )
      setConditionalFormatting(storedConditionalFormatting)
      setHasHydratedColumns(true)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [
    availableColumnSignature,
    cpaFormattingStorageKey,
    roasFormattingStorageKey,
    storageKey,
  ])

  useEffect(() => {
    if (!hasHydratedColumns) {
      return
    }

    persistColumns(storageKey, visibleColumns)
  }, [hasHydratedColumns, storageKey, visibleColumns])

  useEffect(() => {
    if (!hasHydratedColumns) {
      return
    }

    persistBoolean(roasFormattingStorageKey, conditionalFormatting.roas)
    persistBoolean(cpaFormattingStorageKey, conditionalFormatting.cpa)
  }, [
    conditionalFormatting,
    cpaFormattingStorageKey,
    hasHydratedColumns,
    roasFormattingStorageKey,
  ])

  const nameSortLabel =
    mode === "platform" && hierarchy.length > 0
      ? "Campaign / Ad Set / Ad"
      : "Campaign"
  const sortOptions = useMemo(
    () =>
      buildSortOptions({
        availableColumns,
        includeStatus: mode === "platform" && hierarchy.length > 0,
        nameLabel: nameSortLabel,
      }),
    [availableColumns, hierarchy.length, mode, nameSortLabel]
  )
  const effectiveSortId = sortOptions.some((option) => option.id === sortId)
    ? sortId
    : (sortOptions.find(
        (option) =>
          option.key === DEFAULT_SORT.key &&
          option.direction === DEFAULT_SORT.direction
      )?.id ??
      sortOptions[0]?.id ??
      createSortId(DEFAULT_SORT.key, DEFAULT_SORT.direction))
  const selectedSort =
    sortOptions.find((option) => option.id === effectiveSortId) ?? {
      id: createSortId(DEFAULT_SORT.key, DEFAULT_SORT.direction),
      key: DEFAULT_SORT.key,
      direction: DEFAULT_SORT.direction,
      label: "Spend (high-low)",
    }
  const activeSortKey = selectedSort.key
  const activeSortDirection = selectedSort.direction
  const trendMetricDefinitions = useMemo(
    () => buildTrendMetricDefinitions(availableColumns),
    [availableColumns]
  )
  const platformEntityIndex = useMemo(
    () => buildPlatformEntityIndex(hierarchy),
    [hierarchy]
  )
  const selectionEntityIndex = useMemo(
    () =>
      hierarchy.length > 0
        ? buildSelectionEntityIndex(hierarchy)
        : buildCampaignSelectionEntityIndex(rows),
    [hierarchy, rows]
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedKeys((currentKeys) => {
      const nextKeys = Object.fromEntries(
        Object.keys(currentKeys)
          .filter((key) => currentKeys[key] && selectionEntityIndex.has(key))
          .map((key) => [key, true] as const)
      )

      if (
        Object.keys(nextKeys).length === Object.keys(currentKeys).length &&
        Object.keys(nextKeys).every((key) => currentKeys[key])
      ) {
        return currentKeys
      }

      return nextKeys
    })
  }, [selectionEntityIndex])

  useEffect(() => {
    if (mode !== "platform" || hierarchy.length === 0) {
      return
    }

    const focusSignature = [
      focusedCampaignId,
      focusedAdsetId,
      focusedAdId,
    ].join("|")

    if (!focusSignature.replace(/\|/g, "")) {
      lastFocusSignature.current = ""
      return
    }

    if (focusSignature === lastFocusSignature.current) {
      return
    }

    const nextCampaigns: Record<string, boolean> = {}
    const nextAdsets: Record<string, boolean> = {}

    if (
      focusedCampaignId &&
      platformEntityIndex.campaignById.has(focusedCampaignId)
    ) {
      nextCampaigns[focusedCampaignId] = true
    }

    const focusedAdsetEntry =
      (focusedCampaignId && focusedAdsetId
        ? platformEntityIndex.adsetById.get(
            `${focusedCampaignId}::${focusedAdsetId}`
          )
        : undefined) ?? platformEntityIndex.adsetByRawId.get(focusedAdsetId)

    if (focusedAdsetEntry) {
      nextCampaigns[focusedAdsetEntry.campaign.id] = true
      nextAdsets[
        `${focusedAdsetEntry.campaign.id}::${focusedAdsetEntry.adset.id}`
      ] = true
    }

    const focusedAdEntry =
      (focusedCampaignId && focusedAdsetId && focusedAdId
        ? platformEntityIndex.adById.get(
            `${focusedCampaignId}::${focusedAdsetId}::${focusedAdId}`
          )
        : undefined) ?? platformEntityIndex.adByRawId.get(focusedAdId)

    if (focusedAdEntry) {
      nextCampaigns[focusedAdEntry.campaign.id] = true
      nextAdsets[`${focusedAdEntry.campaign.id}::${focusedAdEntry.adset.id}`] =
        true
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedCampaigns((currentCampaigns) => ({
      ...currentCampaigns,
      ...nextCampaigns,
    }))
    setExpandedAdsets((currentAdsets) => ({
      ...currentAdsets,
      ...nextAdsets,
    }))
    lastFocusSignature.current = focusSignature
  }, [
    focusedAdId,
    focusedAdsetId,
    focusedCampaignId,
    hierarchy.length,
    mode,
    platformEntityIndex,
  ])

  useEffect(() => {
    if (mode !== "platform" || !focusedAdId) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const target = document.getElementById(`paid-media-ad-row-${focusedAdId}`)

      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }, 140)

    return () => window.clearTimeout(timeoutId)
  }, [expandedAdsets, expandedCampaigns, focusedAdId, mode])

  const effectiveSelectedEntities = useMemo(() => {
    return Object.keys(selectedKeys)
      .filter((key) => selectedKeys[key])
      .map((key) => selectionEntityIndex.get(key))
      .filter((entity): entity is FlatSelectionEntity => Boolean(entity))
      .filter((entity) => {
        if (
          entity.parentCampaignKey &&
          selectedKeys[entity.parentCampaignKey]
        ) {
          return false
        }

        if (entity.parentAdsetKey && selectedKeys[entity.parentAdsetKey]) {
          return false
        }

        return true
      })
  }, [selectedKeys, selectionEntityIndex])
  const selectedTrendDailyPoints = useMemo(
    () => aggregateSelectedDailyPoints(effectiveSelectedEntities),
    [effectiveSelectedEntities]
  )
  const selectedEntityLabel = useMemo(() => {
    if (effectiveSelectedEntities.length === 0) {
      return "No selection"
    }

    if (effectiveSelectedEntities.length === 1) {
      return effectiveSelectedEntities[0]?.label ?? "1 selection"
    }

    return `${effectiveSelectedEntities.length} selections`
  }, [effectiveSelectedEntities])
  const handleSortSelectionChange = (value: string) => {
    if (sortOptions.some((option) => option.id === value)) {
      setSortId(value)
      return
    }

    setSortId(createSortId(DEFAULT_SORT.key, DEFAULT_SORT.direction))
  }
  const handleColumnSort = (nextSortKey: string) => {
    const nextSort = getNextTriStateSort({
      currentSort: {
        key: activeSortKey,
        direction: activeSortDirection,
      },
      nextKey: nextSortKey,
      defaultSort: DEFAULT_SORT,
      getInitialDirection: getInitialSortDirection,
    })

    setSortId(createSortId(nextSort.key, nextSort.direction))
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No campaign rows"
        description="The selected range did not return any paid-media campaign rows, so the campaign table cannot render yet."
      />
    )
  }

  if (mode !== "platform") {
    const platformOptions = Array.from(
      new Set(rows.map((row) => row.platform).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right))
    const filteredRows = rows.filter((row) => {
      if (platformFilter !== "all" && row.platform !== platformFilter) {
        return false
      }

      const query = deferredSearchValue.trim().toLowerCase()

      if (!query) {
        return true
      }

      return `${row.campaignName} ${row.platform}`.toLowerCase().includes(query)
    })
    const sortedRows = selectedSort
      ? sortMetricRows(filteredRows, selectedSort)
      : filteredRows

    return (
      <Card>
        <CardHeader className="gap-1">
          <CardDescription>{eyebrow}</CardDescription>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search campaign"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Select
                  value={platformFilter}
                  onValueChange={setPlatformFilter}
                >
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All platforms</SelectItem>
                    {platformOptions.map((platformValue) => (
                      <SelectItem key={platformValue} value={platformValue}>
                        {platformValue}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={effectiveSortId}
                  onValueChange={handleSortSelectionChange}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => setCustomizerOpen(true)}
                >
                  <Settings2Icon data-icon="inline-start" />
                  Columns
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{sortedRows.length} visible campaign rows</span>
              <span className="h-4 w-px bg-border" aria-hidden="true" />
              <span>{visibleColumns.length} visible columns</span>
              <span className="h-4 w-px bg-border" aria-hidden="true" />
              <span>
                Local preference key: <code>{storageKey}</code>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-background">
            <Table className="min-w-[1120px]">
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Campaign"
                    sortKey={NAME_SORT_KEY}
                    activeSortKey={activeSortKey}
                    direction={activeSortDirection}
                    onSort={handleColumnSort}
                    align="left"
                    className="w-[26%]"
                  />
                  {visibleColumns.map((columnId) =>
                    renderColumnHeader({
                      availableColumns,
                      activeSortKey,
                      columnId,
                      conditionalFormatting,
                      currency,
                      direction: activeSortDirection,
                      onSort: handleColumnSort,
                      onToggleConditionalFormatting:
                        toggleConditionalFormatting,
                      profitProxyModel,
                      targetFormatting,
                    })
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={visibleColumns.length + 1}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No campaign rows match the current search and platform
                      filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRows.map((row) => (
                    <TableRow
                      key={`${row.platform}:${row.campaignId}:${row.campaignName}`}
                    >
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">
                            {row.campaignName || row.campaignId}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {row.platform}
                          </span>
                        </div>
                      </TableCell>
                      {visibleColumns.map((columnId) =>
                        renderMetricCell({
                          columnId,
                          conditionalFormatting,
                          currency,
                          row,
                          targetFormatting,
                        })
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <ColumnCustomizerDialog
            key={`${customizerOpen}:${visibleColumns.join("|")}`}
            open={customizerOpen}
            onOpenChange={setCustomizerOpen}
            availableColumns={availableColumns}
            selectedColumns={visibleColumns}
            onApply={setVisibleColumns}
          />
        </CardContent>
      </Card>
    )
  }

  const resolveEntityLink = (
    level: PaidMediaEntityLevel,
    ids: {
      accountId?: string
      campaignId?: string
      adsetId?: string
      adId?: string
    }
  ): PaidMediaEntityLinkResult | null => {
    if (!platform) {
      return null
    }

    const result = buildPaidMediaEntityLink({
      platform,
      level,
      accountId: ids.accountId || managerContext?.defaultAccountId,
      businessId:
        platform === "meta" ? managerContext?.defaultBusinessId : undefined,
      campaignId: ids.campaignId,
      adsetId: ids.adsetId,
      adId: ids.adId,
    })

    return result.mode === "unavailable" ? null : result
  }

  const toggleSelection = (key: string) => {
    setSelectedKeys((currentKeys) => {
      const currentlySelected = Boolean(currentKeys[key])

      if (currentlySelected) {
        const nextKeys = { ...currentKeys }
        delete nextKeys[key]
        return nextKeys
      }

      const nextLevel = selectionLevelFromKey(key)

      if (nextLevel === "unknown") {
        return {
          ...currentKeys,
          [key]: true,
        }
      }

      const nextKeys: Record<string, boolean> = {}

      for (const existingKey of Object.keys(currentKeys)) {
        if (!currentKeys[existingKey]) {
          continue
        }

        const existingLevel = selectionLevelFromKey(existingKey)

        if (existingLevel === nextLevel) {
          nextKeys[existingKey] = true
        }
      }

      nextKeys[key] = true

      return nextKeys
    })
  }

  function toggleConditionalFormatting(
    columnId: keyof ConditionalFormattingState
  ) {
    setConditionalFormatting((currentFormatting) => ({
      ...currentFormatting,
      [columnId]: !currentFormatting[columnId],
    }))
  }

  const toggleCampaign = (campaignId: string) => {
    setExpandedCampaigns((currentCampaigns) => {
      const isOpen = Boolean(currentCampaigns[campaignId])

      if (isOpen) {
        setExpandedAdsets((currentAdsets) =>
          Object.fromEntries(
            Object.entries(currentAdsets).filter(
              ([key, value]) => value && !key.startsWith(`${campaignId}::`)
            )
          )
        )
      }

      return {
        ...currentCampaigns,
        [campaignId]: !isOpen,
      }
    })
  }

  const toggleAdset = (campaignId: string, adsetId: string) => {
    const key = `${campaignId}::${adsetId}`

    setExpandedAdsets((currentAdsets) => ({
      ...currentAdsets,
      [key]: !currentAdsets[key],
    }))
  }

  const hasSelection = effectiveSelectedEntities.length > 0

  if (hierarchy.length === 0) {
    const filteredRows = rows.filter((row) => {
      const query = deferredSearchValue.trim().toLowerCase()

      if (!query) {
        return true
      }

      return `${row.campaignName} ${row.campaignId}`
        .toLowerCase()
        .includes(query)
    })
    const sortedRows = selectedSort
      ? sortMetricRows(filteredRows, selectedSort)
      : filteredRows

    const totals = buildMetricTotals(sortedRows, profitProxyModel)

    return (
      <>
        {hasSelection ? (
          <SelectionTrendChartCard
            currency={currency}
            metricDefinitions={trendMetricDefinitions}
            selectedLabel={selectedEntityLabel}
            dailyPoints={selectedTrendDailyPoints}
            profitProxyModel={profitProxyModel}
          />
        ) : null}

        <Card>
          <CardHeader className="gap-1">
            <CardDescription>{eyebrow}</CardDescription>
            <CardTitle>{title}</CardTitle>
            <p className="text-sm text-muted-foreground">{description}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-0">
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
              <div className="rounded-xl border bg-background px-4 py-3 text-sm text-muted-foreground">
                Lower-level fact rows were unavailable for this selection, so
                the platform surface stays at campaign level while keeping the
                same selection, column, and totals behavior.
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search campaign"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Select
                    value={effectiveSortId}
                    onValueChange={handleSortSelectionChange}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={() => setCustomizerOpen(true)}
                  >
                    <Settings2Icon data-icon="inline-start" />
                    Columns
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{sortedRows.length} visible campaign rows</span>
                <span className="h-4 w-px bg-border" aria-hidden="true" />
                <span>{visibleColumns.length} visible columns</span>
                <span className="h-4 w-px bg-border" aria-hidden="true" />
                <span>Selection drives the inline trend chart</span>
                <span className="h-4 w-px bg-border" aria-hidden="true" />
                <span>
                  Local preference key: <code>{storageKey}</code>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-background">
              <Table className="min-w-[1240px]">
                  <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">
                      <ChartNoAxesColumnIcon
                        aria-hidden="true"
                        className="mx-auto size-4 text-muted-foreground"
                      />
                    </TableHead>
                    <SortableTableHead
                      label="Status"
                      sortKey={STATUS_SORT_KEY}
                      activeSortKey={activeSortKey}
                      direction={activeSortDirection}
                      onSort={handleColumnSort}
                      align="left"
                      className="w-[12rem]"
                    />
                    <SortableTableHead
                      label="Campaign"
                      sortKey={NAME_SORT_KEY}
                      activeSortKey={activeSortKey}
                      direction={activeSortDirection}
                      onSort={handleColumnSort}
                      align="left"
                      className="w-[28%]"
                    />
                    {visibleColumns.map((columnId) =>
                      renderColumnHeader({
                        availableColumns,
                        activeSortKey,
                        columnId,
                        conditionalFormatting,
                        currency,
                        direction: activeSortDirection,
                        onSort: handleColumnSort,
                        onToggleConditionalFormatting:
                          toggleConditionalFormatting,
                        profitProxyModel,
                        targetFormatting,
                      })
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={visibleColumns.length + 3}
                        className="py-10 text-center text-muted-foreground"
                      >
                        No campaign rows match the current search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {sortedRows.map((row) => {
                        const rowKey = campaignSelectionKey(row.campaignId)
                        const rowLink = resolveEntityLink("campaign", {
                          accountId: row.accountId,
                          campaignId: row.campaignId,
                        })

                        return (
                          <TableRow key={`${row.platform}:${row.campaignId}`}>
                            <TableCell>
                              <Checkbox
                                checked={Boolean(selectedKeys[rowKey])}
                                onCheckedChange={() => toggleSelection(rowKey)}
                                aria-label={`Select ${row.campaignName || row.campaignId}`}
                              />
                            </TableCell>
                            <TableCell>
                              <StatusIndicator status="unknown" />
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              <div className="flex flex-col gap-1">
                                {rowLink ? (
                                  <EntityLink
                                    href={rowLink.url}
                                    label={row.campaignName || row.campaignId}
                                  />
                                ) : (
                                  <span className="font-medium">
                                    {row.campaignName || row.campaignId}
                                  </span>
                                )}
                                <span className="text-sm text-muted-foreground">
                                  {platformLabel(platform)}
                                </span>
                              </div>
                            </TableCell>
                            {visibleColumns.map((columnId) =>
                              renderMetricCell({
                                columnId,
                                conditionalFormatting,
                                currency,
                                row,
                                targetFormatting,
                              })
                            )}
                          </TableRow>
                        )
                      })}
                      <TableRow className="border-t bg-muted/25 font-semibold">
                        <TableCell colSpan={3}>
                          Total ({sortedRows.length} Campaigns)
                        </TableCell>
                        {visibleColumns.map((columnId) =>
                          renderMetricCell({
                            columnId,
                            conditionalFormatting,
                            currency,
                            row: totals,
                            targetFormatting,
                          })
                        )}
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>

            <ColumnCustomizerDialog
              key={`${storageKey}:${customizerOpen}:${visibleColumns.join("|")}`}
              open={customizerOpen}
              onOpenChange={setCustomizerOpen}
              availableColumns={availableColumns}
              selectedColumns={visibleColumns}
              onApply={setVisibleColumns}
            />
          </CardContent>
        </Card>
      </>
    )
  }

  const statusOptions = collectHierarchyStatuses(hierarchy)
  const filteredHierarchy = filterPlatformHierarchy({
    campaigns: hierarchy,
    query: deferredSearchValue,
    statusFilter,
    sortDefinition: selectedSort,
  })
  const visibleCampaignTotals = buildMetricTotals(
    filteredHierarchy,
    profitProxyModel
  )
  const visibleRowCount = filteredHierarchy.reduce((count, campaign) => {
    const campaignExpanded = Boolean(expandedCampaigns[campaign.id])
    let nextCount = count + 1

    if (!campaignExpanded) {
      return nextCount
    }

    nextCount += campaign.adsets.length

    for (const adset of campaign.adsets) {
      if (expandedAdsets[`${campaign.id}::${adset.id}`]) {
        nextCount += adset.ads.length
      }
    }

    return nextCount
  }, 0)
  const selectedRowCount = Object.keys(selectedKeys).filter(
    (key) => selectedKeys[key]
  ).length
  const tableColumnSpan = visibleColumns.length + 3
  const legacyBranchVisible = searchParams.get("__legacyHierarchy") === "1"
  const currentLevelLabel = "Campaign"
  const selectedCampaign =
    undefined as unknown as PaidMediaPlatformCampaignNode | null
  const selectedAdsetEntry = undefined as unknown as {
    campaign: PaidMediaPlatformCampaignNode
    adset: PaidMediaPlatformAdsetNode
  } | null
  const selectedAdId = searchParams.get("__legacyAdId") ?? ""
  const sortedRows: Array<
    | PaidMediaPlatformCampaignNode
    | PaidMediaPlatformAdsetNode
    | PaidMediaPlatformAdNode
  > = []
  const updateRouteState = (params: Record<string, string | undefined>) => {
    void params
  }

  return (
    <>
      {hasSelection ? (
        <SelectionTrendChartCard
          currency={currency}
          metricDefinitions={trendMetricDefinitions}
          selectedLabel={selectedEntityLabel}
          dailyPoints={selectedTrendDailyPoints}
          profitProxyModel={profitProxyModel}
        />
      ) : null}

      <Card>
        <CardHeader className="gap-1">
          <CardDescription>{eyebrow}</CardDescription>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
            <div className="rounded-xl border bg-background px-4 py-3 text-sm text-muted-foreground">
              Expand campaigns and ad sets inline inside the shared table
              surface. Name clicks open {platformLabel(platform)} Ads Manager in
              a new tab, while checked rows drive the selection trend above the
              table.
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search campaigns, ad sets, or ads"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {formatStatusLabel(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={effectiveSortId}
                  onValueChange={handleSortSelectionChange}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => setCustomizerOpen(true)}
                >
                  <Settings2Icon data-icon="inline-start" />
                  Columns
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{visibleRowCount} visible inline rows</span>
              <span className="h-4 w-px bg-border" aria-hidden="true" />
              <span>{filteredHierarchy.length} visible campaigns</span>
              <span className="h-4 w-px bg-border" aria-hidden="true" />
              <span>{visibleColumns.length} visible columns</span>
              <span className="h-4 w-px bg-border" aria-hidden="true" />
              <span>{selectedRowCount} selected rows</span>
              <span className="h-4 w-px bg-border" aria-hidden="true" />
              <span>
                Local preference key: <code>{storageKey}</code>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-background">
            <Table className="min-w-[1280px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <ChartNoAxesColumnIcon
                      aria-hidden="true"
                      className="mx-auto size-4 text-muted-foreground"
                    />
                  </TableHead>
                  <SortableTableHead
                    label="Status"
                    sortKey={STATUS_SORT_KEY}
                    activeSortKey={activeSortKey}
                    direction={activeSortDirection}
                    onSort={handleColumnSort}
                    align="left"
                    className="w-[12rem]"
                  />
                  <SortableTableHead
                    label="Campaign / Ad Set / Ad"
                    sortKey={NAME_SORT_KEY}
                    activeSortKey={activeSortKey}
                    direction={activeSortDirection}
                    onSort={handleColumnSort}
                    align="left"
                    className="w-[28%]"
                  />
                  {visibleColumns.map((columnId) =>
                    renderColumnHeader({
                      availableColumns,
                      activeSortKey,
                      columnId,
                      conditionalFormatting,
                      currency,
                      direction: activeSortDirection,
                      onSort: handleColumnSort,
                      onToggleConditionalFormatting:
                        toggleConditionalFormatting,
                      profitProxyModel,
                      targetFormatting,
                    })
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHierarchy.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={tableColumnSpan}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No campaigns, ad sets, or ads match the current search and
                      status filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filteredHierarchy.map((campaign) => {
                      const campaignKey = campaignSelectionKey(campaign.id)
                      const campaignExpanded = Boolean(
                        expandedCampaigns[campaign.id]
                      )
                      const campaignLink = resolveEntityLink("campaign", {
                        accountId: campaign.accountId,
                        campaignId: campaign.id,
                      })
                      const focusedCampaign =
                        focusedCampaignId === campaign.id &&
                        !focusedAdsetId &&
                        !focusedAdId

                      return (
                        <Fragment key={`campaign:${campaign.id}`}>
                          <TableRow
                            data-state={
                              focusedCampaign ? "selected" : undefined
                            }
                          >
                            <TableCell>
                              <Checkbox
                                checked={Boolean(selectedKeys[campaignKey])}
                                onCheckedChange={() =>
                                  toggleSelection(campaignKey)
                                }
                                aria-label={`Select ${campaign.name || campaign.id}`}
                              />
                            </TableCell>
                            <TableCell>
                              <StatusIndicator status={campaign.status} />
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              <div className="flex items-start gap-2">
                                <button
                                  type="button"
                                  className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted/60 hover:text-foreground disabled:cursor-default disabled:opacity-40"
                                  onClick={() => toggleCampaign(campaign.id)}
                                  disabled={campaign.adsets.length === 0}
                                  aria-label={
                                    campaignExpanded
                                      ? `Collapse ${campaign.name || campaign.id}`
                                      : `Expand ${campaign.name || campaign.id}`
                                  }
                                >
                                  <ChevronRightIcon
                                    className={`size-4 transition-transform ${
                                      campaignExpanded ? "rotate-90" : ""
                                    }`}
                                  />
                                </button>
                                <div className="min-w-0 flex-1">
                                  {campaignLink ? (
                                    <EntityLink
                                      href={campaignLink.url}
                                      label={campaign.name || campaign.id}
                                    />
                                  ) : (
                                    <span className="font-medium">
                                      {campaign.name || campaign.id}
                                    </span>
                                  )}
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {formatPaidMediaNumber(campaign.adsetCount)}{" "}
                                    ad sets
                                    {" - "}
                                    {formatPaidMediaNumber(
                                      campaign.adCount
                                    )}{" "}
                                    ads
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            {visibleColumns.map((columnId) =>
                              renderMetricCell({
                                columnId,
                                conditionalFormatting,
                                currency,
                                row: campaign,
                                targetFormatting,
                              })
                            )}
                          </TableRow>

                          {campaignExpanded
                            ? campaign.adsets.map((adset) => {
                                const adsetKey = adsetSelectionKey(
                                  campaign.id,
                                  adset.id
                                )
                                const adsetExpanded = Boolean(
                                  expandedAdsets[`${campaign.id}::${adset.id}`]
                                )
                                const adsetLink = resolveEntityLink("adset", {
                                  accountId: adset.accountId,
                                  campaignId: campaign.id,
                                  adsetId: adset.id,
                                })
                                const focusedAdset =
                                  focusedAdsetId === adset.id && !focusedAdId

                                return (
                                  <Fragment
                                    key={`adset:${campaign.id}:${adset.id}`}
                                  >
                                    <TableRow
                                      className="bg-muted/10"
                                      data-state={
                                        focusedAdset ? "selected" : undefined
                                      }
                                    >
                                      <TableCell>
                                        <Checkbox
                                          checked={Boolean(
                                            selectedKeys[adsetKey]
                                          )}
                                          onCheckedChange={() =>
                                            toggleSelection(adsetKey)
                                          }
                                          aria-label={`Select ${adset.name || adset.id}`}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <StatusIndicator
                                          status={adset.status}
                                        />
                                      </TableCell>
                                      <TableCell className="whitespace-normal">
                                        <div className="flex items-start gap-2 pl-8">
                                          <button
                                            type="button"
                                            className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted/60 hover:text-foreground disabled:cursor-default disabled:opacity-40"
                                            onClick={() =>
                                              toggleAdset(campaign.id, adset.id)
                                            }
                                            disabled={adset.ads.length === 0}
                                            aria-label={
                                              adsetExpanded
                                                ? `Collapse ${adset.name || adset.id}`
                                                : `Expand ${adset.name || adset.id}`
                                            }
                                          >
                                            <ChevronRightIcon
                                              className={`size-4 transition-transform ${
                                                adsetExpanded ? "rotate-90" : ""
                                              }`}
                                            />
                                          </button>
                                          <div className="min-w-0 flex-1">
                                            {adsetLink ? (
                                              <EntityLink
                                                href={adsetLink.url}
                                                label={adset.name || adset.id}
                                              />
                                            ) : (
                                              <span className="font-medium">
                                                {adset.name || adset.id}
                                              </span>
                                            )}
                                            <p className="mt-1 text-sm text-muted-foreground">
                                              {formatPaidMediaNumber(
                                                adset.adCount
                                              )}{" "}
                                              ads
                                            </p>
                                          </div>
                                        </div>
                                      </TableCell>
                                      {visibleColumns.map((columnId) =>
                                        renderMetricCell({
                                          columnId,
                                          conditionalFormatting,
                                          currency,
                                          row: adset,
                                          targetFormatting,
                                        })
                                      )}
                                    </TableRow>

                                    {adsetExpanded
                                      ? adset.ads.map((ad) => {
                                          const adKey = adSelectionKey(
                                            campaign.id,
                                            adset.id,
                                            ad.id
                                          )
                                          const adLink = resolveEntityLink(
                                            "ad",
                                            {
                                              accountId: ad.accountId,
                                              campaignId: campaign.id,
                                              adsetId: adset.id,
                                              adId: ad.id,
                                            }
                                          )
                                          const previewUrl =
                                            ad.thumbnailUrl || ad.imageUrl || ""

                                          return (
                                            <TableRow
                                              key={`ad:${campaign.id}:${adset.id}:${ad.id}`}
                                              id={`paid-media-ad-row-${ad.id}`}
                                              className="bg-muted/5"
                                              data-state={
                                                focusedAdId === ad.id
                                                  ? "selected"
                                                  : undefined
                                              }
                                            >
                                              <TableCell>
                                                <Checkbox
                                                  checked={Boolean(
                                                    selectedKeys[adKey]
                                                  )}
                                                  onCheckedChange={() =>
                                                    toggleSelection(adKey)
                                                  }
                                                  aria-label={`Select ${ad.name || ad.id}`}
                                                />
                                              </TableCell>
                                              <TableCell>
                                                <StatusIndicator
                                                  status={ad.status}
                                                />
                                              </TableCell>
                                              <TableCell className="whitespace-normal">
                                                <div className="flex items-start gap-3 pl-16">
                                                  {previewUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                      src={previewUrl}
                                                      alt=""
                                                      aria-hidden="true"
                                                      className="size-10 shrink-0 rounded-md border object-cover"
                                                    />
                                                  ) : null}
                                                  <div className="min-w-0 flex-1">
                                                    {adLink ? (
                                                      <EntityLink
                                                        href={adLink.url}
                                                        label={ad.name || ad.id}
                                                      />
                                                    ) : (
                                                      <span className="font-medium">
                                                        {ad.name || ad.id}
                                                      </span>
                                                    )}
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                      Ad
                                                    </p>
                                                  </div>
                                                </div>
                                              </TableCell>
                                              {visibleColumns.map((columnId) =>
                                                renderMetricCell({
                                                  columnId,
                                                  conditionalFormatting,
                                                  currency,
                                                  row: ad,
                                                  targetFormatting,
                                                })
                                              )}
                                            </TableRow>
                                          )
                                        })
                                      : null}
                                  </Fragment>
                                )
                              })
                            : null}
                        </Fragment>
                      )
                    })}

                    <TableRow className="border-t bg-muted/25 font-semibold">
                      <TableCell colSpan={3}>
                        Total ({filteredHierarchy.length} Campaigns)
                      </TableCell>
                      {visibleColumns.map((columnId) =>
                        renderMetricCell({
                          columnId,
                          conditionalFormatting,
                          currency,
                          row: visibleCampaignTotals,
                          targetFormatting,
                        })
                      )}
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="hidden">
            {legacyBranchVisible ? (
              <EmptyState
                title="Lower-level drill-in unavailable"
                description={`${platformLabel(
                  platform
                )} fact-level rows were not available for this selection, so the route stays at campaign level for now.`}
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border bg-background">
                <Table className="min-w-[1120px]">
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        label={currentLevelLabel}
                        sortKey={NAME_SORT_KEY}
                        activeSortKey={activeSortKey}
                        direction={activeSortDirection}
                        onSort={handleColumnSort}
                        align="left"
                        className="w-[28%]"
                      />
                      {visibleColumns.map((columnId) =>
                        renderColumnHeader({
                          availableColumns,
                          activeSortKey,
                          columnId,
                          conditionalFormatting,
                          currency,
                          direction: activeSortDirection,
                          onSort: handleColumnSort,
                          onToggleConditionalFormatting:
                            toggleConditionalFormatting,
                          profitProxyModel,
                          targetFormatting,
                        })
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={visibleColumns.length + 1}
                          className="py-10 text-center text-muted-foreground"
                        >
                          No {currentLevelLabel.toLowerCase()} match the current
                          search and status filter.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedRows.map((row) => {
                        const canDrill =
                          "adsets" in row
                            ? row.adsets.length > 0
                            : "ads" in row
                              ? row.ads.length > 0
                              : false
                        const isClickable = canDrill || row.entityLevel === "ad"
                        const subtitle =
                          row.entityLevel === "campaign"
                            ? `${formatStatusLabel(row.status)} - ${formatPaidMediaNumber(
                                row.adsetCount
                              )} ad sets - ${formatPaidMediaNumber(row.adCount)} ads`
                            : row.entityLevel === "adset"
                              ? `${formatStatusLabel(row.status)} - ${formatPaidMediaNumber(
                                  row.adCount
                                )} ads`
                              : formatStatusLabel(row.status)
                        const isSelected =
                          row.entityLevel === "ad"
                            ? selectedAdId === row.id
                            : false

                        return (
                          <TableRow
                            key={`${row.entityLevel}:${row.id}`}
                            data-state={isSelected ? "selected" : undefined}
                          >
                            <TableCell className="whitespace-normal">
                              <div className="flex flex-col gap-1">
                                {isClickable ? (
                                  <button
                                    type="button"
                                    className="w-fit text-left font-medium underline-offset-4 hover:underline"
                                    onClick={() => {
                                      if (row.entityLevel === "campaign") {
                                        updateRouteState({ campaignId: row.id })
                                        return
                                      }

                                      if (
                                        row.entityLevel === "adset" &&
                                        selectedCampaign
                                      ) {
                                        updateRouteState({
                                          campaignId: selectedCampaign.id,
                                          adsetId: row.id,
                                        })
                                        return
                                      }

                                      if (
                                        row.entityLevel === "ad" &&
                                        selectedAdsetEntry
                                      ) {
                                        updateRouteState({
                                          campaignId:
                                            selectedAdsetEntry.campaign.id,
                                          adsetId: selectedAdsetEntry.adset.id,
                                          adId: row.id,
                                        })
                                      }
                                    }}
                                  >
                                    {row.name || row.id}
                                  </button>
                                ) : (
                                  <span className="font-medium">
                                    {row.name || row.id}
                                  </span>
                                )}
                                <span className="text-sm text-muted-foreground">
                                  {subtitle}
                                </span>
                              </div>
                            </TableCell>
                            {visibleColumns.map((columnId) =>
                              renderMetricCell({
                                columnId,
                                conditionalFormatting,
                                currency,
                                row,
                                targetFormatting,
                              })
                            )}
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <ColumnCustomizerDialog
            key={`${storageKey}:${customizerOpen}:${visibleColumns.join("|")}`}
            open={customizerOpen}
            onOpenChange={setCustomizerOpen}
            availableColumns={availableColumns}
            selectedColumns={visibleColumns}
            onApply={setVisibleColumns}
          />
        </CardContent>
      </Card>
    </>
  )
}
