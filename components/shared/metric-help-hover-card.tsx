"use client"

import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { ROUTES } from "@/lib/constants"
import { buildDashboardHref } from "@/lib/dashboard-state"
import { cn } from "@/lib/utils"
import type { DashboardStateFields } from "@/types/dashboard"
import type { MetricDefinition } from "@/types/metrics"

type MetricHelpHoverCardProps = {
  label: string
  metric: MetricDefinition | null
  dashboardState: DashboardStateFields
  className?: string
}

function humanizeMetricToken(value: string) {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getFormulaDetailText(metric: MetricDefinition) {
  const readableFormula = metric.formulaReadable.trim()

  if (readableFormula) {
    return readableFormula
  }

  return "Formula detail not available in the current metric definition."
}

export function MetricHelpHoverCard({
  label,
  metric,
  dashboardState,
  className,
}: MetricHelpHoverCardProps) {
  if (!metric) {
    return <span className={className}>{label}</span>
  }

  const settingsHref = buildDashboardHref(
    `${ROUTES.settingsMetrics}?metricId=${encodeURIComponent(metric.id)}`,
    dashboardState
  )
  const visibleSources = metric.sources.slice(0, 2)

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={`View formula help for ${label}`}
          className={cn(
            "inline-flex max-w-full cursor-help items-center rounded-sm bg-transparent p-0 text-left text-current underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            className
          )}
        >
          <span className="truncate">{label}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{metric.id}</Badge>
              <Badge variant={metric.isBase ? "secondary" : "outline"}>
                {metric.isBase ? "Base metric" : "Derived metric"}
              </Badge>
              {visibleSources.map((source) => (
                <Badge key={`${metric.id}-source-${source}`} variant="outline">
                  {humanizeMetricToken(source)}
                </Badge>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <p className="font-medium tracking-tight">{metric.label}</p>
              <p className="text-xs text-muted-foreground">{metric.description}</p>
            </div>
          </div>

          {metric.formulaTokens.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Formula
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {metric.formulaTokens.map((token, index) => {
                  if (token.type === "operator") {
                    return (
                      <span
                        key={`${metric.id}-operator-${index}`}
                        className="text-xs font-semibold text-muted-foreground"
                      >
                        {token.value}
                      </span>
                    )
                  }

                  return (
                    <Badge
                      key={`${metric.id}-token-${token.metricId}-${index}`}
                      variant="outline"
                    >
                      {humanizeMetricToken(token.metricId)}
                    </Badge>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border bg-muted/15 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {getFormulaDetailText(metric)}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              View full metric definition in Settings.
            </p>
            <Button asChild size="sm" variant="outline" className="w-full justify-between">
              <Link href={settingsHref}>
                Open in Settings
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
