import type { ReactNode } from "react"
import Image from "next/image"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type EmptyStateProps = {
  title: string
  description: string
  action?: ReactNode
  imageSrc?: string
  imageAlt?: string
}

export function EmptyState({
  title,
  description,
  action,
  imageSrc = "/empty-state.svg",
  imageAlt = "Empty state illustration",
}: EmptyStateProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
          <div className="flex size-16 items-center justify-center rounded-xl border bg-background">
            <Image src={imageSrc} alt={imageAlt} width={48} height={48} />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-sm font-medium">Nothing here yet</p>
            <p className="text-sm text-muted-foreground">
              Keep the surface structured so real data can drop in later.
            </p>
          </div>
        </div>
        {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
      </CardContent>
    </Card>
  )
}
