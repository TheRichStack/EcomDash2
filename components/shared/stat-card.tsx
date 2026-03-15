import type { ReactNode } from "react"
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type StatCardProps = {
  title: string
  value: string
  description?: string
  change?: string
  tone?: "positive" | "neutral" | "negative"
  icon?: ReactNode
}

const toneMap = {
  positive: {
    icon: ArrowUpIcon,
    variant: "secondary" as const,
  },
  neutral: {
    icon: MinusIcon,
    variant: "outline" as const,
  },
  negative: {
    icon: ArrowDownIcon,
    variant: "destructive" as const,
  },
}

export function StatCard({
  title,
  value,
  description,
  change,
  tone = "positive",
  icon,
}: StatCardProps) {
  const toneConfig = toneMap[tone]
  const TrendIcon = toneConfig.icon

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardDescription>{title}</CardDescription>
            <CardTitle className="text-2xl">{value}</CardTitle>
          </div>
          {icon ? <div className="text-muted-foreground">{icon}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
        {change ? (
          <Badge variant={toneConfig.variant} className="w-fit">
            <TrendIcon data-icon="inline-start" />
            {change}
          </Badge>
        ) : null}
      </CardContent>
    </Card>
  )
}
