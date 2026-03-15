import Image from "next/image"
import Link from "next/link"
import {
  ArrowRightIcon,
  LayoutDashboardIcon,
  PanelsTopLeftIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react"

import { SectionHeader } from "@/components/shared/section-header"
import { StatCard } from "@/components/shared/stat-card"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { navItems } from "@/config/nav"
import { siteConfig } from "@/config/site"

const starterPrinciples = [
  {
    title: "Composition first",
    description:
      "Use shadcn primitives directly. Promote patterns into shared components only when reuse is real.",
  },
  {
    title: "Lean by default",
    description:
      "No auth, CMS, analytics, database clients, or state libraries in the base starter.",
  },
  {
    title: "Inspectable structure",
    description:
      "Keep files where people expect them so future Rich Stack projects start from clear boundaries.",
  },
]

export default function MarketingPage() {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo-mark.svg"
              alt={`${siteConfig.name} logo`}
              width={40}
              height={40}
              className="size-10"
            />
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{siteConfig.name}</span>
              <span className="text-xs text-muted-foreground">
                Reusable Rich Stack core
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => (
              <Button key={item.href} asChild variant="ghost" size="sm">
                <Link href={item.href}>{item.title}</Link>
              </Button>
            ))}
          </nav>

          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-12 md:py-16">
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-6">
            <Badge variant="secondary" className="w-fit">
              App Router + shadcn + TypeScript
            </Badge>

            <div className="flex flex-col gap-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                Next.js starter built for future Rich Stack apps.
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                Start with a neutral, inspectable foundation. Keep the repo
                small, compose from shadcn primitives, and preview bundled
                components before building feature-specific screens.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/dashboard">
                  <LayoutDashboardIcon data-icon="inline-start" />
                  Open dashboard
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/preview/components">
                  <PanelsTopLeftIcon data-icon="inline-start" />
                  Preview components
                </Link>
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                title="Bundled primitives"
                value="31"
                description="Installed from the shadcn CLI and ready to compose."
              />
              <StatCard
                title="Starter routes"
                value="3"
                description="Marketing, dashboard, and a full component preview page."
                tone="neutral"
              />
              <StatCard
                title="Theme model"
                value="CSS vars"
                description="Semantic tokens only, with light and dark mode support."
              />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Starter snapshot</CardTitle>
              <CardDescription>
                The repo is intentionally scoped to layout, UI primitives,
                preview coverage, and documentation.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <SparklesIcon className="mt-0.5 shrink-0 text-primary" />
                <div className="flex flex-col gap-1">
                  <p className="font-medium">Component preview included</p>
                  <p className="text-sm text-muted-foreground">
                    Inspect all bundled starter components at
                    <span className="mx-1 font-mono text-xs">
                      /preview/components
                    </span>
                    before shipping new UI.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-3">
                <ShieldCheckIcon className="mt-0.5 shrink-0 text-primary" />
                <div className="flex flex-col gap-1">
                  <p className="font-medium">Strict linting stays on</p>
                  <p className="text-sm text-muted-foreground">
                    Core Web Vitals ESLint rules are kept in place. No
                    ignore-during-build shortcuts.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Useful entry points</p>
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2"
                  >
                    Dashboard starter shell
                    <ArrowRightIcon className="size-4" />
                  </Link>
                  <Link
                    href="/preview/components"
                    className="inline-flex items-center gap-2"
                  >
                    Full starter preview
                    <ArrowRightIcon className="size-4" />
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeader
            eyebrow="Starter philosophy"
            title="Structure first, customization second."
            description="These defaults should feel reusable on day one and easy to evolve when a project earns more complexity."
          />

          <div className="grid gap-4 lg:grid-cols-3">
            {starterPrinciples.map((principle) => (
              <Card key={principle.title}>
                <CardHeader>
                  <CardTitle className="text-lg">{principle.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {principle.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
