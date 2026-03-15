"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import {
  ArrowRightIcon,
  FolderKanbanIcon,
  LayoutPanelTopIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react"

import { PreviewSection } from "@/components/preview/preview-section"
import { PreviewTitle } from "@/components/preview/preview-title"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionHeader } from "@/components/shared/section-header"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
} from "recharts"

const metricCards = [
  {
    label: "Revenue",
    value: "£42,800",
    delta: "+8.4%",
    note: "vs previous period",
  },
  {
    label: "Ad Spend",
    value: "£11,600",
    delta: "-2.1%",
    note: "Target-aware format",
  },
  {
    label: "MER",
    value: "3.68x",
    delta: "+0.2x",
    note: "Blended efficiency",
  },
  {
    label: "Orders",
    value: "1,482",
    delta: "+6.7%",
    note: "All channels",
  },
  {
    label: "AOV",
    value: "£29",
    delta: "+1.4%",
    note: "Store-wide",
  },
  {
    label: "Net Profit",
    value: "£9,200",
    delta: "+11.3%",
    note: "After costs",
  },
]

const campaignRows = [
  {
    name: "Meta | Broad | Video",
    spend: "£1,824",
    purchases: "318",
    revenue: "£6,182",
    status: "Stable",
  },
  {
    name: "Meta | UGC | Prospecting",
    spend: "£1,202",
    purchases: "177",
    revenue: "£3,996",
    status: "Watch",
  },
  {
    name: "Google | Brand Search",
    spend: "£814",
    purchases: "140",
    revenue: "£3,122",
    status: "Healthy",
  },
]

const channelMixData = [
  { month: "Jan", desktop: 1224, mobile: 860 },
  { month: "Feb", desktop: 1388, mobile: 904 },
  { month: "Mar", desktop: 1162, mobile: 832 },
  { month: "Apr", desktop: 1292, mobile: 918 },
  { month: "May", desktop: 1248, mobile: 876 },
  { month: "Jun", desktop: 1316, mobile: 902 },
]

const visitorsData = [
  { month: "Jan", visitors: 18200, previous: 17100 },
  { month: "Feb", visitors: 19600, previous: 18000 },
  { month: "Mar", visitors: 18840, previous: 18220 },
  { month: "Apr", visitors: 20410, previous: 18920 },
  { month: "May", visitors: 21230, previous: 19870 },
  { month: "Jun", visitors: 22640, previous: 20600 },
]

const emailPerformanceData = [
  { month: "Jan", openRate: 38, clickRate: 7.2 },
  { month: "Feb", openRate: 41, clickRate: 8.1 },
  { month: "Mar", openRate: 39, clickRate: 7.8 },
  { month: "Apr", openRate: 42, clickRate: 8.4 },
  { month: "May", openRate: 44, clickRate: 9.1 },
  { month: "Jun", openRate: 43, clickRate: 8.9 },
]

const revenueVsSpendData = [
  { month: "Jan", revenue: 36800, spend: 10100 },
  { month: "Feb", revenue: 41200, spend: 10900 },
  { month: "Mar", revenue: 38900, spend: 10300 },
  { month: "Apr", revenue: 43100, spend: 11200 },
  { month: "May", revenue: 44600, spend: 11600 },
  { month: "Jun", revenue: 46200, spend: 12100 },
]

const channelMixConfig = {
  desktop: { label: "Desktop", color: "var(--color-chart-1)" },
  mobile: { label: "Mobile", color: "var(--color-chart-2)" },
} satisfies ChartConfig

const visitorsConfig = {
  visitors: { label: "Visitors", color: "var(--color-chart-2)" },
  previous: { label: "Previous", color: "var(--color-chart-5)" },
} satisfies ChartConfig

const emailConfig = {
  openRate: { label: "Open rate", color: "var(--color-chart-1)" },
  clickRate: { label: "Click rate", color: "var(--color-chart-3)" },
} satisfies ChartConfig

const revenueVsSpendConfig = {
  revenue: { label: "Revenue", color: "var(--color-chart-2)" },
  spend: { label: "Spend", color: "var(--color-chart-4)" },
} satisfies ChartConfig

export default function DashboardPatternsPreviewPage() {
  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
        <SectionHeader
          eyebrow="EcomDash2 reference route"
          title="Dashboard pattern preview"
          description="The visual source of truth for approved EcomDash2 dashboard compositions. Workers should copy patterns from here before inventing new wrappers."
          action={
            <>
              <Button asChild variant="outline">
                <Link href="/preview/components">
                  <LayoutPanelTopIcon data-icon="inline-start" />
                  Starter preview
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard">
                  <FolderKanbanIcon data-icon="inline-start" />
                  Dashboard
                </Link>
              </Button>
              <ThemeToggle />
            </>
          }
        />

        <Card>
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Canonical</Badge>
              <Badge variant="outline">Preview only</Badge>
            </div>
            <CardTitle>How to use this route</CardTitle>
            <CardDescription>
              Use these examples as the approved baseline for KPI cards,
              chart shells, toolbars, table shells, detail sheets, loading
              states, and empty states. If a page needs something genuinely
              different, the work order should explain why.
            </CardDescription>
          </CardHeader>
        </Card>

        <PreviewSection
          id="page-structure"
          title="Page structure"
          description="Page headers should stay compact and action-ready. Section stacks should feel calm and consistent without introducing extra wrapper systems."
          components={["SectionHeader", "Card", "Separator"]}
        >
          <PatternCard
            title="Page header"
            description="Use one strong title, short supporting copy, and a small action cluster."
            footer="Keep this inline until the same header shape is clearly reused."
          >
            <div className="flex flex-col gap-4 rounded-xl border bg-muted/25 p-5">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Overview
                </p>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Daily performance
                </h2>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Revenue, pacing, and channel performance for the selected
                  range.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm">Change range</Button>
                <Button size="sm" variant="outline">
                  Export
                </Button>
              </div>
            </div>
          </PatternCard>

          <PatternCard
            title="Section stack"
            description="Pages should use one calm vertical rhythm instead of inventing page-specific layout systems."
            footer="Use `flex flex-col gap-*` plus `Separator` when a visual break is needed."
          >
            <div className="flex flex-col gap-4 rounded-xl border bg-muted/15 p-4">
              <StackRow
                title="Pacing board"
                description="Compact, high-priority operational signal."
              />
              <Separator />
              <StackRow
                title="Period snapshot"
                description="Short-period context without turning into a second dashboard."
              />
              <Separator />
              <StackRow
                title="Trend and table"
                description="Heavier analysis below the fast-scan summary layer."
              />
            </div>
          </PatternCard>

          <PatternCard
            title="Date and period controls"
            description="Use one compact date-control rhythm for dashboards and tables."
            footer="Keep date controls concise and reusable. Do not invent page-specific filter bars for date logic."
          >
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline">
                Today
              </Button>
              <Button size="sm" variant="outline">
                Last 7 Days
              </Button>
              <Button size="sm" variant="outline">
                Last 30 Days
              </Button>
              <Button size="sm">Custom</Button>
            </div>
            <div className="rounded-xl border bg-muted/15 p-3">
              <Calendar
                mode="single"
                selected={new Date(2026, 2, 9)}
                className="mx-auto"
              />
            </div>
          </PatternCard>
        </PreviewSection>

        <PreviewSection
          id="metrics"
          title="Metric surfaces"
          description="Use one KPI-card language across the app. The strip layout stays page-owned, but the card rhythm should stay consistent."
          components={["Card", "Badge", "Separator"]}
        >
          <PatternCard
            title="KPI strip"
            description="Use a responsive grid with compact cards and restrained secondary context."
            footer="Do not create alternate KPI-card families page by page."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {metricCards.map((metric) => (
                <MetricPreviewCard key={metric.label} {...metric} />
              ))}
            </div>
          </PatternCard>

          <PatternCard
            title="Single KPI card"
            description="One primary number, one comparison, one small supporting note."
            footer="Use badges sparingly. The number should remain the dominant visual."
          >
            <div className="max-w-sm">
              <MetricPreviewCard
                label="Contribution Margin"
                value="£13,400"
                delta="+9.2%"
                note="After COGS, before overhead"
                featured
              />
            </div>
          </PatternCard>
        </PreviewSection>

        <PreviewSection
          id="data-surfaces"
          title="Chart and table shells"
          description="Most dashboard pages should converge on one chart-card shell and one table-shell rhythm instead of inventing their own framing."
          components={["Card", "Tabs", "Input", "Select", "Table"]}
        >
          <PatternCard
            title="Chart card shell"
            description="Header, metric toggle, compact context, and an inline chart body that stays page-specific."
            footer="Use one shell. Keep the chart body inline until multiple pages share the same data contract."
          >
            <div className="flex flex-col gap-4 rounded-xl border bg-muted/10 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Daily trend
                  </p>
                  <h3 className="text-lg font-semibold tracking-tight">
                    Revenue vs prior period
                  </h3>
                </div>
                <Tabs defaultValue="revenue">
                  <TabsList>
                    <TabsTrigger value="revenue">Revenue</TabsTrigger>
                    <TabsTrigger value="spend">Spend</TabsTrigger>
                    <TabsTrigger value="profit">Net Profit</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="chart-surface p-0">
                <div className="p-4">
                  <Skeleton className="h-48 w-full rounded-lg" />
                </div>
                <div className="grid grid-cols-3 border-t bg-muted/25">
                  <div className="px-4 py-3">
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Current
                    </p>
                    <p className="mt-1 text-base font-semibold tracking-tight">
                      £42,800
                    </p>
                  </div>
                  <div className="border-x px-4 py-3">
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Previous
                    </p>
                    <p className="mt-1 text-base font-semibold tracking-tight">
                      £39,500
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Delta
                    </p>
                    <p className="mt-1 text-base font-semibold tracking-tight">
                      +8.4%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </PatternCard>

          <PatternCard
            title="Mock chart gallery"
            description="Use this as a quick reference for chart variety while keeping one visual system."
            footer="Prefer a small set of chart styles reused consistently. Avoid page-specific chart inventions."
          >
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="chart-surface p-0">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-medium">Traffic channels</p>
                  <p className="text-xs text-muted-foreground">
                    Desktop vs mobile trend
                  </p>
                </div>
                <div className="p-3">
                  <ChartContainer
                    className="h-44 w-full"
                    config={channelMixConfig}
                  >
                    <BarChart
                      accessibilityLayer
                      data={channelMixData}
                      margin={{ top: 8, right: 8, left: 8 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar
                        dataKey="desktop"
                        fill="var(--color-desktop)"
                        radius={4}
                      />
                      <Bar
                        dataKey="mobile"
                        fill="var(--color-mobile)"
                        radius={4}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
                <div className="grid grid-cols-3 border-t bg-muted/25">
                  <div className="px-4 py-3">
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Desktop
                    </p>
                    <p className="mt-1 text-base font-semibold tracking-tight">
                      1,224
                    </p>
                  </div>
                  <div className="border-x px-4 py-3">
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Mobile
                    </p>
                    <p className="mt-1 text-base font-semibold tracking-tight">
                      860
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Mix delta
                    </p>
                    <p className="mt-1 text-base font-semibold tracking-tight">
                      +42%
                    </p>
                  </div>
                </div>
              </div>

              <div className="chart-surface p-0">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-medium">Visitors trend</p>
                  <p className="text-xs text-muted-foreground">
                    Current vs previous period
                  </p>
                </div>
                <div className="p-3">
                  <ChartContainer className="h-44 w-full" config={visitorsConfig}>
                    <AreaChart
                      accessibilityLayer
                      data={visitorsData}
                      margin={{ top: 8, right: 8, left: 8 }}
                    >
                      <defs>
                        <linearGradient id="fillVisitors" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-visitors)" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="var(--color-visitors)" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        type="natural"
                        dataKey="previous"
                        fill="var(--color-previous)"
                        fillOpacity={0.08}
                        stroke="var(--color-previous)"
                        strokeWidth={2}
                      />
                      <Area
                        type="natural"
                        dataKey="visitors"
                        fill="url(#fillVisitors)"
                        stroke="var(--color-visitors)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ChartContainer>
                </div>
              </div>

              <div className="chart-surface p-0">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-medium">Email quality</p>
                  <p className="text-xs text-muted-foreground">
                    Open rate vs click rate
                  </p>
                </div>
                <div className="p-3">
                  <ChartContainer className="h-44 w-full" config={emailConfig}>
                    <LineChart
                      accessibilityLayer
                      data={emailPerformanceData}
                      margin={{ top: 8, right: 8, left: 8 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Line
                        type="monotone"
                        dataKey="openRate"
                        stroke="var(--color-openRate)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="clickRate"
                        stroke="var(--color-clickRate)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ChartContainer>
                </div>
              </div>

              <div className="chart-surface p-0">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-medium">Revenue vs spend</p>
                  <p className="text-xs text-muted-foreground">
                    Parallel movement view
                  </p>
                </div>
                <div className="p-3">
                  <ChartContainer
                    className="h-44 w-full"
                    config={revenueVsSpendConfig}
                  >
                    <LineChart
                      accessibilityLayer
                      data={revenueVsSpendData}
                      margin={{ top: 8, right: 8, left: 8 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="var(--color-revenue)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="spend"
                        stroke="var(--color-spend)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ChartContainer>
                </div>
              </div>
            </div>
          </PatternCard>

          <PatternCard
            title="Table shell and filter toolbar"
            description="Toolbars should feel structurally consistent across campaign, product, inventory, and email tables."
            footer="Prefer one toolbar rhythm. Do not build domain-specific table frameworks."
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="relative min-w-0 flex-1">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search campaign, product, or entity"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Select defaultValue="anomaly">
                      <SelectTrigger className="w-[170px]">
                        <SelectValue placeholder="Sort" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="anomaly">Anomaly first</SelectItem>
                          <SelectItem value="revenue">Revenue</SelectItem>
                          <SelectItem value="profit">Profit</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Select defaultValue="all">
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">Status: All</SelectItem>
                          <SelectItem value="healthy">Healthy</SelectItem>
                          <SelectItem value="watch">Watch</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" className="shrink-0">
                      <SlidersHorizontalIcon data-icon="inline-start" />
                      Columns
                    </Button>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border bg-background">
                <Table className="min-w-[680px] table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Campaign</TableHead>
                      <TableHead className="w-[15%] text-right">Spend</TableHead>
                      <TableHead className="w-[15%] text-right">Purchases</TableHead>
                      <TableHead className="w-[15%] text-right">Revenue</TableHead>
                      <TableHead className="w-[15%] text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaignRows.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="truncate font-medium">
                          {row.name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.spend}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.purchases}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.revenue}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{row.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </PatternCard>
        </PreviewSection>

        <PreviewSection
          id="secondary"
          title="Secondary states and drilldowns"
          description="Use one detail-sheet pattern for drilldown, one empty-state style, and skeleton-based loading placeholders."
          components={["Sheet", "Empty State", "Skeleton"]}
        >
          <PatternCard
            title="Detail sheet"
            description="Use the same sheet rhythm for entity drilldown across email, paid media, and other secondary surfaces."
            footer="A new side-panel system should not be introduced elsewhere."
          >
            <div className="rounded-xl border bg-muted/10 p-4">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Selected entity</p>
                <p className="text-sm text-muted-foreground">
                  Use a sheet for deeper context instead of expanding complex
                  markup inline.
                </p>
              </div>
              <div className="mt-4">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button>Open detail sheet</Button>
                  </SheetTrigger>
                  <SheetContent className="flex flex-col gap-6">
                    <SheetHeader>
                      <SheetTitle>Campaign detail</SheetTitle>
                      <SheetDescription>
                        A compact right-side drilldown with the same basic
                        structure across pages.
                      </SheetDescription>
                    </SheetHeader>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SummaryPill label="Spend" value="£1,824" />
                      <SummaryPill label="Revenue" value="£6,182" />
                      <SummaryPill label="ROAS" value="3.39x" />
                      <SummaryPill label="CPA" value="£6" />
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-sm font-medium">Context</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Keep the sheet focused on summary facts, short trend
                        context, and a small set of secondary details.
                      </p>
                    </div>
                    <SheetFooter>
                      <Button variant="outline">Close</Button>
                    </SheetFooter>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </PatternCard>

          <PatternCard
            title="Empty state"
            description="Use one empty-state language instead of page-specific placeholders."
            footer="If the existing empty-state component fits, use it."
          >
            <EmptyState
              title="No matching rows"
              description="Filters or workspace setup can temporarily leave a page empty. Keep the empty state structured and calm."
              action={
                <Button variant="outline">
                  <ArrowRightIcon data-icon="inline-start" />
                  Clear filters
                </Button>
              }
            />
          </PatternCard>

          <PatternCard
            title="Loading state"
            description="Use skeletons that match the target layout instead of inventing custom loaders."
            footer="Loading shells should mirror the eventual card and table structure."
          >
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={`metric-skeleton-${index}`}
                    className="chart-surface"
                  >
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="mt-4 h-8 w-28" />
                    <Skeleton className="mt-5 h-4 w-20" />
                  </div>
                ))}
              </div>
              <div className="chart-surface">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="mt-4 h-40 w-full rounded-lg" />
              </div>
            </div>
          </PatternCard>
        </PreviewSection>
      </div>
    </div>
  )
}

type PatternCardProps = {
  title: string
  description: string
  children: ReactNode
  footer: string
}

function PatternCard({
  title,
  description,
  children,
  footer,
}: PatternCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2">
        <PreviewTitle title={title} description={description} />
      </div>
      <div className="flex flex-col gap-4">{children}</div>
      <p className="text-sm text-muted-foreground">
        {footer}
      </p>
    </div>
  )
}

type MetricPreviewCardProps = {
  label: string
  value: string
  delta: string
  note: string
  featured?: boolean
}

function MetricPreviewCard({
  label,
  value,
  delta,
  note,
  featured = false,
}: MetricPreviewCardProps) {
  return (
    <Card
      size="sm"
      className={
        featured ? "border-primary/30 bg-primary/5 data-[size=sm]:gap-2" : "data-[size=sm]:gap-2"
      }
    >
      <CardHeader className="gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardDescription className="text-xs">{label}</CardDescription>
            <CardTitle className="text-5xl font-extrabold leading-none tracking-tight tabular-nums">
              {value}
            </CardTitle>
          </div>
          <Badge variant={featured ? "secondary" : "outline"}>{delta}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  )
}

type SummaryPillProps = {
  label: string
  value: string
  emphasized?: boolean
}

function SummaryPill({
  label,
  value,
  emphasized = false,
}: SummaryPillProps) {
  return (
    <div
      className={
        emphasized
          ? "rounded-xl border border-primary/30 bg-primary/5 p-3"
          : "rounded-xl border bg-background p-3"
      }
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  )
}

type StackRowProps = {
  title: string
  description: string
}

function StackRow({ title, description }: StackRowProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
