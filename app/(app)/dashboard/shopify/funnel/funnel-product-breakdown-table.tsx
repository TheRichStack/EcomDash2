"use client"

import { useDeferredValue, useState } from "react"
import {
  ArrowUpDownIcon,
  ArrowDownIcon,
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
  ShopifyFunnelProductBreakdown,
  ShopifyFunnelProductBreakdownGroup,
  ShopifyFunnelProductBreakdownRow,
} from "@/types/backend"

type FunnelProductBreakdownTableProps = {
  breakdown: ShopifyFunnelProductBreakdown
  selectedRange: LoaderRange
}

type SortKey =
  | "product"
  | "sku"
  | "views"
  | "addToCart"
  | "checkout"
  | "purchase"
  | "addToCartRate"
  | "checkoutRate"
  | "purchaseRate"

type SortDirection = "asc" | "desc"

const DEFAULT_GROUP: ShopifyFunnelProductBreakdownGroup = "product"

const DEFAULT_SORT = {
  key: "purchase",
  direction: "desc",
} as const satisfies TriStateSortState<SortKey>

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "purchase", label: "Purchase volume" },
  { value: "views", label: "View volume" },
  { value: "addToCart", label: "Add to cart volume" },
  { value: "checkout", label: "Checkout volume" },
  { value: "purchaseRate", label: "Purchase rate" },
  { value: "checkoutRate", label: "Checkout rate" },
  { value: "addToCartRate", label: "Add to cart rate" },
  { value: "product", label: "Product" },
  { value: "sku", label: "SKU" },
]

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function formatDateSpan(range: LoaderRange) {
  return `${formatDate(range.from)} to ${formatDate(range.to)}`
}

function normalizeGroup(value: string): ShopifyFunnelProductBreakdownGroup {
  return value === "sku" ? "sku" : "product"
}

function buildSearchText(row: ShopifyFunnelProductBreakdownRow) {
  return `${row.product} ${row.sku} ${row.skuList.join(" ")}`.toLowerCase()
}

function compareRows(
  left: ShopifyFunnelProductBreakdownRow,
  right: ShopifyFunnelProductBreakdownRow,
  sortKey: SortKey
) {
  switch (sortKey) {
    case "product":
      return left.product.localeCompare(right.product)
    case "sku":
      return left.sku.localeCompare(right.sku)
    case "views":
      return left.views - right.views
    case "addToCart":
      return left.addToCart - right.addToCart
    case "checkout":
      return left.checkout - right.checkout
    case "purchase":
      return left.purchase - right.purchase
    case "addToCartRate":
      return left.addToCartRate - right.addToCartRate
    case "checkoutRate":
      return left.checkoutRate - right.checkoutRate
    case "purchaseRate":
    default:
      return left.purchaseRate - right.purchaseRate
  }
}

function getInitialSortDirection(sortKey: SortKey): SortDirection {
  return sortKey === "product" || sortKey === "sku" ? "asc" : "desc"
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
  sortKey: SortKey
  activeSortKey: SortKey
  direction: SortDirection
  onSort: (sortKey: SortKey) => void
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

function getSkuCellLabel(
  row: ShopifyFunnelProductBreakdownRow,
  group: ShopifyFunnelProductBreakdownGroup
) {
  if (group === "sku" || row.skuList.length <= 1) {
    return row.sku
  }

  return `${formatCount(row.skuList.length)} SKUs`
}

function buildDescription(input: {
  breakdown: ShopifyFunnelProductBreakdown
  selectedRange: LoaderRange
}) {
  const { breakdown, selectedRange } = input
  const baseDescription =
    "Separate from the Shopify segment breakdown above. Uses raw_ga4_product_funnel item views to show product-level and SKU-level conversion flow."

  if (!breakdown.sourceRange) {
    return `${baseDescription} No GA4 product funnel rows overlapped ${formatDateSpan(selectedRange)}.`
  }

  if (breakdown.sourceMode === "fallback") {
    return `${baseDescription} No exact GA4 row set matched ${formatDateSpan(
      selectedRange
    )}, so this table is using the closest synced range: ${formatDateSpan(
      breakdown.sourceRange
    )}.`
  }

  return `${baseDescription} Selected range: ${formatDateSpan(
    breakdown.sourceRange
  )}.`
}

export function FunnelProductBreakdownTable({
  breakdown,
  selectedRange,
}: FunnelProductBreakdownTableProps) {
  const [group, setGroup] =
    useState<ShopifyFunnelProductBreakdownGroup>(DEFAULT_GROUP)
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT.key)
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    DEFAULT_SORT.direction
  )
  const hasRowData =
    breakdown.rowsByGroup.product.length > 0 || breakdown.rowsByGroup.sku.length > 0

  if (!hasRowData) {
    return (
      <Card>
        <CardHeader className="gap-1">
          <CardDescription>GA4 item funnel</CardDescription>
          <CardTitle>Product / SKU funnel breakdown</CardTitle>
          <p className="text-sm text-muted-foreground">
            {buildDescription({ breakdown, selectedRange })}
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <EmptyState
            title="Product / SKU funnel unavailable"
            description="No raw_ga4_product_funnel rows were available to populate this lower breakdown for the current selection."
          />
        </CardContent>
      </Card>
    )
  }

  const sourceRows = breakdown.rowsByGroup[group]
  const queryValue = deferredQuery.trim().toLowerCase()
  const filteredRows = sourceRows
    .filter((row) => (queryValue ? buildSearchText(row).includes(queryValue) : true))
    .sort((left, right) => {
      const result = compareRows(left, right, sortKey)

      if (result !== 0) {
        return sortDirection === "asc" ? result : -result
      }

      return left.product.localeCompare(right.product)
    })
  const summary = filteredRows.reduce(
    (totals, row) => ({
      rowCount: totals.rowCount + 1,
      views: totals.views + row.views,
      purchases: totals.purchases + row.purchase,
    }),
    {
      rowCount: 0,
      views: 0,
      purchases: 0,
    }
  )
  const hasActiveFilters = query.trim().length > 0

  const handleSortKeyChange = (value: string) => {
    const nextSortKey = value as SortKey

    setSortKey(nextSortKey)
    setSortDirection((currentDirection) =>
      nextSortKey === sortKey
        ? currentDirection
        : getInitialSortDirection(nextSortKey)
    )
  }

  const handleColumnSort = (nextSortKey: SortKey) => {
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
        <CardDescription>GA4 item funnel</CardDescription>
        <CardTitle>Product / SKU funnel breakdown</CardTitle>
        <p className="text-sm text-muted-foreground">
          {buildDescription({ breakdown, selectedRange })}
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
                placeholder="Search product or SKU"
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Tabs value={group} onValueChange={(value) => setGroup(normalizeGroup(value))}>
                <TabsList>
                  <TabsTrigger value="product">Product</TabsTrigger>
                  <TabsTrigger value="sku">SKU</TabsTrigger>
                </TabsList>
              </Tabs>

              <Select value={sortKey} onValueChange={handleSortKeyChange}>
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
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              Showing {formatCount(summary.rowCount)} {group} row
              {summary.rowCount === 1 ? "" : "s"}
            </span>
            <span>Views {formatCount(summary.views)}</span>
            <span>Purchase {formatCount(summary.purchases)}</span>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setQuery("")}
              >
                <XIcon data-icon="inline-start" />
                Clear search
              </Button>
            ) : null}
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <EmptyState
            title="No matching rows"
            description="The current search settings do not match any visible GA4 product funnel rows."
            action={
              <Button type="button" variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-background">
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Product"
                    sortKey="product"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                    align="left"
                    className="w-[24%]"
                  />
                  <SortableTableHead
                    label="SKU"
                    sortKey="sku"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                    align="left"
                    className="w-[16%]"
                  />
                  <SortableTableHead
                    label="Views"
                    sortKey="views"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                    className="w-[10%]"
                  />
                  <SortableTableHead
                    label="Add to cart"
                    sortKey="addToCart"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                    className="w-[10%]"
                  />
                  <SortableTableHead
                    label="Checkout"
                    sortKey="checkout"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                    className="w-[10%]"
                  />
                  <SortableTableHead
                    label="Purchase"
                    sortKey="purchase"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                    className="w-[10%]"
                  />
                  <SortableTableHead
                    label="ATC rate"
                    sortKey="addToCartRate"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                    className="w-[10%]"
                  />
                  <SortableTableHead
                    label="Checkout rate"
                    sortKey="checkoutRate"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                    className="w-[10%]"
                  />
                  <SortableTableHead
                    label="Purchase rate"
                    sortKey="purchaseRate"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                    className="w-[10%]"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={`${group}:${row.key}`}>
                    <TableCell className="font-medium">{row.product}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {getSkuCellLabel(row, group)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.views)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.addToCart)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.checkout)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.purchase)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(row.addToCartRate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(row.checkoutRate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(row.purchaseRate)}
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
