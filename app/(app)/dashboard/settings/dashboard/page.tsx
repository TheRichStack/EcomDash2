import Link from "next/link"

import { SectionHeader } from "@/components/shared/section-header"
import { Button } from "@/components/ui/button"
import { buildDashboardHref } from "@/lib/dashboard-state"
import { ROUTES } from "@/lib/constants"
import { ECOMDASH2_CONFIG_KEYS } from "@/lib/server/dashboard-settings"

import { loadSettingsPageData, type SettingsRoutePageProps } from "../settings-data"
import {
  formatSettingsDateTime,
  humanizeToken,
} from "../settings-utils"
import {
  saveOverviewKpiStripAction,
  saveShopifyProfitKpiStripAction,
} from "../settings-actions"
import { DashboardKpiStripEditor } from "./dashboard-kpi-strip-editor"

export default async function SettingsDashboardPage({
  searchParams,
}: SettingsRoutePageProps) {
  const data = await loadSettingsPageData(searchParams)
  const settings = data.dashboard.settings
  const runtimeMetricMap = new Map(
    data.metrics.runtimeRegistry.map((metric) => [metric.id, metric] as const)
  )
  const overviewMetricOptions = settings.overviewKpis.allowedMetricIds.map(
    (metricId) => ({
      id: metricId,
      label: runtimeMetricMap.get(metricId)?.label ?? humanizeToken(metricId),
      description:
        runtimeMetricMap.get(metricId)?.description ||
        "No description available.",
    })
  )
  const shopifyProfitMetricOptions =
    settings.shopifyProfitKpis.allowedMetricIds.map((metricId) => ({
      id: metricId,
      label: runtimeMetricMap.get(metricId)?.label ?? humanizeToken(metricId),
      description:
        runtimeMetricMap.get(metricId)?.description ||
        "No description available.",
    }))
  const overviewKpiSavedAt =
    settings.configEntries.find(
      (entry) => entry.settingKey === ECOMDASH2_CONFIG_KEYS.overviewKpiStrip
    )?.updatedAt ?? null
  const shopifyProfitKpiSavedAt =
    settings.configEntries.find(
      (entry) => entry.settingKey === ECOMDASH2_CONFIG_KEYS.shopifyProfitKpiStrip
    )?.updatedAt ?? null

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SectionHeader
        eyebrow="Dashboard"
        title="Workspace-wide dashboard defaults"
        description="Edit the locked KPI strips that later reporting routes will consume. Overview pacing stays owned by Inputs > Targets."
        action={
          <>
            <Button asChild size="sm" variant="outline">
              <Link href={buildDashboardHref(ROUTES.settingsMetrics, data.context)}>
                Metrics catalog
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link
                href={buildDashboardHref(ROUTES.settingsInputsTargets, data.context)}
              >
                Configure pacing
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <DashboardKpiStripEditor
          key={`${data.context.workspaceId}:${settings.overviewKpis.selectedMetricIds.join("|")}`}
          title="Overview KPI strip"
          description="Configure the six locked Overview KPI slots with canonical metric ids only. Order is stored exactly as the slot rows appear."
          workspaceId={data.context.workspaceId}
          currentMetricIds={settings.overviewKpis.selectedMetricIds}
          defaultMetricIds={settings.overviewKpis.defaultMetricIds}
          metricOptions={overviewMetricOptions}
          savedAtLabel={
            overviewKpiSavedAt ? formatSettingsDateTime(overviewKpiSavedAt) : null
          }
          saveLabel="Save Overview strip"
          successMessage="Saved overview KPI strip."
          saveAction={saveOverviewKpiStripAction}
        />

        <DashboardKpiStripEditor
          key={`${data.context.workspaceId}:${settings.shopifyProfitKpis.selectedMetricIds.join("|")}`}
          title="Shopify Profit KPI strip"
          description="Configure the five locked Shopify Profit KPI slots without introducing a freeform metrics console. The saved order is workspace-wide."
          workspaceId={data.context.workspaceId}
          currentMetricIds={settings.shopifyProfitKpis.selectedMetricIds}
          defaultMetricIds={settings.shopifyProfitKpis.defaultMetricIds}
          metricOptions={shopifyProfitMetricOptions}
          savedAtLabel={
            shopifyProfitKpiSavedAt
              ? formatSettingsDateTime(shopifyProfitKpiSavedAt)
              : null
          }
          saveLabel="Save Shopify Profit strip"
          successMessage="Saved Shopify Profit KPI strip."
          saveAction={saveShopifyProfitKpiStripAction}
        />

        <section className="flex flex-col gap-4 rounded-xl border bg-muted/10 p-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              Related setup routes
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Overview pacing setup stays under Inputs &gt; Targets. Costs and the
              canonical metrics catalog remain one click away because later
              reporting slices depend on them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link
                href={buildDashboardHref(ROUTES.settingsInputsTargets, data.context)}
              >
                Inputs - Targets
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link
                href={buildDashboardHref(ROUTES.settingsInputsCosts, data.context)}
              >
                Inputs - Costs
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={buildDashboardHref(ROUTES.settingsMetrics, data.context)}>
                Metrics
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
