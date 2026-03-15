"use client"

import { useDeferredValue, useEffect, useState, type ReactNode } from "react"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  getNextTriStateSort,
  type TriStateSortState,
} from "@/lib/tri-state-sort"
import { cn } from "@/lib/utils"
import type {
  EmailCampaignRow,
  EmailFlowRow,
  EmailFlowSequenceStep,
} from "@/types/backend"

type EmailTab = "campaigns" | "flows"

type CampaignSortKey =
  | "campaignName"
  | "latestSendDate"
  | "sends"
  | "openRate"
  | "clickRate"
  | "revenue"
  | "revenuePerRecipient"
type CampaignSortDirection = "asc" | "desc"

type FlowSortMode =
  | "revenue_desc"
  | "sends_desc"
  | "latest_desc"
  | "open_rate_desc"
  | "click_rate_desc"
  | "revenue_per_recipient_desc"

type WorkspaceFilter = "all" | "revenue" | "engaged"

type EmailPageClientProps = {
  campaigns: EmailCampaignRow[]
  flows: EmailFlowRow[]
  currency: string
  flowSequence: {
    available: boolean
    reason: string
  }
  initialState: {
    tab?: string
    campaignId?: string
    flowId?: string
  }
}

type EmailPerformanceRow = {
  sends: number
  revenue: number
  openRate: number
  clickRate: number
}

type EmailDetailShellProps = {
  title: string
  description: string
  isMobile: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

const DEFAULT_CAMPAIGN_SORT = {
  key: "revenue",
  direction: "desc",
} as const satisfies TriStateSortState<CampaignSortKey>

const CAMPAIGN_SORT_OPTIONS: Array<{
  key: CampaignSortKey
  direction: CampaignSortDirection
  label: string
}> = [
  { key: "revenue", direction: "desc", label: "Revenue high to low" },
  { key: "revenue", direction: "asc", label: "Revenue low to high" },
  { key: "revenuePerRecipient", direction: "desc", label: "Rev / recipient high to low" },
  { key: "revenuePerRecipient", direction: "asc", label: "Rev / recipient low to high" },
  { key: "sends", direction: "desc", label: "Sends high to low" },
  { key: "sends", direction: "asc", label: "Sends low to high" },
  { key: "latestSendDate", direction: "desc", label: "Latest send new to old" },
  { key: "latestSendDate", direction: "asc", label: "Latest send old to new" },
  { key: "openRate", direction: "desc", label: "Open rate high to low" },
  { key: "openRate", direction: "asc", label: "Open rate low to high" },
  { key: "clickRate", direction: "desc", label: "Click rate high to low" },
  { key: "clickRate", direction: "asc", label: "Click rate low to high" },
  { key: "campaignName", direction: "asc", label: "Campaign A to Z" },
  { key: "campaignName", direction: "desc", label: "Campaign Z to A" },
]

const FLOW_SORT_OPTIONS: Array<{
  value: FlowSortMode
  label: string
}> = [
  { value: "revenue_desc", label: "Revenue" },
  { value: "revenue_per_recipient_desc", label: "Revenue / recipient" },
  { value: "sends_desc", label: "Sends" },
  { value: "latest_desc", label: "Latest send" },
  { value: "open_rate_desc", label: "Open rate" },
  { value: "click_rate_desc", label: "Click rate" },
]

function normalizeTab(value: string | undefined): EmailTab {
  return value === "flows" ? "flows" : "campaigns"
}

function normalizeFlowSort(value: string | undefined): FlowSortMode {
  return FLOW_SORT_OPTIONS.some((option) => option.value === value)
    ? (value as FlowSortMode)
    : "revenue_desc"
}

function normalizeFilter(value: string | undefined): WorkspaceFilter {
  return value === "revenue" || value === "engaged" ? value : "all"
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
    maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
  }).format(value)
}

function formatCount(value: number | null) {
  if (value === null) {
    return "--"
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function formatDate(value: string) {
  if (!value) {
    return "No send date"
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function matchesWorkspaceFilter(
  row: EmailPerformanceRow,
  filter: WorkspaceFilter
) {
  if (filter === "revenue") {
    return row.revenue > 0
  }

  if (filter === "engaged") {
    return row.openRate > 0 || row.clickRate > 0
  }

  return true
}

function summarizeRows(rows: EmailPerformanceRow[]) {
  return rows.reduce(
    (summary, row) => ({
      rowCount: summary.rowCount + 1,
      sends: summary.sends + row.sends,
      revenue: summary.revenue + row.revenue,
    }),
    {
      rowCount: 0,
      sends: 0,
      revenue: 0,
    }
  )
}

function getCampaignSortSelectionValue(
  sortKey: CampaignSortKey,
  sortDirection: CampaignSortDirection
) {
  return `${sortKey}:${sortDirection}`
}

function parseCampaignSortSelection(
  value: string
): TriStateSortState<CampaignSortKey> | null {
  const [sortKey, sortDirection] = value.split(":")

  if (
    !CAMPAIGN_SORT_OPTIONS.some(
      (option) =>
        option.key === sortKey && option.direction === sortDirection
    )
  ) {
    return null
  }

  return {
    key: sortKey as CampaignSortKey,
    direction: sortDirection as CampaignSortDirection,
  }
}

function getInitialCampaignSortDirection(
  sortKey: CampaignSortKey
): CampaignSortDirection {
  return sortKey === "campaignName" ? "asc" : "desc"
}

function getCampaignSortValue(row: EmailCampaignRow, sortKey: CampaignSortKey) {
  switch (sortKey) {
    case "campaignName":
      return row.campaignName || row.campaignId
    case "latestSendDate":
      return row.latestSendDate
    case "sends":
      return row.sends
    case "openRate":
      return row.openRate
    case "clickRate":
      return row.clickRate
    case "revenuePerRecipient":
      return row.revenuePerRecipient
    case "revenue":
    default:
      return row.revenue
  }
}

function compareCampaignRows(
  left: EmailCampaignRow,
  right: EmailCampaignRow,
  sortKey: CampaignSortKey
) {
  const leftValue = getCampaignSortValue(left, sortKey)
  const rightValue = getCampaignSortValue(right, sortKey)

  if (typeof leftValue === "string" && typeof rightValue === "string") {
    return leftValue.localeCompare(rightValue)
  }

  return Number(leftValue) - Number(rightValue)
}

function filterCampaignRows(input: {
  rows: EmailCampaignRow[]
  query: string
  filter: WorkspaceFilter
  sort: TriStateSortState<CampaignSortKey>
}) {
  const needle = input.query.trim().toLowerCase()

  return [...input.rows]
    .filter((row) => {
      if (!matchesWorkspaceFilter(row, input.filter)) {
        return false
      }

      if (!needle) {
        return true
      }

      return `${row.campaignName} ${row.campaignId}`
        .toLowerCase()
        .includes(needle)
    })
    .sort((left, right) => {
      const result = compareCampaignRows(left, right, input.sort.key)

      if (result !== 0) {
        return input.sort.direction === "asc" ? result : -result
      }

      if (right.revenue !== left.revenue) {
        return right.revenue - left.revenue
      }

      return left.campaignName.localeCompare(right.campaignName)
    })
}

function filterFlowRows(input: {
  rows: EmailFlowRow[]
  query: string
  filter: WorkspaceFilter
  sort: FlowSortMode
}) {
  const needle = input.query.trim().toLowerCase()

  return [...input.rows]
    .filter((row) => {
      if (!matchesWorkspaceFilter(row, input.filter)) {
        return false
      }

      if (!needle) {
        return true
      }

      return `${row.flowName} ${row.flowId}`.toLowerCase().includes(needle)
    })
    .sort((left, right) => {
      if (
        input.sort === "revenue_per_recipient_desc" &&
        right.revenuePerRecipient !== left.revenuePerRecipient
      ) {
        return right.revenuePerRecipient - left.revenuePerRecipient
      }

      if (input.sort === "sends_desc" && right.sends !== left.sends) {
        return right.sends - left.sends
      }

      if (
        input.sort === "latest_desc" &&
        right.latestSendDate !== left.latestSendDate
      ) {
        return right.latestSendDate.localeCompare(left.latestSendDate)
      }

      if (
        input.sort === "open_rate_desc" &&
        right.openRate !== left.openRate
      ) {
        return right.openRate - left.openRate
      }

      if (
        input.sort === "click_rate_desc" &&
        right.clickRate !== left.clickRate
      ) {
        return right.clickRate - left.clickRate
      }

      if (right.revenue !== left.revenue) {
        return right.revenue - left.revenue
      }

      return left.flowName.localeCompare(right.flowName)
    })
}

function EmailDetailShell({
  title,
  description,
  isMobile,
  open,
  onOpenChange,
  children,
}: EmailDetailShellProps) {
  const content = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )

  return (
    <>
      <div className="sticky top-4 hidden rounded-xl border bg-background p-5 shadow-sm md:block">
        {content}
      </div>
      <Sheet open={isMobile && open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[85svh] rounded-t-2xl px-0 pb-0 sm:max-w-none"
        >
          <div className="flex h-full flex-col overflow-hidden">
            <SheetHeader className="px-6 pb-4 pt-6 text-left">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function DetailMetricTile({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) {
  return (
    <div className="rounded-xl border bg-muted/15 p-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}

function DetailStatRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

function SequenceStepCard({
  step,
  currency,
  index,
}: {
  step: EmailFlowSequenceStep
  currency: string
  index: number
}) {
  const label =
    step.messageName ||
    step.messageId ||
    (step.stepIndex !== null ? `Step ${step.stepIndex}` : `Step ${index + 1}`)

  return (
    <div className="rounded-xl border bg-muted/10 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">
          {step.stepIndex !== null ? `Step ${step.stepIndex}` : "Unordered step"}
          {step.messageId ? ` • ${step.messageId}` : ""}
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <DetailMetricTile
          label="Revenue"
          value={formatCurrency(step.revenue, currency)}
        />
        <DetailMetricTile label="Sends" value={formatCount(step.sends)} />
        <DetailMetricTile label="Open rate" value={formatPercent(step.openRate)} />
        <DetailMetricTile label="Click rate" value={formatPercent(step.clickRate)} />
      </div>
    </div>
  )
}

function CampaignDetailContent({
  campaign,
  currency,
  totalRevenue,
}: {
  campaign: EmailCampaignRow
  currency: string
  totalRevenue: number
}) {
  const revenueShare =
    totalRevenue > 0 ? `${((campaign.revenue / totalRevenue) * 100).toFixed(1)}%` : "--"

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailMetricTile
          label="Revenue"
          value={formatCurrency(campaign.revenue, currency)}
        />
        <DetailMetricTile label="Sends" value={formatCount(campaign.sends)} />
        <DetailMetricTile
          label="Open rate"
          value={formatPercent(campaign.openRate)}
        />
        <DetailMetricTile
          label="Click rate"
          value={formatPercent(campaign.clickRate)}
        />
        <DetailMetricTile
          label="Revenue / recipient"
          value={formatCurrency(campaign.revenuePerRecipient, currency)}
        />
        <DetailMetricTile
          label="Placed orders"
          value={formatCount(campaign.placedOrders)}
          note={
            campaign.placedOrders === null
              ? "Unavailable in the current report-table schema."
              : undefined
          }
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Selected-range context</p>
        <DetailStatRow
          label="Latest send"
          value={formatDate(campaign.latestSendDate)}
        />
        <DetailStatRow
          label="Active send days"
          value={formatCount(campaign.activeDays)}
        />
        <DetailStatRow
          label="Delivery rate"
          value={formatPercent(campaign.deliveryRate)}
        />
        <DetailStatRow label="CTR" value={formatPercent(campaign.ctr)} />
        <DetailStatRow
          label="Bounce rate"
          value={formatPercent(campaign.bounceRate)}
        />
        <DetailStatRow label="Revenue share" value={revenueShare} />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Delivery and engagement</p>
        <DetailStatRow label="Delivered" value={formatCount(campaign.delivered)} />
        <DetailStatRow label="Unique opens" value={formatCount(campaign.uniqueOpens)} />
        <DetailStatRow
          label="Unique clicks"
          value={formatCount(campaign.uniqueClicks)}
        />
        <DetailStatRow label="Bounces" value={formatCount(campaign.bounces)} />
        <DetailStatRow
          label="Unsubscribes"
          value={formatCount(campaign.unsubscribes)}
        />
      </div>
    </div>
  )
}

function FlowDetailContent({
  flow,
  currency,
  totalRevenue,
  flowSequence,
}: {
  flow: EmailFlowRow
  currency: string
  totalRevenue: number
  flowSequence: {
    available: boolean
    reason: string
  }
}) {
  const revenueShare =
    totalRevenue > 0 ? `${((flow.revenue / totalRevenue) * 100).toFixed(1)}%` : "--"

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailMetricTile
          label="Revenue"
          value={formatCurrency(flow.revenue, currency)}
        />
        <DetailMetricTile label="Sends" value={formatCount(flow.sends)} />
        <DetailMetricTile label="Open rate" value={formatPercent(flow.openRate)} />
        <DetailMetricTile
          label="Click rate"
          value={formatPercent(flow.clickRate)}
        />
        <DetailMetricTile
          label="Revenue / recipient"
          value={formatCurrency(flow.revenuePerRecipient, currency)}
        />
        <DetailMetricTile
          label="Placed orders"
          value={formatCount(flow.placedOrders)}
          note={
            flow.placedOrders === null
              ? "Unavailable in the current report-table schema."
              : undefined
          }
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Selected-range context</p>
        <DetailStatRow label="Latest send" value={formatDate(flow.latestSendDate)} />
        <DetailStatRow label="Active send days" value={formatCount(flow.activeDays)} />
        <DetailStatRow label="Delivery rate" value={formatPercent(flow.deliveryRate)} />
        <DetailStatRow label="CTR" value={formatPercent(flow.ctr)} />
        <DetailStatRow label="Bounce rate" value={formatPercent(flow.bounceRate)} />
        <DetailStatRow label="Revenue share" value={revenueShare} />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Delivery and engagement</p>
        <DetailStatRow label="Delivered" value={formatCount(flow.delivered)} />
        <DetailStatRow label="Unique opens" value={formatCount(flow.uniqueOpens)} />
        <DetailStatRow label="Unique clicks" value={formatCount(flow.uniqueClicks)} />
        <DetailStatRow label="Bounces" value={formatCount(flow.bounces)} />
        <DetailStatRow label="Unsubscribes" value={formatCount(flow.unsubscribes)} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Sequence</p>
          <p className="text-sm text-muted-foreground">
            Step-level performance when the underlying flow report exposes
            sequence fields.
          </p>
        </div>
        {!flowSequence.available ? (
          <EmptyState
            title="Sequence unavailable"
            description={flowSequence.reason}
          />
        ) : flow.sequenceSteps.length === 0 ? (
          <EmptyState
            title="No sequence rows for this flow"
            description="The selected flow does not have any step-level rows in the selected range."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {flow.sequenceSteps.map((step, index) => (
              <SequenceStepCard
                key={step.key}
                step={step}
                currency={currency}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean
  direction: CampaignSortDirection
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
  sortKey: CampaignSortKey
  activeSortKey: CampaignSortKey
  direction: CampaignSortDirection
  onSort: (sortKey: CampaignSortKey) => void
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

export function EmailPageClient({
  campaigns,
  flows,
  currency,
  flowSequence,
  initialState,
}: EmailPageClientProps) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<EmailTab>(normalizeTab(initialState.tab))
  const [selectedCampaignId, setSelectedCampaignId] = useState(
    initialState.campaignId?.trim() || ""
  )
  const [selectedFlowId, setSelectedFlowId] = useState(
    initialState.flowId?.trim() || ""
  )
  const [campaignQuery, setCampaignQuery] = useState("")
  const [campaignSortKey, setCampaignSortKey] = useState<CampaignSortKey>(
    DEFAULT_CAMPAIGN_SORT.key
  )
  const [campaignSortDirection, setCampaignSortDirection] =
    useState<CampaignSortDirection>(DEFAULT_CAMPAIGN_SORT.direction)
  const [campaignFilter, setCampaignFilter] = useState<WorkspaceFilter>("all")
  const [flowQuery, setFlowQuery] = useState("")
  const [flowSort, setFlowSort] = useState<FlowSortMode>("revenue_desc")
  const [flowFilter, setFlowFilter] = useState<WorkspaceFilter>("all")
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const deferredCampaignQuery = useDeferredValue(campaignQuery)
  const deferredFlowQuery = useDeferredValue(flowQuery)
  const filteredCampaigns = filterCampaignRows({
    rows: campaigns,
    query: deferredCampaignQuery,
    filter: campaignFilter,
    sort: {
      key: campaignSortKey,
      direction: campaignSortDirection,
    },
  })
  const filteredFlows = filterFlowRows({
    rows: flows,
    query: deferredFlowQuery,
    filter: flowFilter,
    sort: flowSort,
  })
  const campaignSummary = summarizeRows(filteredCampaigns)
  const flowSummary = summarizeRows(filteredFlows)
  const activeSelectedCampaignId = filteredCampaigns.some(
    (row) => row.campaignId === selectedCampaignId
  )
    ? selectedCampaignId
    : ""
  const activeSelectedFlowId = filteredFlows.some(
    (row) => row.flowId === selectedFlowId
  )
    ? selectedFlowId
    : ""
  const selectedCampaign =
    filteredCampaigns.find((row) => row.campaignId === activeSelectedCampaignId) ??
    null
  const selectedFlow =
    filteredFlows.find((row) => row.flowId === activeSelectedFlowId) ?? null
  const hasCampaignFilters = Boolean(campaignQuery.trim() || campaignFilter !== "all")
  const hasFlowFilters = Boolean(flowQuery.trim() || flowFilter !== "all")
  const handleCampaignSortSelectionChange = (value: string) => {
    const nextSort = parseCampaignSortSelection(value) ?? DEFAULT_CAMPAIGN_SORT

    setCampaignSortKey(nextSort.key)
    setCampaignSortDirection(nextSort.direction)
  }
  const handleCampaignColumnSort = (nextSortKey: CampaignSortKey) => {
    const nextSort = getNextTriStateSort({
      currentSort: {
        key: campaignSortKey,
        direction: campaignSortDirection,
      },
      nextKey: nextSortKey,
      defaultSort: DEFAULT_CAMPAIGN_SORT,
      getInitialDirection: getInitialCampaignSortDirection,
    })

    setCampaignSortKey(nextSort.key)
    setCampaignSortDirection(nextSort.direction)
  }

  useEffect(() => {
    const nextSearchParams = new URLSearchParams(window.location.search)

    if (tab === "campaigns") {
      nextSearchParams.delete("tab")
    } else {
      nextSearchParams.set("tab", tab)
    }

    if (activeSelectedCampaignId) {
      nextSearchParams.set("campaignId", activeSelectedCampaignId)
    } else {
      nextSearchParams.delete("campaignId")
    }

    if (activeSelectedFlowId) {
      nextSearchParams.set("flowId", activeSelectedFlowId)
    } else {
      nextSearchParams.delete("flowId")
    }

    const nextUrl = `${window.location.pathname}${
      nextSearchParams.toString() ? `?${nextSearchParams.toString()}` : ""
    }`

    window.history.replaceState(window.history.state, "", nextUrl)
  }, [activeSelectedCampaignId, activeSelectedFlowId, tab])

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(normalizeTab(value))
        setMobileDetailOpen(false)
      }}
      className="flex flex-col gap-4"
    >
      <TabsList className="w-fit">
        <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        <TabsTrigger value="flows">Flows</TabsTrigger>
      </TabsList>

      <TabsContent value="campaigns" className="mt-0">
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Campaigns workspace</CardDescription>
            <CardTitle>Table-first campaign reporting</CardTitle>
            <p className="text-sm text-muted-foreground">
              Search, filter, and sort campaign performance, then drill into the
              selected campaign in a shared detail panel.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-0">
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative min-w-0 flex-1">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={campaignQuery}
                    onChange={(event) => setCampaignQuery(event.target.value)}
                    placeholder="Search campaign name or ID"
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Select
                    value={getCampaignSortSelectionValue(
                      campaignSortKey,
                      campaignSortDirection
                    )}
                    onValueChange={handleCampaignSortSelectionChange}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Sort campaigns" />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMPAIGN_SORT_OPTIONS.map((option) => (
                        <SelectItem
                          key={getCampaignSortSelectionValue(
                            option.key,
                            option.direction
                          )}
                          value={getCampaignSortSelectionValue(
                            option.key,
                            option.direction
                          )}
                        >
                          Sort: {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={campaignFilter}
                    onValueChange={(value) =>
                      setCampaignFilter(normalizeFilter(value))
                    }
                  >
                    <SelectTrigger className="w-[170px]">
                      <SelectValue placeholder="Filter campaigns" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Show: All</SelectItem>
                      <SelectItem value="revenue">Revenue generated</SelectItem>
                      <SelectItem value="engaged">Opened or clicked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  Showing {formatCount(campaignSummary.rowCount)} campaign
                  {campaignSummary.rowCount === 1 ? "" : "s"}
                </span>
                <span>Revenue {formatCurrency(campaignSummary.revenue, currency)}</span>
                <span>Sends {formatCount(campaignSummary.sends)}</span>
                {hasCampaignFilters ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCampaignQuery("")
                      setCampaignFilter("all")
                    }}
                  >
                    <XIcon data-icon="inline-start" />
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </div>

            {campaigns.length === 0 ? (
              <EmptyState
                title="No campaign rows returned"
                description="The selected range did not return any Klaviyo campaign reporting rows."
              />
            ) : filteredCampaigns.length === 0 ? (
              <EmptyState
                title="No matching campaigns"
                description="The current campaign filters do not match any visible rows."
                action={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCampaignQuery("")
                      setCampaignFilter("all")
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-[minmax(0,1.75fr)_360px]">
                <div className="overflow-hidden rounded-xl border bg-background">
                  <div className="overflow-x-auto">
                    <Table className="min-w-[860px]">
                      <TableHeader>
                        <TableRow>
                          <SortableTableHead
                            label="Campaign"
                            sortKey="campaignName"
                            activeSortKey={campaignSortKey}
                            direction={campaignSortDirection}
                            onSort={handleCampaignColumnSort}
                            align="left"
                            className="w-[32%]"
                          />
                          <SortableTableHead
                            label="Latest send"
                            sortKey="latestSendDate"
                            activeSortKey={campaignSortKey}
                            direction={campaignSortDirection}
                            onSort={handleCampaignColumnSort}
                            align="left"
                            className="w-[14%]"
                          />
                          <SortableTableHead
                            label="Sends"
                            sortKey="sends"
                            activeSortKey={campaignSortKey}
                            direction={campaignSortDirection}
                            onSort={handleCampaignColumnSort}
                            className="w-[12%]"
                          />
                          <SortableTableHead
                            label="Open rate"
                            sortKey="openRate"
                            activeSortKey={campaignSortKey}
                            direction={campaignSortDirection}
                            onSort={handleCampaignColumnSort}
                            className="w-[12%]"
                          />
                          <SortableTableHead
                            label="Click rate"
                            sortKey="clickRate"
                            activeSortKey={campaignSortKey}
                            direction={campaignSortDirection}
                            onSort={handleCampaignColumnSort}
                            className="w-[12%]"
                          />
                          <SortableTableHead
                            label="Revenue"
                            sortKey="revenue"
                            activeSortKey={campaignSortKey}
                            direction={campaignSortDirection}
                            onSort={handleCampaignColumnSort}
                            className="w-[9%]"
                          />
                          <SortableTableHead
                            label="Rev / recipient"
                            sortKey="revenuePerRecipient"
                            activeSortKey={campaignSortKey}
                            direction={campaignSortDirection}
                            onSort={handleCampaignColumnSort}
                            className="w-[9%]"
                          />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCampaigns.map((campaign) => {
                          const isSelected =
                            campaign.campaignId === selectedCampaignId

                          return (
                            <TableRow
                              key={campaign.campaignId}
                              data-selected={isSelected || undefined}
                              className={cn(
                                "cursor-pointer",
                                isSelected ? "bg-muted/40" : "hover:bg-muted/20"
                              )}
                              onClick={() => {
                                setSelectedCampaignId(campaign.campaignId)
                                if (isMobile) {
                                  setMobileDetailOpen(true)
                                }
                              }}
                            >
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  <span className="font-medium">
                                    {campaign.campaignName}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {campaign.campaignId}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>{formatDate(campaign.latestSendDate)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatCount(campaign.sends)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatPercent(campaign.openRate)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatPercent(campaign.clickRate)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {formatCurrency(campaign.revenue, currency)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatCurrency(
                                  campaign.revenuePerRecipient,
                                  currency
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {selectedCampaign ? (
                  <EmailDetailShell
                    title={selectedCampaign.campaignName}
                    description="Campaign detail stays in the same workspace on desktop and moves into a sheet on smaller screens."
                    isMobile={isMobile}
                    open={mobileDetailOpen}
                    onOpenChange={setMobileDetailOpen}
                  >
                    <CampaignDetailContent
                      campaign={selectedCampaign}
                      currency={currency}
                      totalRevenue={campaignSummary.revenue}
                    />
                  </EmailDetailShell>
                ) : (
                  <div className="hidden md:block">
                    <EmptyState
                      title="Select a campaign"
                      description="Choose a campaign row to open its detail panel without leaving the page."
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="flows" className="mt-0">
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Flows workspace</CardDescription>
            <CardTitle>Operational flow list with shared detail behavior</CardTitle>
            <p className="text-sm text-muted-foreground">
              Keep the flow list visible, then drill into the selected flow in
              the same detail surface used by Campaigns.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-0">
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative min-w-0 flex-1">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={flowQuery}
                    onChange={(event) => setFlowQuery(event.target.value)}
                    placeholder="Search flow name or ID"
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Select
                    value={flowSort}
                    onValueChange={(value) => setFlowSort(normalizeFlowSort(value))}
                  >
                    <SelectTrigger className="w-[190px]">
                      <SelectValue placeholder="Sort flows" />
                    </SelectTrigger>
                    <SelectContent>
                      {FLOW_SORT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          Sort: {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={flowFilter}
                    onValueChange={(value) => setFlowFilter(normalizeFilter(value))}
                  >
                    <SelectTrigger className="w-[170px]">
                      <SelectValue placeholder="Filter flows" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Show: All</SelectItem>
                      <SelectItem value="revenue">Revenue generated</SelectItem>
                      <SelectItem value="engaged">Opened or clicked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  Showing {formatCount(flowSummary.rowCount)} flow
                  {flowSummary.rowCount === 1 ? "" : "s"}
                </span>
                <span>Revenue {formatCurrency(flowSummary.revenue, currency)}</span>
                <span>Sends {formatCount(flowSummary.sends)}</span>
                {hasFlowFilters ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFlowQuery("")
                      setFlowFilter("all")
                    }}
                  >
                    <XIcon data-icon="inline-start" />
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </div>

            {flows.length === 0 ? (
              <EmptyState
                title="No flow rows returned"
                description="The selected range did not return any Klaviyo flow reporting rows."
              />
            ) : filteredFlows.length === 0 ? (
              <EmptyState
                title="No matching flows"
                description="The current flow filters do not match any visible rows."
                action={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFlowQuery("")
                      setFlowFilter("all")
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-[minmax(270px,0.95fr)_minmax(0,1.2fr)]">
                <div className="overflow-hidden rounded-xl border bg-background">
                  <div className="max-h-[760px] overflow-y-auto">
                    {filteredFlows.map((flow, index) => {
                      const isSelected = flow.flowId === selectedFlowId

                      return (
                        <button
                          key={flow.flowId}
                          type="button"
                          className={cn(
                            "flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors",
                            index > 0 ? "border-t" : "",
                            isSelected ? "bg-muted/40" : "hover:bg-muted/20"
                          )}
                          onClick={() => {
                            setSelectedFlowId(flow.flowId)
                            if (isMobile) {
                              setMobileDetailOpen(true)
                            }
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{flow.flowName}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {flow.flowId}
                              </p>
                            </div>
                            <p className="shrink-0 text-sm font-semibold tabular-nums">
                              {formatCurrency(flow.revenue, currency)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{formatCount(flow.sends)} sends</span>
                            <span>{formatPercent(flow.openRate)} open</span>
                            <span>{formatPercent(flow.clickRate)} click</span>
                            <span>{formatDate(flow.latestSendDate)}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {selectedFlow ? (
                  <EmailDetailShell
                    title={selectedFlow.flowName}
                    description="Flow detail uses the same right-side desktop panel and mobile sheet model as Campaigns."
                    isMobile={isMobile}
                    open={mobileDetailOpen}
                    onOpenChange={setMobileDetailOpen}
                  >
                    <FlowDetailContent
                      flow={selectedFlow}
                      currency={currency}
                      totalRevenue={flowSummary.revenue}
                      flowSequence={flowSequence}
                    />
                  </EmailDetailShell>
                ) : (
                  <div className="hidden md:block">
                    <EmptyState
                      title="Select a flow"
                      description="Choose a flow from the list to open its detail panel without leaving the Email route."
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
