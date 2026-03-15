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
  SelectGroup,
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
import { cn } from "@/lib/utils"
import type {
  ShopifyFunnelBreakdownDimension,
  ShopifyFunnelBreakdownRow,
} from "@/types/backend"

type FunnelBreakdownTableProps = {
  breakdowns: Partial<
    Record<ShopifyFunnelBreakdownDimension, ShopifyFunnelBreakdownRow[]>
  >
  availableDimensions: ShopifyFunnelBreakdownDimension[]
  latestAvailableDate: string | null
}

type SortKey =
  | "label"
  | "sessions"
  | "addToCart"
  | "checkout"
  | "purchase"
  | "addToCartRate"
  | "checkoutRate"
  | "checkoutToPurchaseRate"
  | "purchaseRate"

type SortDirection = "asc" | "desc"

const DIMENSION_LABELS: Record<ShopifyFunnelBreakdownDimension, string> = {
  channel: "Channel",
  device: "Device",
  customer_type: "Customer type",
  country: "Country",
}

const DEFAULT_SORT = {
  key: "purchase",
  direction: "desc",
} as const satisfies TriStateSortState<SortKey>

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "label", label: "Label" },
  { value: "purchase", label: "Purchase volume" },
  { value: "sessions", label: "Session volume" },
  { value: "addToCart", label: "ATC volume" },
  { value: "checkout", label: "Checkout volume" },
  { value: "purchaseRate", label: "Purchase rate" },
  { value: "checkoutToPurchaseRate", label: "Checkout to purchase" },
  { value: "addToCartRate", label: "Add to cart rate" },
  { value: "checkoutRate", label: "Checkout rate" },
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

function compareRows(
  left: ShopifyFunnelBreakdownRow,
  right: ShopifyFunnelBreakdownRow,
  sortKey: SortKey
) {
  switch (sortKey) {
    case "label":
      return left.label.localeCompare(right.label)
    case "sessions":
      return left.sessions - right.sessions
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
    case "checkoutToPurchaseRate":
      return left.checkoutToPurchaseRate - right.checkoutToPurchaseRate
    case "purchaseRate":
    default:
      return left.purchaseRate - right.purchaseRate
  }
}

function getInitialSortDirection(sortKey: SortKey): SortDirection {
  return sortKey === "label" ? "asc" : "desc"
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

export function FunnelBreakdownTable({
  breakdowns,
  availableDimensions,
  latestAvailableDate,
}: FunnelBreakdownTableProps) {
  const [dimension, setDimension] = useState<ShopifyFunnelBreakdownDimension>(
    availableDimensions[0] ?? "channel"
  )
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT.key)
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    DEFAULT_SORT.direction
  )

  if (availableDimensions.length === 0) {
    return (
      <EmptyState
        title="Breakdown table unavailable"
        description="No Shopify funnel segment breakdown rows were returned for the selected period, so the breakdown table cannot render yet."
      />
    )
  }

  const queryValue = deferredQuery.trim().toLowerCase()
  const sourceRows = breakdowns[dimension] ?? []
  const filteredRows = sourceRows
    .filter((row) =>
      queryValue ? row.label.toLowerCase().includes(queryValue) : true
    )
    .sort((left, right) => {
      const result = compareRows(left, right, sortKey)

      if (result !== 0) {
        return sortDirection === "asc" ? result : -result
      }

      return left.label.localeCompare(right.label)
    })
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
        <CardDescription>Breakdown table</CardDescription>
        <CardTitle>Segment breakdown tied directly to the funnel metrics</CardTitle>
        <p className="text-sm text-muted-foreground">
          Switch dimension within the same table shell to compare conversion and
          stage volume by channel, device, customer type, or country.
          {latestAvailableDate ? ` Data available through ${formatDate(latestAvailableDate)}.` : ""}
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
                placeholder={`Search ${DIMENSION_LABELS[dimension].toLowerCase()}`}
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Select
                value={dimension}
                onValueChange={(value) =>
                  setDimension(value as ShopifyFunnelBreakdownDimension)
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Dimension" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {availableDimensions.map((availableDimension) => (
                      <SelectItem
                        key={availableDimension}
                        value={availableDimension}
                      >
                        {DIMENSION_LABELS[availableDimension]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
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
                  <SelectGroup>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
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
              Showing {formatCount(filteredRows.length)} of {formatCount(sourceRows.length)} rows
            </span>
            <span>{DIMENSION_LABELS[dimension]}</span>
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
            description="The current search settings do not match any visible funnel breakdown rows."
            action={
              <Button type="button" variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-background">
            <Table className="min-w-[1120px]">
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label={DIMENSION_LABELS[dimension]}
                    sortKey="label"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                    align="left"
                    className="w-[22%]"
                  />
                  <SortableTableHead
                    label="Sessions"
                    sortKey="sessions"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={handleColumnSort}
                    className="w-[10%]"
                  />
                  <SortableTableHead
                    label="ATC"
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
                    label="Checkout to purchase"
                    sortKey="checkoutToPurchaseRate"
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
                    className="w-[8%]"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={`${dimension}:${row.key}`}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.sessions)}
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
                      {formatPercent(row.checkoutToPurchaseRate)}
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
