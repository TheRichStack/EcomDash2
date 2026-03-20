"use client"

import { Fragment, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarRangeIcon } from "lucide-react"

import { ThemeToggle } from "@/components/theme/theme-toggle"
import { DashboardRefreshStatus } from "@/components/layout/dashboard-refresh-status"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { appRouteTitles } from "@/config/nav"
import { useDashboardState } from "@/hooks/use-dashboard-state"
import {
  DASHBOARD_COMPARE_OPTIONS,
  formatDashboardDateRangeLabel,
  isValidDashboardDate,
  normalizeDashboardDateRange,
} from "@/lib/dashboard-state"
import { ROUTES } from "@/lib/constants"
import { cn } from "@/lib/utils"

function formatSegment(segment: string) {
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function AppHeader() {
  const pathname = usePathname()
  const { buildHref, requestContext, setState } = useDashboardState()
  const segments = pathname.split("/").filter(Boolean)

  const breadcrumbs = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`
    const label = appRouteTitles[href] ?? formatSegment(segment)
    const isRoutable = href === ROUTES.home || href in appRouteTitles

    return {
      href,
      label,
      isCurrent: index === segments.length - 1,
      isRoutable,
    }
  })

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2.5 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  {segments.length === 0 ? (
                    <BreadcrumbPage>Home</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href="/">Home</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {breadcrumbs.map((item) => (
                  <Fragment key={item.href}>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {item.isCurrent || !item.isRoutable ? (
                        <BreadcrumbPage>{item.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link href={buildHref(item.href)}>{item.label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-2 xl:flex-1">
            <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center xl:flex-nowrap">
              <div className="flex min-w-0 flex-col gap-2 rounded-xl border bg-muted/10 p-1.5 sm:flex-row sm:items-center sm:gap-1.5 xl:flex-1">
                <DashboardDateRangeControl className="sm:min-w-[320px] sm:flex-1 xl:w-[360px]" />

                <Select
                  value={requestContext.compare}
                  onValueChange={(compare) =>
                    setState({
                      compare:
                        compare as (typeof DASHBOARD_COMPARE_OPTIONS)[number]["value"],
                    })
                  }
                >
                  <SelectTrigger className="h-10 w-full rounded-xl sm:w-[184px] xl:w-[176px]">
                    <SelectValue placeholder="Comparison" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {DASHBOARD_COMPARE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {compareLabel(option.value)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DashboardRefreshStatus className="xl:ml-auto xl:w-auto" />
        </div>
      </div>
    </header>
  )
}

function DashboardDateRangeControl({ className }: { className?: string }) {
  const { dateLabel, datePresets, requestContext, setState } =
    useDashboardState()
  const [isOpen, setIsOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(requestContext.from)
  const [draftTo, setDraftTo] = useState(requestContext.to)
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getCalendarMonth(requestContext.from, requestContext.to, requestContext.to)
  )

  const canApply = isValidDashboardDate(draftFrom) && isValidDashboardDate(draftTo)
  const selectedRange = getSelectedRange(draftFrom, draftTo)

  return (
    <Popover
      open={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen)

        if (nextOpen) {
          setDraftFrom(requestContext.from)
          setDraftTo(requestContext.to)
          setVisibleMonth(
            getCalendarMonth(
              requestContext.from,
              requestContext.to,
              requestContext.to
            )
          )
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between gap-1.5 rounded-xl border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:bg-muted",
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarRangeIcon
              data-icon="inline-start"
              className="text-muted-foreground"
            />
            <span className="truncate">{dateLabel}</span>
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {formatCompactDateSpan(requestContext.from, requestContext.to)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-[min(34rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0"
      >
        <div className="grid gap-0 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4 border-b bg-muted/15 p-4 md:border-r md:border-b-0">
            <PopoverHeader>
              <PopoverTitle>Date range</PopoverTitle>
              <PopoverDescription className="text-xs">
                Choose a shared reporting window for every dashboard route.
              </PopoverDescription>
            </PopoverHeader>

            <ScrollArea className="h-[250px] md:h-[284px]">
              <div className="flex flex-col gap-1 pr-3">
                {datePresets.map((preset) => {
                  const isActive = draftFrom === preset.from && draftTo === preset.to

                  return (
                    <Button
                      key={preset.id}
                      variant={isActive ? "secondary" : "ghost"}
                      className="justify-start rounded-xl"
                      onClick={() => {
                        setDraftFrom(preset.from)
                        setDraftTo(preset.to)
                        setVisibleMonth(
                          getCalendarMonth(preset.from, preset.to, preset.to)
                        )
                      }}
                    >
                      {preset.label}
                    </Button>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          <div className="flex min-h-0 flex-col gap-4 p-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                {draftFrom && draftTo
                  ? formatDashboardDateRangeLabel(draftFrom, draftTo)
                  : "Choose a start and end date"}
              </p>
              <p className="text-xs text-muted-foreground">
                {draftFrom && draftTo
                  ? formatLongDateSpan(draftFrom, draftTo)
                  : "Range updates after Apply."}
              </p>
            </div>

            <div className="rounded-xl border p-2">
              <Calendar
                mode="range"
                selected={selectedRange}
                onSelect={(range) => {
                  if (!range?.from) {
                    setDraftFrom("")
                    setDraftTo("")
                    return
                  }

                  setDraftFrom(toLocalIsoDate(range.from))
                  setDraftTo(range.to ? toLocalIsoDate(range.to) : "")
                  setVisibleMonth(
                    new Date(range.from.getFullYear(), range.from.getMonth(), 1)
                  )
                }}
                month={visibleMonth}
                onMonthChange={setVisibleMonth}
                numberOfMonths={1}
                showOutsideDays={false}
                disabled={{ after: startOfLocalDay(new Date()) }}
                className="w-full p-1"
                classNames={{
                  month: "w-full gap-3",
                  month_caption:
                    "h-auto justify-center px-8 pb-2 text-sm font-semibold",
                  weekdays: "grid grid-cols-7",
                  week: "grid grid-cols-7 mt-1",
                }}
              />
            </div>

            <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {canApply
                  ? "Date range is shared across dashboard routes."
                  : "Select both a start and end date."}
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraftFrom(requestContext.from)
                    setDraftTo(requestContext.to)
                    setIsOpen(false)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!canApply}
                  onClick={() => {
                    const normalizedRange = normalizeDashboardDateRange(
                      draftFrom,
                      draftTo
                    )

                    setState(normalizedRange)
                    setIsOpen(false)
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function compareLabel(compare: (typeof DASHBOARD_COMPARE_OPTIONS)[number]["value"]) {
  switch (compare) {
    case "none":
      return "No Comparison"
    case "previous_period":
      return "Previous period"
    case "previous_year":
      return "Previous year"
    default:
      return compare
  }
}

function getSelectedRange(from: string, to: string) {
  if (!isValidDashboardDate(from)) {
    return undefined
  }

  const fromDate = parseLocalIsoDate(from)

  if (!fromDate) {
    return undefined
  }

  const toDate = isValidDashboardDate(to)
    ? (parseLocalIsoDate(to) ?? undefined)
    : undefined

  return {
    from: fromDate,
    to: toDate,
  }
}

function parseLocalIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)

  if (!year || !month || !day) {
    return null
  }

  return new Date(year, month - 1, day)
}

function toLocalIsoDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function getCalendarMonth(from: string, to: string, fallbackTo: string) {
  const resolved =
    parseLocalIsoDate(to) ??
    parseLocalIsoDate(from) ??
    parseLocalIsoDate(fallbackTo) ??
    new Date()

  return new Date(resolved.getFullYear(), resolved.getMonth(), 1)
}

function formatCompactDateSpan(from: string, to: string) {
  const fromDate = parseLocalIsoDate(from)
  const toDate = parseLocalIsoDate(to)

  if (!fromDate || !toDate) {
    return ""
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  })

  return `${formatter.format(fromDate)} to ${formatter.format(toDate)}`
}

function formatLongDateSpan(from: string, to: string) {
  const fromDate = parseLocalIsoDate(from)
  const toDate = parseLocalIsoDate(to)

  if (!fromDate || !toDate) {
    return ""
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  return `${formatter.format(fromDate)} to ${formatter.format(toDate)}`
}
