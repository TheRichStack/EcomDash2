"use client"

import { useDeferredValue, useEffect, useState } from "react"
import {
  ArrowUpDownIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"

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
import {
  getNextTriStateSort,
  type TriStateSortState,
} from "@/lib/tri-state-sort"
import type {
  LoaderRange,
  ShopifyInventoryStatus,
  ShopifyInventoryTableRow,
  ShopifyInventoryVelocityWindow,
} from "@/types/backend"
import { cn } from "@/lib/utils"

type InventoryStockFilter =
  | "all"
  | "tracked_only"
  | "in_stock"
  | "out_of_stock"

type InventoryStatusFilter = "all" | ShopifyInventoryStatus

type InventorySortKey =
  | "status"
  | "product"
  | "variant"
  | "sku"
  | "stock"
  | "sold"
  | "rate"
  | "days_left"
  | "estimated_stockout"

type InventorySortDirection = "asc" | "desc"

type InventoryPageClientProps = {
  rows: ShopifyInventoryTableRow[]
  range: LoaderRange
  latestSnapshotDate: string | null
  usedRangeFallback: boolean
  velocity: {
    defaultWindow: ShopifyInventoryVelocityWindow
    windows: ShopifyInventoryVelocityWindow[]
  }
  initialState: {
    velocityWindow?: string
    stock?: string
    status?: string
    query?: string
    sort?: string
    direction?: string
  }
}

const DEFAULT_STOCK_FILTER: InventoryStockFilter = "all"
const DEFAULT_STATUS_FILTER: InventoryStatusFilter = "all"
const DEFAULT_SORT = {
  key: "status",
  direction: "asc",
} as const satisfies TriStateSortState<InventorySortKey>
const DEFAULT_SORT_KEY: InventorySortKey = DEFAULT_SORT.key
const DEFAULT_SORT_DIRECTION: InventorySortDirection = DEFAULT_SORT.direction

const STOCK_FILTER_OPTIONS: Array<{
  value: InventoryStockFilter
  label: string
}> = [
  { value: "all", label: "All stock" },
  { value: "tracked_only", label: "Tracked only" },
  { value: "in_stock", label: "In stock" },
  { value: "out_of_stock", label: "Out of stock" },
]

const STATUS_FILTER_OPTIONS: Array<{
  value: InventoryStatusFilter
  label: string
}> = [
  { value: "all", label: "All statuses" },
  { value: "healthy", label: "Healthy" },
  { value: "at_risk", label: "At risk" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "untracked", label: "Untracked" },
]

const SORT_OPTIONS: Array<{
  value: InventorySortKey
  label: string
}> = [
  { value: "status", label: "Status then days left" },
  { value: "product", label: "Product" },
  { value: "variant", label: "Variant" },
  { value: "sku", label: "SKU" },
  { value: "stock", label: "Stock" },
  { value: "sold", label: "Sold (window)" },
  { value: "rate", label: "Rate / day" },
  { value: "days_left", label: "Days left" },
  { value: "estimated_stockout", label: "Estimated stockout" },
]

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function normalizeVelocityWindow(
  value: string | undefined,
  windows: ShopifyInventoryVelocityWindow[],
  fallback: ShopifyInventoryVelocityWindow
) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10)

  return windows.find((window) => window === parsed) ?? fallback
}

function normalizeStockFilter(value: string | undefined): InventoryStockFilter {
  return STOCK_FILTER_OPTIONS.some((option) => option.value === value)
    ? (value as InventoryStockFilter)
    : DEFAULT_STOCK_FILTER
}

function normalizeStatusFilter(value: string | undefined): InventoryStatusFilter {
  return STATUS_FILTER_OPTIONS.some((option) => option.value === value)
    ? (value as InventoryStatusFilter)
    : DEFAULT_STATUS_FILTER
}

function normalizeSortKey(value: string | undefined): InventorySortKey {
  return SORT_OPTIONS.some((option) => option.value === value)
    ? (value as InventorySortKey)
    : DEFAULT_SORT_KEY
}

function normalizeSortDirection(
  value: string | undefined
): InventorySortDirection {
  return value === "asc" || value === "desc" ? value : DEFAULT_SORT_DIRECTION
}

function getInitialSortDirection(
  sortKey: InventorySortKey
): InventorySortDirection {
  if (
    sortKey === "status" ||
    sortKey === "product" ||
    sortKey === "variant" ||
    sortKey === "sku" ||
    sortKey === "days_left" ||
    sortKey === "estimated_stockout"
  ) {
    return "asc"
  }

  return "desc"
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatRate(value: number | null) {
  if (value === null) {
    return "Untracked"
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value >= 10 ? 0 : 1,
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value)
}

function formatDaysLeft(value: number | null, tracked: boolean) {
  if (!tracked) {
    return "Untracked"
  }

  if (value === null || !Number.isFinite(value)) {
    return "No sales"
  }

  if (value < 1) {
    return "<1"
  }

  if (value > 3650) {
    return "1000+"
  }

  return formatCount(Math.round(value))
}

function formatStockoutDate(value: string | null, tracked: boolean) {
  if (!tracked) {
    return "Untracked"
  }

  if (!value) {
    return "No estimate"
  }

  return dateFormatter.format(new Date(`${value}T00:00:00.000Z`))
}

function statusLabel(status: ShopifyInventoryStatus) {
  switch (status) {
    case "healthy":
      return "Healthy"
    case "at_risk":
      return "At risk"
    case "out_of_stock":
      return "Out of stock"
    case "untracked":
    default:
      return "Untracked"
  }
}

function statusBadgeClass(status: ShopifyInventoryStatus) {
  switch (status) {
    case "healthy":
      return "border-border text-foreground"
    case "at_risk":
      return "bg-secondary text-secondary-foreground"
    case "out_of_stock":
      return "bg-destructive/10 text-destructive"
    case "untracked":
    default:
      return "border-border text-muted-foreground"
  }
}

function compareNullableNumbers(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return 0
  }

  if (left === null) {
    return 1
  }

  if (right === null) {
    return -1
  }

  return left - right
}

function compareNullableDates(left: string | null, right: string | null) {
  if (!left && !right) {
    return 0
  }

  if (!left) {
    return 1
  }

  if (!right) {
    return -1
  }

  return left.localeCompare(right)
}

function compareStatusRows(
  left: ShopifyInventoryTableRow,
  right: ShopifyInventoryTableRow,
  selectedWindow: ShopifyInventoryVelocityWindow
) {
  const leftStatusRank =
    left.status === "out_of_stock"
      ? 0
      : left.status === "at_risk"
        ? 1
        : left.status === "healthy"
          ? 2
          : 3
  const rightStatusRank =
    right.status === "out_of_stock"
      ? 0
      : right.status === "at_risk"
        ? 1
        : right.status === "healthy"
          ? 2
          : 3

  if (leftStatusRank !== rightStatusRank) {
    return leftStatusRank - rightStatusRank
  }

  const daysLeftComparison = compareNullableNumbers(
    left.velocity[selectedWindow].daysLeft,
    right.velocity[selectedWindow].daysLeft
  )

  if (daysLeftComparison !== 0) {
    return daysLeftComparison
  }

  return compareNullableNumbers(left.available, right.available)
}

function baseRowComparison(
  left: ShopifyInventoryTableRow,
  right: ShopifyInventoryTableRow
) {
  if (left.product !== right.product) {
    return left.product.localeCompare(right.product)
  }

  if (left.variant !== right.variant) {
    return left.variant.localeCompare(right.variant)
  }

  return left.sku.localeCompare(right.sku)
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean
  direction: InventorySortDirection
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
  sortKey: InventorySortKey
  activeSortKey: InventorySortKey
  direction: InventorySortDirection
  onSort: (sortKey: InventorySortKey) => void
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

export function InventoryPageClient({
  rows,
  range,
  latestSnapshotDate,
  usedRangeFallback,
  velocity,
  initialState,
}: InventoryPageClientProps) {
  const [velocityWindow, setVelocityWindow] = useState<ShopifyInventoryVelocityWindow>(
    normalizeVelocityWindow(
      initialState.velocityWindow,
      velocity.windows,
      velocity.defaultWindow
    )
  )
  const [stockFilter, setStockFilter] = useState<InventoryStockFilter>(
    normalizeStockFilter(initialState.stock)
  )
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>(
    normalizeStatusFilter(initialState.status)
  )
  const [query, setQuery] = useState(initialState.query?.trim() || "")
  const [sortKey, setSortKey] = useState<InventorySortKey>(
    normalizeSortKey(initialState.sort)
  )
  const [sortDirection, setSortDirection] = useState<InventorySortDirection>(
    normalizeSortDirection(initialState.direction)
  )
  const deferredQuery = useDeferredValue(query)
  const searchNeedle = deferredQuery.trim().toLowerCase()
  const filteredRows = [...rows]
    .filter((row) => {
      if (stockFilter === "tracked_only" && !row.tracked) {
        return false
      }

      if (stockFilter === "in_stock" && !(row.available !== null && row.available > 0)) {
        return false
      }

      if (
        stockFilter === "out_of_stock" &&
        !(row.tracked && row.available !== null && row.available <= 0)
      ) {
        return false
      }

      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false
      }

      if (!searchNeedle) {
        return true
      }

      const haystack = `${row.product} ${row.variant} ${row.sku}`.toLowerCase()
      return haystack.includes(searchNeedle)
    })
    .sort((left, right) => {
      const leftMetrics = left.velocity[velocityWindow]
      const rightMetrics = right.velocity[velocityWindow]
      let result = 0

      switch (sortKey) {
        case "status":
          result = compareStatusRows(left, right, velocityWindow)
          break
        case "product":
          result = left.product.localeCompare(right.product)
          break
        case "variant":
          result = left.variant.localeCompare(right.variant)
          break
        case "sku":
          result = left.sku.localeCompare(right.sku)
          break
        case "stock":
          result = compareNullableNumbers(left.available, right.available)
          break
        case "sold":
          result = leftMetrics.sold - rightMetrics.sold
          break
        case "rate":
          result = compareNullableNumbers(
            leftMetrics.ratePerDay,
            rightMetrics.ratePerDay
          )
          break
        case "days_left":
          result = compareNullableNumbers(
            leftMetrics.daysLeft,
            rightMetrics.daysLeft
          )
          break
        case "estimated_stockout":
          result = compareNullableDates(
            leftMetrics.estimatedStockout,
            rightMetrics.estimatedStockout
          )
          break
        default:
          result = 0
      }

      if (result === 0) {
        result = baseRowComparison(left, right)
      }

      return sortDirection === "asc" ? result : -result
    })
  const hasActiveFilters = Boolean(
    query.trim() ||
      stockFilter !== DEFAULT_STOCK_FILTER ||
      statusFilter !== DEFAULT_STATUS_FILTER
  )
  const handleSortKeyChange = (value: string) => {
    const nextSortKey = normalizeSortKey(value)

    setSortKey(nextSortKey)
    setSortDirection((currentDirection) =>
      nextSortKey === sortKey
        ? currentDirection
        : getInitialSortDirection(nextSortKey)
    )
  }
  const handleColumnSort = (nextSortKey: InventorySortKey) => {
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

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)

    if (velocityWindow === velocity.defaultWindow) {
      searchParams.delete("velocityWindow")
    } else {
      searchParams.set("velocityWindow", String(velocityWindow))
    }

    if (stockFilter === DEFAULT_STOCK_FILTER) {
      searchParams.delete("stock")
    } else {
      searchParams.set("stock", stockFilter)
    }

    if (statusFilter === DEFAULT_STATUS_FILTER) {
      searchParams.delete("status")
    } else {
      searchParams.set("status", statusFilter)
    }

    if (query.trim()) {
      searchParams.set("q", query.trim())
    } else {
      searchParams.delete("q")
    }

    if (sortKey === DEFAULT_SORT_KEY) {
      searchParams.delete("sort")
    } else {
      searchParams.set("sort", sortKey)
    }

    if (sortDirection === DEFAULT_SORT_DIRECTION) {
      searchParams.delete("dir")
    } else {
      searchParams.set("dir", sortDirection)
    }

    const nextUrl = `${window.location.pathname}${
      searchParams.toString() ? `?${searchParams.toString()}` : ""
    }`

    window.history.replaceState(window.history.state, "", nextUrl)
  }, [
    query,
    sortDirection,
    sortKey,
    statusFilter,
    stockFilter,
    velocity.defaultWindow,
    velocityWindow,
  ])

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>Inventory table</CardDescription>
        <CardTitle>Current stock position by tracked variant</CardTitle>
        <p className="text-sm text-muted-foreground">
          Sold, rate per day, days left, and estimated stockout update from the
          selected velocity window. Velocity windows end on{" "}
          {latestSnapshotDate
            ? dateFormatter.format(new Date(`${latestSnapshotDate}T00:00:00.000Z`))
            : "the latest snapshot date"}
          .
        </p>
        {usedRangeFallback && latestSnapshotDate ? (
          <p className="text-sm text-muted-foreground">
            No snapshot was available inside {range.from} to {range.to}, so the
            latest available snapshot is shown instead.
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-0">
        {rows.length === 0 ? (
          <EmptyState
            title="No inventory snapshot available"
            description="Shopify inventory snapshots have not landed for this workspace yet."
          />
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <div className="relative min-w-0 flex-1">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search product, variant, or SKU"
                    className="pl-9"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <Select
                    value={sortKey}
                    onValueChange={handleSortKeyChange}
                  >
                    <SelectTrigger className="w-[210px]">
                      <SelectValue placeholder="Sort rows" />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() =>
                      setSortDirection((currentDirection) =>
                        currentDirection === "desc" ? "asc" : "desc"
                      )
                    }
                  >
                    {sortDirection === "desc" ? (
                      <ArrowDownIcon data-icon="inline-start" />
                    ) : (
                      <ArrowUpIcon data-icon="inline-start" />
                    )}
                    {sortDirection === "desc" ? "Descending" : "Ascending"}
                  </Button>

                  <Select
                    value={stockFilter}
                    onValueChange={(value) =>
                      setStockFilter(normalizeStockFilter(value))
                    }
                  >
                    <SelectTrigger className="w-[170px]">
                      <SelectValue placeholder="Stock filter" />
                    </SelectTrigger>
                    <SelectContent>
                      {STOCK_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={statusFilter}
                    onValueChange={(value) =>
                      setStatusFilter(normalizeStatusFilter(value))
                    }
                  >
                    <SelectTrigger className="w-[170px]">
                      <SelectValue placeholder="Status filter" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {velocity.windows.map((window) => (
                    <Button
                      key={window}
                      type="button"
                      size="sm"
                      variant={velocityWindow === window ? "default" : "outline"}
                      onClick={() => setVelocityWindow(window)}
                    >
                      {window}D
                    </Button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    Showing {formatCount(filteredRows.length)} of {formatCount(rows.length)} rows
                  </span>
                  {latestSnapshotDate ? (
                    <span>
                      Snapshot{" "}
                      {dateFormatter.format(
                        new Date(`${latestSnapshotDate}T00:00:00.000Z`)
                      )}
                    </span>
                  ) : null}
                  {hasActiveFilters ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setQuery("")
                        setStockFilter(DEFAULT_STOCK_FILTER)
                        setStatusFilter(DEFAULT_STATUS_FILTER)
                      }}
                    >
                      <XIcon data-icon="inline-start" />
                      Clear filters
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <EmptyState
                title="No matching rows"
                description="The current search and filter settings do not match any visible inventory rows."
                action={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setQuery("")
                      setStockFilter(DEFAULT_STOCK_FILTER)
                      setStatusFilter(DEFAULT_STATUS_FILTER)
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border bg-background">
                <Table className="min-w-[1120px]">
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        label="Product"
                        sortKey="product"
                        activeSortKey={sortKey}
                        direction={sortDirection}
                        onSort={handleColumnSort}
                        align="left"
                        className="w-[22%]"
                      />
                      <SortableTableHead
                        label="Variant"
                        sortKey="variant"
                        activeSortKey={sortKey}
                        direction={sortDirection}
                        onSort={handleColumnSort}
                        align="left"
                        className="w-[16%]"
                      />
                      <SortableTableHead
                        label="SKU"
                        sortKey="sku"
                        activeSortKey={sortKey}
                        direction={sortDirection}
                        onSort={handleColumnSort}
                        align="left"
                        className="w-[11%]"
                      />
                      <SortableTableHead
                        label="Stock"
                        sortKey="stock"
                        activeSortKey={sortKey}
                        direction={sortDirection}
                        onSort={handleColumnSort}
                        className="w-[8%]"
                      />
                      <SortableTableHead
                        label={`Sold (${velocityWindow}D)`}
                        sortKey="sold"
                        activeSortKey={sortKey}
                        direction={sortDirection}
                        onSort={handleColumnSort}
                        className="w-[10%]"
                      />
                      <SortableTableHead
                        label="Rate / day"
                        sortKey="rate"
                        activeSortKey={sortKey}
                        direction={sortDirection}
                        onSort={handleColumnSort}
                        className="w-[9%]"
                      />
                      <SortableTableHead
                        label="Days left"
                        sortKey="days_left"
                        activeSortKey={sortKey}
                        direction={sortDirection}
                        onSort={handleColumnSort}
                        className="w-[9%]"
                      />
                      <SortableTableHead
                        label="Estimated stockout"
                        sortKey="estimated_stockout"
                        activeSortKey={sortKey}
                        direction={sortDirection}
                        onSort={handleColumnSort}
                        className="w-[10%]"
                      />
                      <SortableTableHead
                        label="Status"
                        sortKey="status"
                        activeSortKey={sortKey}
                        direction={sortDirection}
                        onSort={handleColumnSort}
                        align="left"
                        className="w-[12%]"
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => {
                      const metrics = row.velocity[velocityWindow]

                      return (
                        <TableRow key={row.key}>
                          <TableCell className="font-medium whitespace-normal">
                            {row.product}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {row.variant}
                          </TableCell>
                          <TableCell>{row.sku}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.available === null ? "N/A" : formatCount(row.available)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCount(metrics.sold)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatRate(metrics.ratePerDay)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatDaysLeft(metrics.daysLeft, row.tracked)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatStockoutDate(
                              metrics.estimatedStockout,
                              row.tracked
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(statusBadgeClass(row.status))}
                            >
                              {statusLabel(row.status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
