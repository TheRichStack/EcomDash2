import "server-only"

import { env } from "@/lib/env"
import { executeStatement } from "@/lib/db/query"
import { ECOMDASH2_TARGETS_MONTHLY_PLAN_ENTRY_KEY } from "@/lib/settings/monthly-target-plan"
import { getMetricPool, isKnownMetricId } from "@/lib/metrics/registry"
import type {
  AppConfigEntry,
  AppTargetEntry,
  EcomDash2SettingsSnapshot,
  SliceMetricSelection,
} from "@/types/backend"
import type { EcomDashMetricId, MetricPoolId } from "@/types/metrics"

export const ECOMDASH2_CONFIG_PREFIX = "ecomdash2."
export const OVERVIEW_KPI_SLOT_COUNT = 6
export const SHOPIFY_PROFIT_KPI_SLOT_COUNT = 5
export const OVERVIEW_PACING_MAX_ROWS = 4

export const ECOMDASH2_CONFIG_KEYS = {
  overviewKpiStrip: "ecomdash2.dashboard.overview.kpi_strip",
  shopifyProfitKpiStrip: "ecomdash2.dashboard.shopify_profit.kpi_strip",
} as const

export const ECOMDASH2_TARGET_KEYS = {
  overviewPacingMetrics: "ecomdash2.targets.overview.pacing_metrics",
  monthlyPlan: ECOMDASH2_TARGETS_MONTHLY_PLAN_ENTRY_KEY,
} as const

const ECOMDASH2_SETTING_DESCRIPTIONS = {
  overviewKpiStrip:
    "EcomDash2 Overview KPI strip metric ids in saved slot order.",
  shopifyProfitKpiStrip:
    "EcomDash2 Shopify Profit KPI strip metric ids in saved slot order.",
  overviewPacingMetrics:
    "EcomDash2 Overview pacing metric ids in saved row order.",
} as const

type MetricSelectionRules = {
  exactCount?: number
  minimumCount?: number
  maximumCount?: number
}

function toSettingsMap(entries: Array<{ settingKey: string; settingValue: string }>) {
  return Object.fromEntries(
    entries.map((entry) => [entry.settingKey, entry.settingValue])
  )
}

function nowIsoTimestamp() {
  return new Date().toISOString()
}

function parseMetricSelection(rawValue: string): EcomDashMetricId[] {
  const text = String(rawValue ?? "").trim()

  if (!text) {
    return []
  }

  const candidates = (() => {
    try {
      const parsed = JSON.parse(text) as unknown

      if (Array.isArray(parsed)) {
        return parsed
      }

      if (parsed && typeof parsed === "object") {
        const source = parsed as Record<string, unknown>

        if (Array.isArray(source.metricIds)) {
          return source.metricIds
        }

        if (Array.isArray(source.selectedMetricIds)) {
          return source.selectedMetricIds
        }

        if (Array.isArray(source.enabledMetricIds)) {
          return source.enabledMetricIds
        }
      }
    } catch {
      return text.split(",")
    }

    return []
  })()

  const out: EcomDashMetricId[] = []
  const seen = new Set<EcomDashMetricId>()

  for (const candidate of candidates) {
    const metricId = String(candidate ?? "").trim()

    if (!isKnownMetricId(metricId) || seen.has(metricId)) {
      continue
    }

    seen.add(metricId)
    out.push(metricId)
  }

  return out
}

function isMetricSelectionValidLength(
  metricIds: readonly EcomDashMetricId[],
  rules?: MetricSelectionRules
) {
  if (!rules) {
    return metricIds.length > 0
  }

  if (
    Number.isFinite(rules.exactCount) &&
    metricIds.length !== Number(rules.exactCount)
  ) {
    return false
  }

  if (
    Number.isFinite(rules.minimumCount) &&
    metricIds.length < Number(rules.minimumCount)
  ) {
    return false
  }

  if (
    Number.isFinite(rules.maximumCount) &&
    metricIds.length > Number(rules.maximumCount)
  ) {
    return false
  }

  return metricIds.length > 0
}

function assertMetricSelectionLength(
  metricIds: readonly EcomDashMetricId[],
  label: string,
  rules: MetricSelectionRules
) {
  if (
    Number.isFinite(rules.exactCount) &&
    metricIds.length !== Number(rules.exactCount)
  ) {
    throw new Error(
      `${label} must keep exactly ${Number(rules.exactCount)} metric slot(s).`
    )
  }

  if (
    Number.isFinite(rules.minimumCount) &&
    metricIds.length < Number(rules.minimumCount)
  ) {
    throw new Error(
      `${label} must keep at least ${Number(rules.minimumCount)} selected metric(s).`
    )
  }

  if (
    Number.isFinite(rules.maximumCount) &&
    metricIds.length > Number(rules.maximumCount)
  ) {
    throw new Error(
      `${label} cannot exceed ${Number(rules.maximumCount)} selected metric(s).`
    )
  }
}

function normalizeMetricSelectionForPool(
  metricIds: readonly string[],
  poolId: MetricPoolId
) {
  const pool = getMetricPool(poolId)
  const allowedMetricIds = new Set(pool.metricIds)
  const normalizedMetricIds: EcomDashMetricId[] = []
  const seen = new Set<EcomDashMetricId>()

  for (const candidate of metricIds) {
    const metricId = String(candidate ?? "").trim()

    if (!isKnownMetricId(metricId) || !allowedMetricIds.has(metricId) || seen.has(metricId)) {
      continue
    }

    seen.add(metricId)
    normalizedMetricIds.push(metricId)
  }

  return {
    pool,
    normalizedMetricIds,
  }
}

function serializeMetricSelection(metricIds: readonly EcomDashMetricId[]) {
  return JSON.stringify(metricIds)
}

function resolveMetricSelection(
  rawValue: string,
  allowedMetricIds: readonly EcomDashMetricId[],
  defaultMetricIds: readonly EcomDashMetricId[],
  rules?: MetricSelectionRules
): SliceMetricSelection {
  const configuredMetricIds = parseMetricSelection(rawValue).filter((metricId) =>
    allowedMetricIds.includes(metricId)
  )

  return {
    allowedMetricIds: [...allowedMetricIds],
    defaultMetricIds: [...defaultMetricIds],
    selectedMetricIds:
      isMetricSelectionValidLength(configuredMetricIds, rules)
        ? configuredMetricIds
        : [...defaultMetricIds],
  }
}

async function upsertWorkspaceSettingEntry(input: {
  tableName: "config_entries" | "targets_entries"
  workspaceId: string
  settingKey: string
  settingValue: string
  description: string
  updatedAt: string
}) {
  await executeStatement(
    `
      INSERT INTO ${input.tableName} (
        workspace_id,
        setting_key,
        setting_value,
        description,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id, setting_key)
      DO UPDATE SET
        setting_value = excluded.setting_value,
        description = excluded.description,
        updated_at = excluded.updated_at
    `,
    [
      input.workspaceId,
      input.settingKey,
      input.settingValue,
      input.description,
      input.updatedAt,
    ]
  )
}

async function persistMetricSelectionForPool(input: {
  workspaceId: string
  tableName: "config_entries" | "targets_entries"
  settingKey: string
  description: string
  poolId: MetricPoolId
  metricIds: readonly string[]
  label: string
  rules: MetricSelectionRules
}) {
  const { normalizedMetricIds } = normalizeMetricSelectionForPool(
    input.metricIds,
    input.poolId
  )

  assertMetricSelectionLength(normalizedMetricIds, input.label, input.rules)

  const updatedAt = nowIsoTimestamp()

  await upsertWorkspaceSettingEntry({
    tableName: input.tableName,
    workspaceId: input.workspaceId,
    settingKey: input.settingKey,
    settingValue: serializeMetricSelection(normalizedMetricIds),
    description: input.description,
    updatedAt,
  })

  return {
    metricIds: normalizedMetricIds,
    updatedAt,
  }
}

export async function saveOverviewKpiStripSelection(input: {
  workspaceId: string
  metricIds: readonly string[]
}) {
  return persistMetricSelectionForPool({
    workspaceId: input.workspaceId,
    tableName: "config_entries",
    settingKey: ECOMDASH2_CONFIG_KEYS.overviewKpiStrip,
    description: ECOMDASH2_SETTING_DESCRIPTIONS.overviewKpiStrip,
    poolId: "overview-kpi",
    metricIds: input.metricIds,
    label: "Overview KPI strip",
    rules: {
      exactCount: OVERVIEW_KPI_SLOT_COUNT,
    },
  })
}

export async function saveShopifyProfitKpiStripSelection(input: {
  workspaceId: string
  metricIds: readonly string[]
}) {
  return persistMetricSelectionForPool({
    workspaceId: input.workspaceId,
    tableName: "config_entries",
    settingKey: ECOMDASH2_CONFIG_KEYS.shopifyProfitKpiStrip,
    description: ECOMDASH2_SETTING_DESCRIPTIONS.shopifyProfitKpiStrip,
    poolId: "shopify-profit-kpi",
    metricIds: input.metricIds,
    label: "Shopify Profit KPI strip",
    rules: {
      exactCount: SHOPIFY_PROFIT_KPI_SLOT_COUNT,
    },
  })
}

export async function saveOverviewPacingMetricSelection(input: {
  workspaceId: string
  metricIds: readonly string[]
}) {
  return persistMetricSelectionForPool({
    workspaceId: input.workspaceId,
    tableName: "targets_entries",
    settingKey: ECOMDASH2_TARGET_KEYS.overviewPacingMetrics,
    description: ECOMDASH2_SETTING_DESCRIPTIONS.overviewPacingMetrics,
    poolId: "overview-pacing",
    metricIds: input.metricIds,
    label: "Overview pacing board",
    rules: {
      minimumCount: 1,
      maximumCount: OVERVIEW_PACING_MAX_ROWS,
    },
  })
}

export function buildEcomDash2SettingsSnapshot(input: {
  configEntries: AppConfigEntry[]
  targetEntries: AppTargetEntry[]
}): EcomDash2SettingsSnapshot {
  const configEntries = input.configEntries.filter((entry) =>
    entry.settingKey.startsWith(ECOMDASH2_CONFIG_PREFIX)
  )
  const targetEntries = input.targetEntries.filter((entry) =>
    entry.settingKey.startsWith(ECOMDASH2_CONFIG_PREFIX)
  )
  const configMap = toSettingsMap(configEntries)
  const targetMap = toSettingsMap(targetEntries)
  const overviewKpiPool = getMetricPool("overview-kpi")
  const overviewPacingPool = getMetricPool("overview-pacing")
  const shopifyProfitPool = getMetricPool("shopify-profit-kpi")
  const sharedCurrencyEntry = input.configEntries.find(
    (entry) => entry.settingKey.toUpperCase() === "CURRENCY"
  )

  return {
    currency: sharedCurrencyEntry?.settingValue || env.backend.defaultCurrency,
    configEntries,
    targetEntries,
    configMap,
    targetMap,
    overviewKpis: resolveMetricSelection(
      configMap[ECOMDASH2_CONFIG_KEYS.overviewKpiStrip] || "",
      overviewKpiPool.metricIds,
      overviewKpiPool.metricIds.slice(0, OVERVIEW_KPI_SLOT_COUNT),
      {
        exactCount: OVERVIEW_KPI_SLOT_COUNT,
      }
    ),
    overviewPacing: resolveMetricSelection(
      targetMap[ECOMDASH2_TARGET_KEYS.overviewPacingMetrics] || "",
      overviewPacingPool.metricIds,
      overviewPacingPool.metricIds.slice(0, OVERVIEW_PACING_MAX_ROWS),
      {
        minimumCount: 1,
        maximumCount: OVERVIEW_PACING_MAX_ROWS,
      }
    ),
    shopifyProfitKpis: resolveMetricSelection(
      configMap[ECOMDASH2_CONFIG_KEYS.shopifyProfitKpiStrip] || "",
      shopifyProfitPool.metricIds,
      shopifyProfitPool.metricIds.slice(0, SHOPIFY_PROFIT_KPI_SLOT_COUNT),
      {
        exactCount: SHOPIFY_PROFIT_KPI_SLOT_COUNT,
      }
    ),
  }
}
