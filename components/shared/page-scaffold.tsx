import { SectionHeader } from "@/components/shared/section-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type PageScaffoldProps = {
  title: string
  pageJob: string
  route: string
  modules: string[]
  modulesLabel?: string
  scopeNote?: string
}

export function PageScaffold({
  title,
  pageJob,
  route,
  modules,
  modulesLabel = "Planned modules",
  scopeNote = "Contract-first scaffold only. Data wiring and feature implementation are intentionally deferred.",
}: PageScaffoldProps) {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        eyebrow="EcomDash2 v1 scaffold"
        title={title}
        description={pageJob}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Route identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs sm:text-sm">
              {route}
            </p>
            <p className="text-sm text-muted-foreground">{scopeNote}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{modulesLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {modules.map((module) => (
                <li key={module} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1 text-xs">
                    -
                  </span>
                  <span>{module}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
