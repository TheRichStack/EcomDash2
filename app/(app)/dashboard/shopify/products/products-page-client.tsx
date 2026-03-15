"use client"

import { useDeferredValue, useEffect, useState } from "react"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  DownloadIcon,
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
  LoaderRange,
  ShopifyProductsBreakdown,
  ShopifyProductsTableRow,
} from "@/types/backend"

type ShopifyProductsSortKey =
  | "product"
  | "sku"
  | "variant"
  | "totalSales"
  | "orders"
  | "qtySold"
  | "qtyRefunded"
  | "refundAmount"
  | "productCosts"
  | "grossProfit"
  | "marginPct"
  | "priceReductionPct"
  | "salesVelocity7d"
  | "salesVelocity30d"

type ShopifyProductsSortDirection = "asc" | "desc"

type ShopifyProductsPageClientProps = {
  availableTags: string[]
  breakdowns: Record<ShopifyProductsBreakdown, ShopifyProductsTableRow[]>
  currency: string
  range: LoaderRange
  velocityWindows: {
    last7DaysFrom: string
    last30DaysFrom: string
  }
  initialState: {
    breakdown?: string
    tag?: string
    query?: string
    sort?: string
    direction?: string
  }
}

type ShopifyProductsTableSummary = {
  totalSales: number
  grossProfit: number
  refundAmount: number
  rowCount: number
}

const ALL_TAGS_VALUE = "__all_tags__"

const DEFAULT_SORT = {
  key: "totalSales",
  direction: "desc",
} as const satisfies TriStateSortState<ShopifyProductsSortKey>

const SORT_OPTIONS: Array<{
  value: ShopifyProductsSortKey
  label: string
}> = [
  { value: "totalSales", label: "Total Sales" },
  { value: "grossProfit", label: "Gross Profit" },
  { value: "orders", label: "Orders" },
  { value: "qtySold", label: "Qty Sold" },
  { value: "qtyRefunded", label: "Qty Refunded" },
  { value: "refundAmount", label: "Refund Amount" },
  { value: "productCosts", label: "Product Costs" },
  { value: "marginPct", label: "Margin %" },
  { value: "priceReductionPct", label: "Price Reduction %" },
  { value: "salesVelocity7d", label: "Sales Velocity (7D)" },
  { value: "salesVelocity30d", label: "Sales Velocity (30D)" },
  { value: "product", label: "Product" },
  { value: "sku", label: "SKU" },
  { value: "variant", label: "Variant" },
]

function normalizeBreakdown(value: string | undefined): ShopifyProductsBreakdown {
  return value === "sku" || value === "variant" || value === "product"
    ? value
    : "product"
}

function normalizeSortKey(value: string | undefined): ShopifyProductsSortKey {
  return SORT_OPTIONS.some((option) => option.value === value)
    ? (value as ShopifyProductsSortKey)
    : DEFAULT_SORT.key
}

function normalizeSortDirection(
  value: string | undefined
): ShopifyProductsSortDirection {
  return value === "asc" || value === "desc" ? value : DEFAULT_SORT.direction
}

function getInitialSortDirection(
  sortKey: ShopifyProductsSortKey
): ShopifyProductsSortDirection {
  if (sortKey === "product" || sortKey === "sku" || sortKey === "variant") {
    return "asc"
  }

  return "desc"
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercentFromRatio(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatVelocity(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value >= 10 ? 0 : 1,
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value)
}

function sortValueForRow(row: ShopifyProductsTableRow, key: ShopifyProductsSortKey) {
  switch (key) {
    case "product":
      return row.product
    case "sku":
      return row.sku
    case "variant":
      return row.variant
    case "totalSales":
      return row.totalSales
    case "orders":
      return row.orders
    case "qtySold":
      return row.qtySold
    case "qtyRefunded":
      return row.qtyRefunded
    case "refundAmount":
      return row.refundAmount
    case "productCosts":
      return row.productCosts
    case "grossProfit":
      return row.grossProfit
    case "marginPct":
      return row.marginPct
    case "priceReductionPct":
      return row.priceReductionPct
    case "salesVelocity7d":
      return row.salesVelocity7d
    case "salesVelocity30d":
      return row.salesVelocity30d
    default:
      return row.totalSales
  }
}

function compareRows(
  left: ShopifyProductsTableRow,
  right: ShopifyProductsTableRow,
  key: ShopifyProductsSortKey
) {
  const leftValue = sortValueForRow(left, key)
  const rightValue = sortValueForRow(right, key)

  if (typeof leftValue === "string" && typeof rightValue === "string") {
    return leftValue.localeCompare(rightValue)
  }

  return Number(leftValue) - Number(rightValue)
}

function buildCsv(input: {
  breakdown: ShopifyProductsBreakdown
  rows: ShopifyProductsTableRow[]
}) {
  const headers = [
    "Product",
    "SKU",
    ...(input.breakdown === "variant" ? ["Variant"] : []),
    "Total Sales",
    "Orders",
    "Qty Sold",
    "Qty Refunded",
    "Refund Amount",
    "Product Costs",
    "Gross Profit",
    "Margin %",
    "Price Reduction %",
    "Sales Velocity (7D)",
    "Sales Velocity (30D)",
    "Tags",
  ]

  const escapeCsv = (value: unknown) => {
    const text = String(value ?? "")

    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`
    }

    return text
  }

  const lines = [headers.join(",")]

  for (const row of input.rows) {
    const cells = [
      row.product,
      row.sku,
      ...(input.breakdown === "variant" ? [row.variant] : []),
      row.totalSales.toFixed(2),
      row.orders,
      row.qtySold,
      row.qtyRefunded,
      row.refundAmount.toFixed(2),
      row.productCosts.toFixed(2),
      row.grossProfit.toFixed(2),
      (row.marginPct * 100).toFixed(1),
      (row.priceReductionPct * 100).toFixed(1),
      row.salesVelocity7d.toFixed(2),
      row.salesVelocity30d.toFixed(2),
      row.tags.join("; "),
    ]

    lines.push(cells.map(escapeCsv).join(","))
  }

  return lines.join("\n")
}

function downloadCsv(input: {
  breakdown: ShopifyProductsBreakdown
  rows: ShopifyProductsTableRow[]
  range: LoaderRange
}) {
  const csv = buildCsv({
    breakdown: input.breakdown,
    rows: input.rows,
  })
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")

  anchor.href = url
  anchor.download = `shopify-products-${input.breakdown}-${input.range.from}-to-${input.range.to}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

function summarizeRows(rows: ShopifyProductsTableRow[]): ShopifyProductsTableSummary {
  return rows.reduce<ShopifyProductsTableSummary>(
    (summary, row) => ({
      totalSales: summary.totalSales + row.totalSales,
      grossProfit: summary.grossProfit + row.grossProfit,
      refundAmount: summary.refundAmount + row.refundAmount,
      rowCount: summary.rowCount + 1,
    }),
    {
      totalSales: 0,
      grossProfit: 0,
      refundAmount: 0,
      rowCount: 0,
    }
  )
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean
  direction: ShopifyProductsSortDirection
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
}: {
  label: string
  sortKey: ShopifyProductsSortKey
  activeSortKey: ShopifyProductsSortKey
  direction: ShopifyProductsSortDirection
  onSort: (sortKey: ShopifyProductsSortKey) => void
  align?: "left" | "right"
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
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

export function ShopifyProductsPageClient({
  availableTags,
  breakdowns,
  currency,
  range,
  velocityWindows,
  initialState,
}: ShopifyProductsPageClientProps) {
  const [breakdown, setBreakdown] = useState<ShopifyProductsBreakdown>(
    normalizeBreakdown(initialState.breakdown)
  )
  const [selectedTag, setSelectedTag] = useState(initialState.tag?.trim() || "")
  const [query, setQuery] = useState(initialState.query?.trim() || "")
  const [sortKey, setSortKey] = useState<ShopifyProductsSortKey>(
    normalizeSortKey(initialState.sort)
  )
  const [sortDirection, setSortDirection] =
    useState<ShopifyProductsSortDirection>(
      normalizeSortDirection(initialState.direction)
    )
  const deferredQuery = useDeferredValue(query)
  const searchNeedle = deferredQuery.trim().toLowerCase()
  const sourceRows = breakdowns[breakdown] ?? []
  const filteredRows = [...sourceRows]
    .filter((row) => {
      if (selectedTag && !row.tags.includes(selectedTag)) {
        return false
      }

      if (!searchNeedle) {
        return true
      }

      const haystack = `${row.product} ${row.sku} ${row.variant}`.toLowerCase()
      return haystack.includes(searchNeedle)
    })
    .sort((left, right) => {
      const result = compareRows(left, right, sortKey)

      return sortDirection === "asc" ? result : -result
    })
  const summary = summarizeRows(filteredRows)
  const hasRowData = sourceRows.length > 0
  const hasActiveFilters = Boolean(selectedTag || query.trim())
  const handleSortKeyChange = (value: string) => {
    const nextSortKey = normalizeSortKey(value)

    setSortKey(nextSortKey)
    setSortDirection((currentDirection) =>
      nextSortKey === sortKey
        ? currentDirection
        : getInitialSortDirection(nextSortKey)
    )
  }

  useEffect(() => {
    const nextSearchParams = new URLSearchParams(window.location.search)

    if (breakdown === "product") {
      nextSearchParams.delete("breakdown")
    } else {
      nextSearchParams.set("breakdown", breakdown)
    }

    if (selectedTag) {
      nextSearchParams.set("tag", selectedTag)
    } else {
      nextSearchParams.delete("tag")
    }

    if (query.trim()) {
      nextSearchParams.set("q", query.trim())
    } else {
      nextSearchParams.delete("q")
    }

    if (sortKey === DEFAULT_SORT.key) {
      nextSearchParams.delete("sort")
    } else {
      nextSearchParams.set("sort", sortKey)
    }

    if (sortDirection === DEFAULT_SORT.direction) {
      nextSearchParams.delete("dir")
    } else {
      nextSearchParams.set("dir", sortDirection)
    }

    const nextUrl = `${window.location.pathname}${
      nextSearchParams.toString() ? `?${nextSearchParams.toString()}` : ""
    }`

    window.history.replaceState(window.history.state, "", nextUrl)
  }, [breakdown, selectedTag, query, sortKey, sortDirection])

  const handleColumnSort = (nextSortKey: ShopifyProductsSortKey) => {
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
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>Product performance table</CardDescription>
        <CardTitle>Ranked product, SKU, and variant performance</CardTitle>
        <p className="text-sm text-muted-foreground">
          Sales velocity uses units sold across the trailing 7- and 30-day
          windows ending on {range.to}. Net profit in the KPI strip is the
          refund-adjusted product proxy for this slice.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search product, SKU, or variant"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Tabs value={breakdown} onValueChange={(value) => setBreakdown(normalizeBreakdown(value))}>
                <TabsList>
                  <TabsTrigger value="product">Product</TabsTrigger>
                  <TabsTrigger value="sku">SKU</TabsTrigger>
                  <TabsTrigger value="variant">Variant</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select
                value={selectedTag || ALL_TAGS_VALUE}
                onValueChange={(value) =>
                  setSelectedTag(value === ALL_TAGS_VALUE ? "" : value)
                }
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TAGS_VALUE}>All tags</SelectItem>
                  {availableTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sortKey}
                onValueChange={handleSortKeyChange}
              >
                <SelectTrigger className="w-[190px]">
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
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={() =>
                  downloadCsv({
                    breakdown,
                    rows: filteredRows,
                    range,
                  })
                }
                disabled={filteredRows.length === 0}
              >
                <DownloadIcon data-icon="inline-start" />
                Export CSV
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              Showing {formatCount(summary.rowCount)}{" "}
              {breakdown === "product"
                ? "product"
                : breakdown === "sku"
                  ? "SKU"
                  : "variant"}{" "}
              row{summary.rowCount === 1 ? "" : "s"}
            </span>
            <span>Sales {formatCurrency(summary.totalSales, currency)}</span>
            <span>Gross Profit {formatCurrency(summary.grossProfit, currency)}</span>
            <span>Refunds {formatCurrency(summary.refundAmount, currency)}</span>
            <span>
              Velocity windows {velocityWindows.last7DaysFrom} and{" "}
              {velocityWindows.last30DaysFrom}
            </span>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedTag("")
                  setQuery("")
                }}
              >
                <XIcon data-icon="inline-start" />
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>

        {!hasRowData ? (
          <EmptyState
            title="No product rows returned"
            description="No Shopify product line items were available for the selected range."
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="No matching rows"
            description="The current search and tag filters do not match any visible rows."
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSelectedTag("")
                  setQuery("")
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-background">
            <Table className="min-w-[1380px]">
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Product"
                    sortKey="product"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                    align="left"
                  />
                  <SortableTableHead
                    label="SKU"
                    sortKey="sku"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                    align="left"
                  />
                  {breakdown === "variant" ? (
                    <SortableTableHead
                      label="Variant"
                      sortKey="variant"
                      activeSortKey={sortKey}
                      direction={sortDirection}
                      onSort={handleColumnSort}
                      align="left"
                    />
                  ) : null}
                  <SortableTableHead
                    label="Total Sales"
                    sortKey="totalSales"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                  />
                  <SortableTableHead
                    label="Orders"
                    sortKey="orders"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                  />
                  <SortableTableHead
                    label="Qty Sold"
                    sortKey="qtySold"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                  />
                  <SortableTableHead
                    label="Qty Refunded"
                    sortKey="qtyRefunded"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                  />
                  <SortableTableHead
                    label="Refund Amount"
                    sortKey="refundAmount"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                  />
                  <SortableTableHead
                    label="Product Costs"
                    sortKey="productCosts"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                  />
                  <SortableTableHead
                    label="Gross Profit"
                    sortKey="grossProfit"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                  />
                  <SortableTableHead
                    label="Margin %"
                    sortKey="marginPct"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                  />
                  <SortableTableHead
                    label="Price Reduction %"
                    sortKey="priceReductionPct"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                  />
                  <SortableTableHead
                    label="Sales Velocity (7D)"
                    sortKey="salesVelocity7d"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                  />
                  <SortableTableHead
                    label="Sales Velocity (30D)"
                    sortKey="salesVelocity30d"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium text-foreground">
                      {row.product}
                    </TableCell>
                    <TableCell>{row.sku}</TableCell>
                    {breakdown === "variant" ? (
                      <TableCell>{row.variant}</TableCell>
                    ) : null}
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.totalSales, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.orders)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.qtySold)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.qtyRefunded)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.refundAmount, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.productCosts, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(row.grossProfit, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercentFromRatio(row.marginPct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercentFromRatio(row.priceReductionPct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatVelocity(row.salesVelocity7d)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatVelocity(row.salesVelocity30d)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
