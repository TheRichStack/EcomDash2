import type { AppConfigEntry, CostSettings, SkuCost } from "@/types/backend"

export type CostSettingsSource = "cost_settings" | "legacy_config"

export type CostSettingsValues = {
  defaultMarginPct: number
  paymentFeePct: number
  shippingPct: number
  returnsAllowancePct: number
  monthlyOverhead: number
}

export type ResolvedCostSettings = CostSettingsValues & {
  source: CostSettingsSource
  updatedAt: string | null
}

export type CostValidationField = keyof CostSettingsValues | "overrideUnitCost"

export type CostValidationIssue = {
  field: CostValidationField
  rowKey: string | null
  message: string
  value: string
}

export type CostSettingsInput = Partial<
  Record<keyof CostSettingsValues, unknown>
>

export type SkuCostSeedRow = {
  rowKey: string
  shopifyVariantId: string
  sku: string
  productTitle: string
  variantTitle: string
  price: number | null
  shopifyCost: number | null
}

export type SkuCostInputRow = {
  rowKey?: unknown
  shopifyVariantId?: unknown
  sku?: unknown
  productTitle?: unknown
  variantTitle?: unknown
  price?: unknown
  shopifyCost?: unknown
  overrideUnitCost?: unknown
}

export type NormalizedSkuCostRow = SkuCostSeedRow & {
  overrideUnitCost: number | null
}

export type SkuCostWorkflowRow = NormalizedSkuCostRow & {
  updatedAt: string
  activeUnitCost: number | null
  derivedMarginPct: number | null
  missingExactCost: boolean
}

export type SkuCostWorkflowSummary = {
  totalRows: number
  missingCostRows: number
  overrideRows: number
  shopifyCostRows: number
}

export type SettingsCostsWorkflowData = {
  resolvedSettings: ResolvedCostSettings
  rows: SkuCostWorkflowRow[]
  summary: SkuCostWorkflowSummary
}

const LEGACY_COST_SETTINGS_KEYS = {
  defaultMarginPct: "DEFAULT_MARGIN_PCT",
  paymentFeePct: "CONTRIBUTION_PAYMENT_FEE_PCT",
  shippingPct: "CONTRIBUTION_SHIPPING_PCT",
  returnsAllowancePct: "CONTRIBUTION_RETURNS_ALLOWANCE_PCT",
} as const satisfies Record<
  Exclude<keyof CostSettingsValues, "monthlyOverhead">,
  string
>

function toText(value: unknown) {
  return String(value ?? "").trim()
}

function normalizeKeyToken(value: unknown) {
  return toText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\|/g, "")
    .trim()
}

function roundNumber(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

export function buildSkuCostRowKey(input: {
  shopifyVariantId?: unknown
  sku?: unknown
  productTitle?: unknown
  variantTitle?: unknown
}) {
  const variantId = normalizeKeyToken(input.shopifyVariantId)

  if (variantId) {
    return `variant:${variantId}`
  }

  const sku = normalizeKeyToken(input.sku)

  if (sku) {
    return `sku:${sku}`
  }

  const product = normalizeKeyToken(input.productTitle)
  const variant = normalizeKeyToken(input.variantTitle)

  if (product || variant) {
    return `title:${product}::${variant}`
  }

  return ""
}

export function parseCostAmount(value: unknown) {
  const raw = toText(value)

  if (!raw) {
    return null
  }

  const sanitized = raw
    .replace(/[$\u00A3\u20AC\u00A5]/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/usd|gbp|eur|aud|cad|nzd/gi, "")

  if (!sanitized) {
    return null
  }

  const parsed = Number(sanitized)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  return roundNumber(parsed)
}

function parsePercent(value: unknown) {
  const raw = toText(value).replace("%", "")

  if (!raw) {
    return null
  }

  const parsed = Number(raw)

  if (!Number.isFinite(parsed)) {
    return null
  }

  return parsed
}

export function deriveActiveUnitCost(row: {
  overrideUnitCost?: unknown
  shopifyCost?: unknown
}) {
  const overrideCost = parseCostAmount(row.overrideUnitCost)

  if (overrideCost !== null && overrideCost > 0) {
    return overrideCost
  }

  const shopifyCost = parseCostAmount(row.shopifyCost)

  if (shopifyCost !== null && shopifyCost > 0) {
    return shopifyCost
  }

  return null
}

export function deriveMarginPct(price: unknown, activeUnitCost: unknown) {
  const parsedPrice = parseCostAmount(price)
  const parsedCost = parseCostAmount(activeUnitCost)

  if (
    parsedPrice === null ||
    parsedPrice <= 0 ||
    parsedCost === null ||
    parsedCost <= 0
  ) {
    return null
  }

  return roundNumber((parsedPrice - parsedCost) / parsedPrice)
}

export function decorateSkuCostRow(
  row: NormalizedSkuCostRow & {
    updatedAt?: string
  }
): SkuCostWorkflowRow {
  const activeUnitCost = deriveActiveUnitCost(row)
  const derivedMarginPct = deriveMarginPct(row.price, activeUnitCost)

  return {
    ...row,
    updatedAt: toText(row.updatedAt),
    activeUnitCost,
    derivedMarginPct,
    missingExactCost: activeUnitCost === null,
  }
}

function resolveLegacyFallbackValue(
  configEntries: AppConfigEntry[],
  field: Exclude<keyof CostSettingsValues, "monthlyOverhead">
) {
  const configMap = new Map(
    configEntries.map((entry) => [
      String(entry.settingKey ?? "")
        .trim()
        .toUpperCase(),
      String(entry.settingValue ?? "").trim(),
    ])
  )
  const parsed = parsePercent(configMap.get(LEGACY_COST_SETTINGS_KEYS[field]))

  return clamp(parsed ?? 0, 0, 100)
}

export function resolveCostSettings(
  storedSettings: CostSettings | null,
  configEntries: AppConfigEntry[]
): ResolvedCostSettings {
  if (storedSettings) {
    return {
      defaultMarginPct: storedSettings.defaultMarginPct,
      paymentFeePct: storedSettings.paymentFeePct,
      shippingPct: storedSettings.shippingPct,
      returnsAllowancePct: storedSettings.returnsAllowancePct,
      monthlyOverhead: storedSettings.monthlyOverhead,
      source: "cost_settings",
      updatedAt: storedSettings.updatedAt,
    }
  }

  return {
    defaultMarginPct: resolveLegacyFallbackValue(
      configEntries,
      "defaultMarginPct"
    ),
    paymentFeePct: resolveLegacyFallbackValue(configEntries, "paymentFeePct"),
    shippingPct: resolveLegacyFallbackValue(configEntries, "shippingPct"),
    returnsAllowancePct: resolveLegacyFallbackValue(
      configEntries,
      "returnsAllowancePct"
    ),
    monthlyOverhead: 0,
    source: "legacy_config",
    updatedAt: null,
  }
}

export function normalizeCostSettings(
  input: CostSettingsInput,
  fallback?: Partial<CostSettingsValues>
) {
  const issues: CostValidationIssue[] = []

  function valueFrom(
    field: keyof CostSettingsValues,
    parser: (value: unknown) => number | null,
    min: number,
    max?: number
  ) {
    const parsed = parser(input[field])
    const fallbackValue = Number(fallback?.[field] ?? 0)
    const next = parsed === null ? fallbackValue : parsed

    if (!Number.isFinite(next)) {
      issues.push({
        field,
        rowKey: null,
        message: "Must be a valid number.",
        value: toText(input[field]),
      })
      return 0
    }

    if (next < min || (max !== undefined && next > max)) {
      issues.push({
        field,
        rowKey: null,
        message:
          max === undefined
            ? `Must be >= ${min}.`
            : `Must be between ${min} and ${max}.`,
        value: toText(input[field]),
      })
    }

    return max === undefined ? Math.max(min, next) : clamp(next, min, max)
  }

  return {
    values: {
      defaultMarginPct: valueFrom("defaultMarginPct", parsePercent, 0, 100),
      paymentFeePct: valueFrom("paymentFeePct", parsePercent, 0, 100),
      shippingPct: valueFrom("shippingPct", parsePercent, 0, 100),
      returnsAllowancePct: valueFrom(
        "returnsAllowancePct",
        parsePercent,
        0,
        100
      ),
      monthlyOverhead: valueFrom("monthlyOverhead", parseCostAmount, 0),
    } satisfies CostSettingsValues,
    issues,
  }
}

export function normalizeSkuCostRows(rows: SkuCostInputRow[]) {
  const issues: CostValidationIssue[] = []
  const normalizedRows: NormalizedSkuCostRow[] = []
  const seenRowKeys = new Set<string>()

  for (const rawRow of rows || []) {
    const rowKey =
      toText(rawRow.rowKey) ||
      buildSkuCostRowKey({
        shopifyVariantId: rawRow.shopifyVariantId,
        sku: rawRow.sku,
        productTitle: rawRow.productTitle,
        variantTitle: rawRow.variantTitle,
      })

    if (!rowKey || seenRowKeys.has(rowKey)) {
      continue
    }

    seenRowKeys.add(rowKey)

    const price = parseCostAmount(rawRow.price)
    const shopifyCost = parseCostAmount(rawRow.shopifyCost)
    const overrideInput = toText(rawRow.overrideUnitCost)
    const parsedOverrideCost =
      overrideInput === "" ? null : parseCostAmount(rawRow.overrideUnitCost)

    if (overrideInput !== "" && parsedOverrideCost === null) {
      issues.push({
        field: "overrideUnitCost",
        rowKey,
        message: "Override unit cost must be a number >= 0.",
        value: overrideInput,
      })
    }

    normalizedRows.push({
      rowKey,
      shopifyVariantId: toText(rawRow.shopifyVariantId),
      sku: toText(rawRow.sku),
      productTitle: toText(rawRow.productTitle),
      variantTitle: toText(rawRow.variantTitle),
      price,
      shopifyCost,
      overrideUnitCost:
        parsedOverrideCost !== null && parsedOverrideCost > 0
          ? parsedOverrideCost
          : null,
    })
  }

  return {
    rows: normalizedRows,
    issues,
  }
}

function mergeSeedRow(base: SkuCostSeedRow, patch: Partial<SkuCostSeedRow>) {
  return {
    rowKey: base.rowKey,
    shopifyVariantId: base.shopifyVariantId || toText(patch.shopifyVariantId),
    sku: base.sku || toText(patch.sku),
    productTitle: base.productTitle || toText(patch.productTitle),
    variantTitle: base.variantTitle || toText(patch.variantTitle),
    price: base.price ?? patch.price ?? null,
    shopifyCost: base.shopifyCost ?? patch.shopifyCost ?? null,
  } satisfies SkuCostSeedRow
}

type StoredSkuCostRow = Pick<
  SkuCost,
  | "rowKey"
  | "shopifyVariantId"
  | "sku"
  | "productTitle"
  | "variantTitle"
  | "price"
  | "shopifyCost"
  | "overrideUnitCost"
  | "updatedAt"
>

export function mergeSkuCostRows(
  inventorySeeds: SkuCostSeedRow[],
  soldFallbackSeeds: SkuCostSeedRow[],
  storedRows: StoredSkuCostRow[]
) {
  const rowsByKey = new Map<
    string,
    NormalizedSkuCostRow & {
      updatedAt: string
    }
  >()

  function ensureSeedRow(seed: SkuCostSeedRow) {
    if (!seed.rowKey) {
      return
    }

    const existing = rowsByKey.get(seed.rowKey)

    if (!existing) {
      rowsByKey.set(seed.rowKey, {
        ...seed,
        overrideUnitCost: null,
        updatedAt: "",
      })
      return
    }

    rowsByKey.set(seed.rowKey, {
      ...mergeSeedRow(existing, seed),
      overrideUnitCost: existing.overrideUnitCost,
      updatedAt: existing.updatedAt,
    })
  }

  for (const seed of inventorySeeds || []) {
    ensureSeedRow(seed)
  }

  for (const seed of soldFallbackSeeds || []) {
    ensureSeedRow(seed)
  }

  for (const storedRow of storedRows || []) {
    const rowKey =
      toText(storedRow.rowKey) ||
      buildSkuCostRowKey({
        shopifyVariantId: storedRow.shopifyVariantId,
        sku: storedRow.sku,
        productTitle: storedRow.productTitle,
        variantTitle: storedRow.variantTitle,
      })

    if (!rowKey) {
      continue
    }

    const existing = rowsByKey.get(rowKey)
    const seedRow: SkuCostSeedRow = {
      rowKey,
      shopifyVariantId: toText(storedRow.shopifyVariantId),
      sku: toText(storedRow.sku),
      productTitle: toText(storedRow.productTitle),
      variantTitle: toText(storedRow.variantTitle),
      price: parseCostAmount(storedRow.price),
      shopifyCost: parseCostAmount(storedRow.shopifyCost),
    }
    const overrideUnitCost = parseCostAmount(storedRow.overrideUnitCost)

    if (!existing) {
      rowsByKey.set(rowKey, {
        ...seedRow,
        overrideUnitCost:
          overrideUnitCost !== null && overrideUnitCost > 0
            ? overrideUnitCost
            : null,
        updatedAt: toText(storedRow.updatedAt),
      })
      continue
    }

    rowsByKey.set(rowKey, {
      ...mergeSeedRow(existing, seedRow),
      overrideUnitCost:
        overrideUnitCost !== null && overrideUnitCost > 0
          ? overrideUnitCost
          : null,
      updatedAt: toText(storedRow.updatedAt) || existing.updatedAt,
    })
  }

  return Array.from(rowsByKey.values())
    .sort((left, right) => {
      if (left.productTitle !== right.productTitle) {
        return left.productTitle.localeCompare(right.productTitle)
      }

      if (left.variantTitle !== right.variantTitle) {
        return left.variantTitle.localeCompare(right.variantTitle)
      }

      if (left.sku !== right.sku) {
        return left.sku.localeCompare(right.sku)
      }

      return left.rowKey.localeCompare(right.rowKey)
    })
    .map(decorateSkuCostRow)
}

export function summarizeSkuCostRows(
  rows: Array<{
    shopifyCost: number | null
    overrideUnitCost: number | null
    missingExactCost: boolean
  }>
) {
  return {
    totalRows: rows.length,
    missingCostRows: rows.filter((row) => row.missingExactCost).length,
    overrideRows: rows.filter((row) => row.overrideUnitCost !== null).length,
    shopifyCostRows: rows.filter((row) => row.shopifyCost !== null).length,
  } satisfies SkuCostWorkflowSummary
}
