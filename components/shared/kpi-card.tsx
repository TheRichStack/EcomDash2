import type { ComponentProps, ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

type KpiCardProps = {
  label: ReactNode
  value: ReactNode
  note?: ReactNode
  badge?: {
    label: ReactNode
    variant?: ComponentProps<typeof Badge>["variant"]
    className?: string
  } | null
  className?: string
}

export function KpiCard({
  label,
  value,
  note,
  badge,
  className,
}: KpiCardProps) {
  return (
    <Card className={cn("h-full min-h-36 justify-between gap-2 py-3", className)}>
      <CardHeader className="gap-2 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <CardDescription className="min-w-0 text-xs font-medium leading-5">
              {label}
            </CardDescription>
            <CardTitle className="text-4xl font-extrabold leading-none tracking-tight tabular-nums sm:text-[2.35rem]">
              {value}
            </CardTitle>
          </div>
          {badge ? (
            <Badge
              variant={badge.variant ?? "outline"}
              className={cn("mt-0.5 shrink-0 self-start", badge.className)}
            >
              {badge.label}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      {note ? (
        <CardContent className="pt-0">
          <div className="flex flex-col gap-1 text-xs leading-5 text-muted-foreground">
            {typeof note === "string" ? <p>{note}</p> : note}
          </div>
        </CardContent>
      ) : null}
    </Card>
  )
}
