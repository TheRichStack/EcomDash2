import Link from "next/link"
import {
  ArrowRightIcon,
  ChartNoAxesColumnIcon,
  GaugeIcon,
  RefreshCcwIcon,
  WalletCardsIcon,
} from "lucide-react"

import { SectionHeader } from "@/components/shared/section-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { buildDashboardHref } from "@/lib/dashboard-state"
import { ROUTES } from "@/lib/constants"

import { loadSettingsPageData, type SettingsRoutePageProps } from "./settings-data"
import {
  buildMetricLabelMap,
  formatMetricLabelList,
  formatMonthLabel,
  formatRelativeTime,
  formatSettingsDateTime,
  formatSettingsNumber,
  summarizeBudgetMonths,
  summarizeOperations,
  summarizeSkuCosts,
  summarizeSyncSources,
} from "./settings-utils"

export default async function SettingsPage({
  searchParams,
}: SettingsRoutePageProps) {
  const data = await loadSettingsPageData(searchParams)
  const settings = data.dashboard.settings
  const syncSources = summarizeSyncSources(data.workspace.syncState)
  const recentOperations = summarizeOperations(
    data.workspace.recentJobRuns,
    data.workspace.recentBackfillRuns
  )
  const budgetMonths = summarizeBudgetMonths(data.inputs.budgetPlanMonthly)
  const skuCoverage = summarizeSkuCosts(data.inputs.skuCosts)
  const labelMap = buildMetricLabelMap(
    data.metrics.runtimeRegistry,
    data.metrics.catalogSource.entries
  )
  const workspaceHref = buildDashboardHref(ROUTES.settingsWorkspace, data.context)
  const dashboardHref = buildDashboardHref(ROUTES.settingsDashboard, data.context)
  const targetsHref = buildDashboardHref(
    ROUTES.settingsInputsTargets,
    data.context
  )
  const metricsHref = buildDashboardHref(ROUTES.settingsMetrics, data.context)
  const syncsHref = buildDashboardHref(ROUTES.settingsSyncs, data.context)
  const costsHref = buildDashboardHref(ROUTES.settingsInputsCosts, data.context)
  const budgetsHref = buildDashboardHref(
    ROUTES.settingsInputsBudgets,
    data.context
  )
  const latestBudgetMonth = budgetMonths[budgetMonths.length - 1] ?? null
  const latestSyncSource = syncSources[0] ?? null
  const latestOperation = recentOperations[0] ?? null
  const configuredTokens = data.workspace.tokens.filter((token) => token.hasValue)
  const catalogReady = data.metrics.catalogSource.status === "ready"

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SectionHeader
        eyebrow="Settings read surfaces"
        title="Settings"
        description="One calm landing route for workspace connectivity, dashboard defaults, business inputs, the metrics catalog, and sync visibility. This slice stays read-only until the dedicated settings form patterns are defined."
        action={
          <>
            <Button asChild size="sm">
              <Link href={workspaceHref}>
                Open workspace
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={targetsHref}>Review targets</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <WalletCardsIcon className="size-4 text-muted-foreground" />
              <CardTitle>Workspace</CardTitle>
            </div>
            <CardDescription>
              Token presence, connector freshness, and recent operational
              visibility.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Tokens ready
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  {configuredTokens.length}/{data.workspace.tokens.length}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Reporting connectors with a stored token.
                </p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Sources tracked
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  {formatSettingsNumber(syncSources.length)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {latestSyncSource
                    ? `Latest update ${formatRelativeTime(latestSyncSource.updatedAt)}.`
                    : "No connector state reported yet."}
                </p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Recent runs
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  {formatSettingsNumber(recentOperations.length)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {latestOperation
                    ? `${latestOperation.type} ${formatRelativeTime(latestOperation.startedAt)}.`
                    : "No recent jobs or backfills found."}
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={workspaceHref}>Workspace details</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={syncsHref}>Sync reporting</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <GaugeIcon className="size-4 text-muted-foreground" />
              <CardTitle>Dashboard</CardTitle>
            </div>
            <CardDescription>
              Workspace-wide KPI and pacing selections kept close to the routes
              they depend on.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Overview KPI strip
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  {settings.overviewKpis.selectedMetricIds.length}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {formatMetricLabelList(
                    settings.overviewKpis.selectedMetricIds,
                    labelMap
                  ).map((label) => (
                    <Badge key={label} variant="outline">
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Overview pacing rows
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  {settings.overviewPacing.selectedMetricIds.length}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {formatMetricLabelList(
                    settings.overviewPacing.selectedMetricIds,
                    labelMap
                  ).map((label) => (
                    <Badge key={label} variant="outline">
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Currency defaults to {settings.currency}. Shopify Profit keeps{" "}
              {settings.shopifyProfitKpis.selectedMetricIds.length} KPI slots
              under the same workspace-owned config surface.
            </p>
          </CardContent>
          <CardFooter className="gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={dashboardHref}>Dashboard settings</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={targetsHref}>Pacing setup</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Inputs</CardTitle>
          <CardDescription>
            Costs, budgets, and targets stay grouped under Settings, but each
            route keeps its own read surface and deeper setup entry point.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Costs
            </p>
            <p className="mt-2 text-lg font-semibold tracking-tight">
              {data.inputs.costSettings
                ? `${skuCoverage.overrideCount} SKU overrides live`
                : "Cost model not configured"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.inputs.costSettings
                ? `${skuCoverage.missingCostCount} rows still rely on the fallback cost model.`
                : "Default margin, fees, and overhead are still empty in this workspace."}
            </p>
            {data.inputs.costSettings ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Updated {formatSettingsDateTime(data.inputs.costSettings.updatedAt)}
              </p>
            ) : null}
            <div className="mt-4">
              <Button asChild size="sm" variant="outline">
                <Link href={costsHref}>View costs</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Budgets
            </p>
            <p className="mt-2 text-lg font-semibold tracking-tight">
              {latestBudgetMonth
                ? `${formatMonthLabel(latestBudgetMonth.month)} is the latest planned month`
                : "No monthly budget plan found"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {latestBudgetMonth
                ? `${latestBudgetMonth.channelCount} channels are covered across ${budgetMonths.length} planned months.`
                : "Channel budgets have not been loaded into the app-owned settings slice yet."}
            </p>
            <div className="mt-4">
              <Button asChild size="sm" variant="outline">
                <Link href={budgetsHref}>View budgets</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Targets
            </p>
            <p className="mt-2 text-lg font-semibold tracking-tight">
              {data.inputs.targetCanonicalRanges.length > 0
                ? `${data.inputs.targetCanonicalRanges.length} target ranges configured`
                : "No canonical target ranges configured"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.inputs.targetEffectiveDaily.length > 0
                ? `${data.inputs.targetEffectiveDaily.length} daily target rows back the pacing board.`
                : "Daily target coverage has not been materialized yet."}
            </p>
            <div className="mt-4">
              <Button asChild size="sm" variant="outline">
                <Link href={targetsHref}>View targets</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ChartNoAxesColumnIcon className="size-4 text-muted-foreground" />
              <CardTitle>Metrics</CardTitle>
            </div>
            <CardDescription>
              The full catalog stays read-only. The runtime registry only
              reflects the first slice currently backing dashboard pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={catalogReady ? "secondary" : "destructive"}>
                {catalogReady ? "Full catalog ready" : "Full catalog unavailable"}
              </Badge>
              <Badge variant="outline">
                Runtime registry {data.metrics.runtimeRegistry.length}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {catalogReady
                ? `${formatSettingsNumber(data.metrics.catalogSource.entries.length)} canonical catalog entries are available for read-only review.`
                : data.metrics.catalogSource.message ||
                  "The canonical catalog bootstrap is not available right now."}
            </p>
          </CardContent>
          <CardFooter className="gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={metricsHref}>Metrics catalog</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <RefreshCcwIcon className="size-4 text-muted-foreground" />
              <CardTitle>Syncs</CardTitle>
            </div>
            <CardDescription>
              Lightweight freshness and run history for the connectors that feed
              reporting.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {latestSyncSource
                ? `${latestSyncSource.sourceKey} was updated ${formatRelativeTime(latestSyncSource.updatedAt)} and ${recentOperations.length} recent operations are available in the slice.`
                : "No connector freshness has been reported yet."}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {syncSources.slice(0, 3).map((source) => (
                <Badge key={source.sourceKey} variant="outline">
                  {source.sourceKey}
                </Badge>
              ))}
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={syncsHref}>Sync visibility</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
