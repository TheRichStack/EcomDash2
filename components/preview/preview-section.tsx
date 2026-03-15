import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"

type PreviewSectionProps = {
  id: string
  title: string
  description: string
  components: string[]
  children: ReactNode
}

export function PreviewSection({
  id,
  title,
  description,
  components,
  children,
}: PreviewSectionProps) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {components.map((component) => (
            <Badge key={component} variant="outline">
              {component}
            </Badge>
          ))}
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">{children}</div>
    </section>
  )
}
