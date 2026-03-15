import { ROUTES } from "@/lib/constants"
import type {
  DashboardCompareMode,
  DashboardRequestContext,
  DashboardSession,
  DashboardStateFields,
  DashboardWorkspaceOption,
} from "@/types/dashboard"

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const DASHBOARD_COMPARE_OPTIONS: ReadonlyArray<{
  value: DashboardCompareMode
  label: string
}> = [
  { value: "none", label: "No comparison" },
  { value: "previous_period", label: "Previous period" },
  { value: "previous_year", label: "Previous year" },
] as const

export type DashboardDatePresetId =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_14_days"
  | "last_30_days"
  | "last_90_days"
  | "last_365_days"
  | "month_to_date"
  | "year_to_date"
  | "last_month"
  | "last_year"

export type DashboardDatePreset = {
  id: DashboardDatePresetId
  label: string
  from: string
  to: string
}

export type DashboardSearchParamsInput =
  | URLSearchParams
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>

function normalizeDashboardTimestampParam(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim()

  return trimmed ? trimmed : undefined
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function startOfUtcYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
}

function toUtcIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function readSearchParam(input: DashboardSearchParamsInput | undefined, key: string) {
  if (!input) {
    return null
  }

  if ("get" in input && typeof input.get === "function") {
    return input.get(key)
  }

  const value = (input as Record<string, string | string[] | undefined>)[key]

  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function formatWorkspaceLabel(id: string) {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function isDashboardPath(pathname: string) {
  return pathname === ROUTES.dashboard || pathname.startsWith(`${ROUTES.dashboard}/`)
}

export function isValidDashboardDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE_PATTERN.test(value)) {
    return false
  }

  const candidate = new Date(`${value}T00:00:00.000Z`)

  return !Number.isNaN(candidate.getTime()) && toUtcIsoDate(candidate) === value
}

export function getDefaultDashboardDateRange(now = new Date()) {
  const today = startOfUtcDay(now)

  return {
    from: toUtcIsoDate(addUtcDays(today, -29)),
    to: toUtcIsoDate(today),
  }
}

export function normalizeDashboardDateRange(
  rawFrom: string | null | undefined,
  rawTo: string | null | undefined,
  now = new Date()
) {
  const safeFrom = isValidDashboardDate(rawFrom) ? rawFrom : null
  const safeTo = isValidDashboardDate(rawTo) ? rawTo : null

  if (!safeFrom && !safeTo) {
    return getDefaultDashboardDateRange(now)
  }

  const from = safeFrom ?? safeTo ?? getDefaultDashboardDateRange(now).from
  const to = safeTo ?? safeFrom ?? getDefaultDashboardDateRange(now).to

  return from <= to ? { from, to } : { from: to, to: from }
}

export function resolveDashboardCompareMode(
  value: string | null | undefined
): DashboardCompareMode {
  return DASHBOARD_COMPARE_OPTIONS.some((option) => option.value === value)
    ? (value as DashboardCompareMode)
    : "previous_period"
}

export function getDashboardWorkspaceOptions(
  session: DashboardSession,
  currentWorkspaceId?: string
) {
  const seen = new Set<string>()
  const options: DashboardWorkspaceOption[] = []

  for (const workspace of session.workspaceMemberships) {
    if (seen.has(workspace.id)) {
      continue
    }

    seen.add(workspace.id)
    options.push(workspace)
  }

  if (currentWorkspaceId && !seen.has(currentWorkspaceId)) {
    options.push({
      id: currentWorkspaceId,
      label: formatWorkspaceLabel(currentWorkspaceId),
    })
  }

  return options
}

export function resolveDashboardWorkspaceId(
  session: DashboardSession,
  searchParams?: DashboardSearchParamsInput
) {
  const workspaceId = readSearchParam(searchParams, "workspace")?.trim()

  if (workspaceId) {
    return workspaceId
  }

  return (
    session.defaultWorkspaceId ||
    session.workspaceMemberships[0]?.id ||
    "default"
  )
}

export function resolveDashboardRequestContext({
  session,
  searchParams,
  now,
}: {
  session: DashboardSession
  searchParams?: DashboardSearchParamsInput
  now?: Date
}): DashboardRequestContext {
  const dateRange = normalizeDashboardDateRange(
    readSearchParam(searchParams, "from"),
    readSearchParam(searchParams, "to"),
    now
  )

  return {
    session,
    workspaceId: resolveDashboardWorkspaceId(session, searchParams),
    from: dateRange.from,
    to: dateRange.to,
    compare: resolveDashboardCompareMode(readSearchParam(searchParams, "compare")),
    refresh: normalizeDashboardTimestampParam(readSearchParam(searchParams, "refresh")),
    loadedAt: normalizeDashboardTimestampParam(
      readSearchParam(searchParams, "loadedAt")
    ),
  }
}

export function applyDashboardStateToSearchParams(
  searchParams: URLSearchParams,
  state: DashboardStateFields
) {
  searchParams.set("workspace", state.workspaceId)
  searchParams.set("from", state.from)
  searchParams.set("to", state.to)
  searchParams.set("compare", state.compare)

  if (state.refresh) {
    searchParams.set("refresh", state.refresh)
  } else {
    searchParams.delete("refresh")
  }

  if (state.loadedAt) {
    searchParams.set("loadedAt", state.loadedAt)
  } else {
    searchParams.delete("loadedAt")
  }

  return searchParams
}

export function getDashboardDatePresets(now = new Date()): DashboardDatePreset[] {
  const today = startOfUtcDay(now)
  const currentMonthStart = startOfUtcMonth(today)
  const currentYearStart = startOfUtcYear(today)
  const lastMonthEnd = addUtcDays(currentMonthStart, -1)
  const lastMonthStart = startOfUtcMonth(lastMonthEnd)
  const lastYearStart = new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1))
  const lastYearEnd = new Date(Date.UTC(today.getUTCFullYear() - 1, 11, 31))

  return [
    {
      id: "today",
      label: "Today",
      from: toUtcIsoDate(today),
      to: toUtcIsoDate(today),
    },
    {
      id: "yesterday",
      label: "Yesterday",
      from: toUtcIsoDate(addUtcDays(today, -1)),
      to: toUtcIsoDate(addUtcDays(today, -1)),
    },
    {
      id: "last_7_days",
      label: "Last 7 Days",
      from: toUtcIsoDate(addUtcDays(today, -6)),
      to: toUtcIsoDate(today),
    },
    {
      id: "last_14_days",
      label: "Last 14 Days",
      from: toUtcIsoDate(addUtcDays(today, -13)),
      to: toUtcIsoDate(today),
    },
    {
      id: "last_30_days",
      label: "Last 30 Days",
      from: toUtcIsoDate(addUtcDays(today, -29)),
      to: toUtcIsoDate(today),
    },
    {
      id: "last_90_days",
      label: "Last 90 Days",
      from: toUtcIsoDate(addUtcDays(today, -89)),
      to: toUtcIsoDate(today),
    },
    {
      id: "last_365_days",
      label: "Last 365 Days",
      from: toUtcIsoDate(addUtcDays(today, -364)),
      to: toUtcIsoDate(today),
    },
    {
      id: "month_to_date",
      label: "Month to Date",
      from: toUtcIsoDate(currentMonthStart),
      to: toUtcIsoDate(today),
    },
    {
      id: "year_to_date",
      label: "Year to Date",
      from: toUtcIsoDate(currentYearStart),
      to: toUtcIsoDate(today),
    },
    {
      id: "last_month",
      label: "Last Month",
      from: toUtcIsoDate(lastMonthStart),
      to: toUtcIsoDate(lastMonthEnd),
    },
    {
      id: "last_year",
      label: "Last Year",
      from: toUtcIsoDate(lastYearStart),
      to: toUtcIsoDate(lastYearEnd),
    },
  ]
}

export function getMatchingDashboardDatePreset(
  state: Pick<DashboardStateFields, "from" | "to">,
  now = new Date()
) {
  return (
    getDashboardDatePresets(now).find(
      (preset) => preset.from === state.from && preset.to === state.to
    ) ?? null
  )
}

export function formatDashboardDateRangeLabel(
  from: string,
  to: string,
  now = new Date()
) {
  const preset = getMatchingDashboardDatePreset({ from, to }, now)

  if (preset) {
    return preset.label
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  return `${formatter.format(new Date(`${from}T00:00:00.000Z`))} - ${formatter.format(
    new Date(`${to}T00:00:00.000Z`)
  )}`
}

export function buildDashboardHref(href: string, state: DashboardStateFields) {
  const [hrefWithoutHash, hash = ""] = href.split("#", 2)
  const [pathname, rawSearch = ""] = hrefWithoutHash.split("?", 2)

  if (!isDashboardPath(pathname)) {
    return href
  }

  const searchParams = new URLSearchParams(rawSearch)
  applyDashboardStateToSearchParams(searchParams, state)

  const nextSearch = searchParams.toString()

  return `${pathname}${nextSearch ? `?${nextSearch}` : ""}${hash ? `#${hash}` : ""}`
}
