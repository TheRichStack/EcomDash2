export type DateWindow = {
  from: string
  to: string
}

function parseDateValue(value: string) {
  const normalized = String(value ?? "").trim()

  if (!normalized) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const date = new Date(`${normalized}T00:00:00.000Z`)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function isoHourBucket(date: Date) {
  const bucket = new Date(date)
  bucket.setUTCMinutes(0, 0, 0)
  return bucket.toISOString()
}

export function normalizeDate(value: string) {
  const date = parseDateValue(value)

  return date ? isoDate(date) : ""
}

export function addDays(value: string, days: number) {
  const base = parseDateValue(value)

  if (!base) {
    throw new Error(`Invalid ISO date "${value}".`)
  }

  base.setUTCDate(base.getUTCDate() + days)

  return isoDate(base)
}

export function minIso(left: string, right: string) {
  return left <= right ? left : right
}

export function getDefaultBackfillFrom(today = new Date()) {
  const from = new Date(today)
  from.setUTCDate(from.getUTCDate() - 365 * 4)
  return isoDate(from)
}

export function buildHourlyWindow(todayIso: string, cursorIso: string): DateWindow {
  const trailingStart = addDays(todayIso, -7)
  const normalizedCursor = normalizeDate(cursorIso)

  if (!normalizedCursor) {
    return {
      from: trailingStart,
      to: todayIso,
    }
  }

  return {
    from: normalizedCursor < trailingStart ? normalizedCursor : trailingStart,
    to: todayIso,
  }
}

export function buildConnectorWindow(
  baseWindow: DateWindow,
  connectorCursorIso: string
): DateWindow {
  const normalizedCursor = normalizeDate(connectorCursorIso)

  if (!normalizedCursor) {
    return baseWindow
  }

  return {
    from: normalizedCursor < baseWindow.from ? normalizedCursor : baseWindow.from,
    to: baseWindow.to,
  }
}

export function parseDirtyDates(value: string) {
  const normalized = value
    .split(",")
    .map((entry) => normalizeDate(entry))
    .filter(Boolean)

  return [...new Set(normalized)].sort()
}
