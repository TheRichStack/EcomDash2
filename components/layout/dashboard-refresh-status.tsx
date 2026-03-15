"use client"

import { useEffect, useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useDashboardState } from "@/hooks/use-dashboard-state"
import { cn } from "@/lib/utils"
import type { DashboardRefreshStatusData } from "@/types/backend"

const STATUS_POLL_INTERVAL_MS = 60_000

type DashboardRefreshStatusProps = {
  className?: string
}

function parseTimestamp(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim()

  if (!trimmed) {
    return null
  }

  const numericValue = Number(trimmed)

  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue
  }

  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00.000Z`)
    : new Date(trimmed)
  const timestamp = candidate.getTime()

  return Number.isFinite(timestamp) ? timestamp : null
}

function formatElapsedLabel(input: { nowMs: number; timestampMs: number | null }) {
  if (input.timestampMs === null) {
    return "unknown"
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((input.nowMs - input.timestampMs) / 1000)
  )

  if (elapsedSeconds < 5) {
    return "just now"
  }

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60)

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  const remainingMinutes = elapsedMinutes % 60

  if (elapsedHours < 24) {
    return remainingMinutes > 0
      ? `${elapsedHours}h ${remainingMinutes}m ago`
      : `${elapsedHours}h ago`
  }

  const elapsedDays = Math.floor(elapsedHours / 24)
  const remainingHours = elapsedHours % 24

  return remainingHours > 0
    ? `${elapsedDays}d ${remainingHours}h ago`
    : `${elapsedDays}d ago`
}

function formatDurationLabel(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))

  if (totalSeconds < 60) {
    return "<1m"
  }

  const totalMinutes = Math.floor(totalSeconds / 60)

  if (totalMinutes < 60) {
    return `${totalMinutes}m`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }

  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24

  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

function getMsUntilNextHourlyBoundary(nowMs: number) {
  const nextBoundary = new Date(nowMs)
  nextBoundary.setMinutes(0, 0, 0)
  nextBoundary.setHours(nextBoundary.getHours() + 1)

  return Math.max(0, nextBoundary.getTime() - nowMs)
}

export function DashboardRefreshStatus({
  className,
}: DashboardRefreshStatusProps) {
  const { requestContext, setState } = useDashboardState()
  const [nowMs, setNowMs] = useState<number | null>(null)
  const [loadedAtMs, setLoadedAtMs] = useState<number | null>(null)
  const [refreshStatus, setRefreshStatus] = useState<DashboardRefreshStatusData | null>(
    null
  )
  const queryLoadedAtMs = useMemo(
    () => parseTimestamp(requestContext.loadedAt ?? requestContext.refresh),
    [requestContext.loadedAt, requestContext.refresh]
  )

  useEffect(() => {
    const animationFrameId = window.requestAnimationFrame(() => {
      const initialNow = Date.now()
      setNowMs(initialNow)
      setLoadedAtMs((current) => current ?? initialNow)
    })

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadRefreshStatus = async () => {
      try {
        const response = await fetch(
          `/api/dashboard/refresh-status?workspace=${encodeURIComponent(
            requestContext.workspaceId
          )}`,
          {
            cache: "no-store",
          }
        )
        const payload =
          ((await response.json()) as DashboardRefreshStatusData) ?? null

        if (!cancelled && payload) {
          setRefreshStatus(payload)
        }
      } catch {
        if (!cancelled) {
          setRefreshStatus((current) => current)
        }
      }
    }

    void loadRefreshStatus()

    const intervalId = window.setInterval(() => {
      void loadRefreshStatus()
    }, STATUS_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [requestContext.workspaceId])

  const dataLoadedLabel = useMemo(
    () => {
      if (nowMs === null) {
        return "Loaded recently"
      }

      return `Loaded ${formatElapsedLabel({
        nowMs,
        timestampMs: queryLoadedAtMs ?? loadedAtMs,
      })}`
    },
    [loadedAtMs, nowMs, queryLoadedAtMs]
  )
  const nextUpdateLabel = useMemo(
    () =>
      nowMs === null
        ? "Hourly refresh scheduled"
        : `Next refresh in ${formatDurationLabel(
            getMsUntilNextHourlyBoundary(nowMs)
          )}`,
    [nowMs]
  )
  const lastSyncLabel = useMemo(() => {
    const lastSyncAtMs = parseTimestamp(refreshStatus?.lastSuccessfulHourlySyncAt)

    if (lastSyncAtMs === null) {
      return "Sync status unavailable"
    }

    if (nowMs === null) {
      return "Last sync recorded"
    }

    return `Last sync ${formatElapsedLabel({
      nowMs,
      timestampMs: lastSyncAtMs,
    })}`
  }, [nowMs, refreshStatus?.lastSuccessfulHourlySyncAt])

  const handleRefreshData = () => {
    const timestampMs = Date.now()
    const timestamp = String(timestampMs)

    setNowMs(timestampMs)
    setLoadedAtMs(timestampMs)

    setState({
      refresh: timestamp,
      loadedAt: timestamp,
    })
  }

  return (
    <div className={cn(
      "flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border bg-muted/10 px-3 py-2 text-xs text-muted-foreground xl:shrink-0",
      className
    )}>
      <span className="shrink-0 font-medium text-foreground/80">
        {dataLoadedLabel}
      </span>
      <Separator orientation="vertical" className="hidden h-3 shrink-0 sm:block" />
      <span className="shrink-0">{nextUpdateLabel}</span>
      <Separator orientation="vertical" className="hidden h-3 shrink-0 sm:block" />
      <span className="shrink-0">{lastSyncLabel}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleRefreshData}
        className="h-8 shrink-0 rounded-lg px-2.5 text-xs sm:ml-1"
      >
        <RefreshCw className="size-3.5" />
        Refresh data
      </Button>
    </div>
  )
}
