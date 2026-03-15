import type { DashboardCompareMode } from "@/types/dashboard"
import type { LoaderRange } from "@/types/backend"

function parseIsoDate(isoDate: string) {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO date "${isoDate}"`)
  }

  return parsed
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function shiftIsoDateByYears(isoDate: string, years: number) {
  const date = parseIsoDate(isoDate)
  const shifted = new Date(
    Date.UTC(
      date.getUTCFullYear() + years,
      date.getUTCMonth(),
      date.getUTCDate()
    )
  )

  return toIsoDate(shifted)
}

export function getComparisonRange(
  from: string,
  to: string,
  compare: DashboardCompareMode
): LoaderRange | null {
  if (compare === "none") {
    return null
  }

  if (compare === "previous_year") {
    return {
      from: shiftIsoDateByYears(from, -1),
      to: shiftIsoDateByYears(to, -1),
    }
  }

  const fromDate = parseIsoDate(from)
  const toDate = parseIsoDate(to)
  const daySpan =
    Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1
  const comparisonTo = addUtcDays(fromDate, -1)
  const comparisonFrom = addUtcDays(comparisonTo, -(daySpan - 1))

  return {
    from: toIsoDate(comparisonFrom),
    to: toIsoDate(comparisonTo),
  }
}

export function getMonthToDateRange(anchorDate: string): LoaderRange {
  const parsed = parseIsoDate(anchorDate)
  const startOfMonth = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)
  )

  return {
    from: toIsoDate(startOfMonth),
    to: anchorDate,
  }
}
