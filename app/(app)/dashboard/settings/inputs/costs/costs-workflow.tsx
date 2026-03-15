"use client"

import {
  useDeferredValue,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { AlertCircleIcon, SaveIcon } from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@/components/shared/empty-state"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  SaveCostsIssue,
  SaveCostsResult,
} from "@/app/(app)/dashboard/settings/settings-actions"
import {
  formatSettingsCurrency,
  formatSettingsDateTime,
  formatSettingsNumber,
  formatSettingsPercent,
} from "@/app/(app)/dashboard/settings/settings-utils"
import {
  decorateSkuCostRow,
  normalizeCostSettings,
  normalizeSkuCostRows,
  parseCostAmount,
  summarizeSkuCostRows,
  type CostSettingsInput,
  type CostSettingsValues,
  type SettingsCostsWorkflowData,
  type SkuCostInputRow,
  type SkuCostWorkflowRow,
} from "@/lib/settings/costs"

type CostFilter = "all" | "missing" | "overrides"

type CostDraftRow = SkuCostWorkflowRow & {
  id: string
  overrideUnitCostInput: string
}

type CostsWorkflowProps = {
  workspaceId: string
  currency: string
  initialData: SettingsCostsWorkflowData
  saveAction: (input: {
    workspaceId: string
    settings: CostSettingsInput
    rows: SkuCostInputRow[]
  }) => Promise<SaveCostsResult>
}

const COST_FILTER_OPTIONS = [
  {
    value: "all",
    label: "All rows",
  },
  {
    value: "missing",
    label: "Missing costs",
  },
  {
    value: "overrides",
    label: "Overrides only",
  },
] as const satisfies ReadonlyArray<{
  value: CostFilter
  label: string
}>

const FIELD_LABELS: Record<
  keyof CostSettingsValues | "overrideUnitCost",
  string
> = {
  defaultMarginPct: "Default margin",
  paymentFeePct: "Payment fee",
  shippingPct: "Shipping",
  returnsAllowancePct: "Returns allowance",
  monthlyOverhead: "Monthly overhead",
  overrideUnitCost: "Override unit cost",
}

function formatEditableNumber(value: number | null) {
  return value === null ? "" : String(value)
}

function formatDerivedMargin(value: number | null) {
  if (value === null) {
    return "Missing"
  }

  const percentValue = value * 100
  const hasFraction = !Number.isInteger(percentValue)

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: hasFraction ? 1 : 0,
  }).format(percentValue)}%`
}

function clampPercentageValue(value: string) {
  const parsed = Number(
    String(value ?? "")
      .replace("%", "")
      .trim()
  )

  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.min(100, Math.max(0, parsed))
}

function toDraftSettings(
  settings: SettingsCostsWorkflowData["resolvedSettings"]
) {
  return {
    defaultMarginPct: String(settings.defaultMarginPct),
    paymentFeePct: String(settings.paymentFeePct),
    shippingPct: String(settings.shippingPct),
    returnsAllowancePct: String(settings.returnsAllowancePct),
    monthlyOverhead: String(settings.monthlyOverhead),
  } satisfies Record<keyof CostSettingsValues, string>
}

function toDraftRow(row: SkuCostWorkflowRow): CostDraftRow {
  return {
    ...row,
    id: row.rowKey,
    overrideUnitCostInput: formatEditableNumber(row.overrideUnitCost),
  }
}

function recomputeDraftRow(
  row: CostDraftRow,
  overrideUnitCostInput: string
): CostDraftRow {
  const overrideUnitCost = parseCostAmount(overrideUnitCostInput)
  const nextRow = decorateSkuCostRow({
    rowKey: row.rowKey,
    shopifyVariantId: row.shopifyVariantId,
    sku: row.sku,
    productTitle: row.productTitle,
    variantTitle: row.variantTitle,
    price: row.price,
    shopifyCost: row.shopifyCost,
    overrideUnitCost:
      overrideUnitCost !== null && overrideUnitCost > 0
        ? overrideUnitCost
        : null,
    updatedAt: row.updatedAt,
  })

  return {
    ...nextRow,
    id: row.id,
    overrideUnitCostInput,
  }
}

function toActionRows(rows: CostDraftRow[]): SkuCostInputRow[] {
  return rows.map((row) => ({
    rowKey: row.rowKey,
    shopifyVariantId: row.shopifyVariantId,
    sku: row.sku,
    productTitle: row.productTitle,
    variantTitle: row.variantTitle,
    price: row.price === null ? "" : String(row.price),
    shopifyCost: row.shopifyCost === null ? "" : String(row.shopifyCost),
    overrideUnitCost: row.overrideUnitCostInput,
  }))
}

function buildIssueMaps(issues: SaveCostsIssue[]) {
  const fieldIssues = new Map<string, string[]>()
  const rowIssues = new Map<string, string[]>()

  for (const issue of issues) {
    if (issue.rowKey) {
      rowIssues.set(issue.rowKey, [
        ...(rowIssues.get(issue.rowKey) ?? []),
        issue.message,
      ])
      continue
    }

    fieldIssues.set(issue.field, [
      ...(fieldIssues.get(issue.field) ?? []),
      issue.message,
    ])
  }

  return {
    fieldIssues,
    rowIssues,
  }
}

function formatIssueLabel(issue: SaveCostsIssue) {
  if (issue.rowKey) {
    return `${FIELD_LABELS.overrideUnitCost} (${issue.rowKey})`
  }

  return FIELD_LABELS[issue.field]
}

function MetricCard(props: {
  title: string
  value: string
  description: string
  footer?: ReactNode
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-2xl font-semibold tracking-tight">{props.value}</p>
        <p className="text-sm text-muted-foreground">{props.description}</p>
        {props.footer ? <div className="pt-1">{props.footer}</div> : null}
      </CardContent>
    </Card>
  )
}

function PercentageField(props: {
  field: keyof Pick<
    CostSettingsValues,
    "defaultMarginPct" | "paymentFeePct" | "shippingPct" | "returnsAllowancePct"
  >
  label: string
  description: string
  value: string
  issue?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="rounded-xl border bg-muted/10 p-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={props.field} className="text-sm font-medium">
          {props.label}
        </Label>
        <p className="text-sm text-muted-foreground">{props.description}</p>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <input
          aria-label={props.label}
          className="w-full accent-primary"
          max={100}
          min={0}
          step={0.5}
          type="range"
          value={clampPercentageValue(props.value)}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <Input
            id={props.field}
            aria-invalid={props.issue ? true : undefined}
            inputMode="decimal"
            max={100}
            min={0}
            step={0.1}
            type="number"
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
        {props.issue ? (
          <p className="text-xs font-medium text-destructive">{props.issue}</p>
        ) : null}
      </div>
    </div>
  )
}

export function CostsWorkflow({
  workspaceId,
  currency,
  initialData,
  saveAction,
}: CostsWorkflowProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [settingsDraft, setSettingsDraft] = useState(() =>
    toDraftSettings(initialData.resolvedSettings)
  )
  const [draftRows, setDraftRows] = useState(() =>
    initialData.rows.map((row) => toDraftRow(row))
  )
  const [searchValue, setSearchValue] = useState("")
  const deferredSearchValue = useDeferredValue(searchValue)
  const [filter, setFilter] = useState<CostFilter>("all")
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(
    () => new Set()
  )
  const [bulkOverrideValue, setBulkOverrideValue] = useState("")
  const [serverIssues, setServerIssues] = useState<SaveCostsIssue[]>([])

  const actionRows = useMemo(() => toActionRows(draftRows), [draftRows])
  const settingsValidation = useMemo(
    () => normalizeCostSettings(settingsDraft),
    [settingsDraft]
  )
  const rowsValidation = useMemo(
    () => normalizeSkuCostRows(actionRows),
    [actionRows]
  )
  const localIssues = useMemo(
    () => [...settingsValidation.issues, ...rowsValidation.issues],
    [rowsValidation.issues, settingsValidation.issues]
  )
  const displayedIssues = serverIssues.length > 0 ? serverIssues : localIssues
  const issueMaps = useMemo(
    () => buildIssueMaps(displayedIssues),
    [displayedIssues]
  )
  const currentSummary = useMemo(
    () => summarizeSkuCostRows(draftRows),
    [draftRows]
  )
  const resolvedSettingsPreview = settingsValidation.values
  const filteredRows = useMemo(() => {
    const normalizedSearch = deferredSearchValue.trim().toLowerCase()

    return draftRows.filter((row) => {
      if (filter === "missing" && !row.missingExactCost) {
        return false
      }

      if (filter === "overrides" && row.overrideUnitCost === null) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const searchTarget =
        `${row.productTitle} ${row.variantTitle} ${row.sku}`.toLowerCase()

      return searchTarget.includes(normalizedSearch)
    })
  }, [deferredSearchValue, draftRows, filter])
  const allFilteredSelected =
    filteredRows.length > 0 &&
    filteredRows.every((row) => selectedRowKeys.has(row.rowKey))
  const someFilteredSelected =
    !allFilteredSelected &&
    filteredRows.some((row) => selectedRowKeys.has(row.rowKey))
  const headerCheckboxState: boolean | "indeterminate" = allFilteredSelected
    ? true
    : someFilteredSelected
      ? "indeterminate"
      : false

  function clearServerValidation() {
    if (serverIssues.length > 0) {
      setServerIssues([])
    }
  }

  function updateSetting(field: keyof CostSettingsValues, value: string) {
    clearServerValidation()
    setSettingsDraft((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function updateDraftRow(rowKey: string, overrideUnitCostInput: string) {
    clearServerValidation()
    setDraftRows((current) =>
      current.map((row) =>
        row.rowKey === rowKey
          ? recomputeDraftRow(row, overrideUnitCostInput)
          : row
      )
    )
  }

  function toggleRowSelected(
    rowKey: string,
    checked: boolean | "indeterminate"
  ) {
    setSelectedRowKeys((current) => {
      const next = new Set(current)

      if (checked === true) {
        next.add(rowKey)
      } else {
        next.delete(rowKey)
      }

      return next
    })
  }

  function toggleSelectAllFilteredRows(checked: boolean | "indeterminate") {
    setSelectedRowKeys((current) => {
      const next = new Set(current)

      for (const row of filteredRows) {
        if (checked === true) {
          next.add(row.rowKey)
        } else {
          next.delete(row.rowKey)
        }
      }

      return next
    })
  }

  function applyBulkOverride() {
    if (selectedRowKeys.size === 0) {
      toast.error("Select at least one SKU row first.")
      return
    }

    const parsedOverride = parseCostAmount(bulkOverrideValue)

    if (parsedOverride === null || parsedOverride <= 0) {
      toast.error("Enter a positive override unit cost.")
      return
    }

    clearServerValidation()
    setDraftRows((current) =>
      current.map((row) =>
        selectedRowKeys.has(row.rowKey)
          ? recomputeDraftRow(row, String(parsedOverride))
          : row
      )
    )
    setBulkOverrideValue("")
    toast.success(
      `Applied ${formatSettingsCurrency(parsedOverride, currency)} to ${formatSettingsNumber(selectedRowKeys.size)} selected rows.`
    )
  }

  function clearOverrides(scope: "selected" | "all") {
    if (scope === "selected" && selectedRowKeys.size === 0) {
      toast.error("Select at least one SKU row first.")
      return
    }

    clearServerValidation()
    setDraftRows((current) =>
      current.map((row) =>
        scope === "all" || selectedRowKeys.has(row.rowKey)
          ? recomputeDraftRow(row, "")
          : row
      )
    )

    if (scope === "all") {
      setSelectedRowKeys(new Set())
      toast.success(
        "Cleared all overrides. Shopify costs remain active where available."
      )
      return
    }

    toast.success(
      `Cleared overrides for ${formatSettingsNumber(selectedRowKeys.size)} selected rows.`
    )
  }

  function saveCosts() {
    startTransition(() => {
      void (async () => {
        const result = await saveAction({
          workspaceId,
          settings: settingsDraft,
          rows: actionRows,
        })

        if (result.status === "error") {
          setServerIssues(result.issues)
          toast.error(result.message)
          return
        }

        setServerIssues([])
        toast.success(
          `${result.message} ${formatSettingsNumber(result.summary.overrideRows)} overrides across ${formatSettingsNumber(result.summary.totalRows)} SKU rows.`
        )
        router.refresh()
      })()
    })
  }

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      {initialData.resolvedSettings.source === "legacy_config" ? (
        <Alert>
          <AlertCircleIcon className="size-4" />
          <AlertTitle>Shared cost settings have not been saved yet.</AlertTitle>
          <AlertDescription>
            This draft is seeded from the legacy fallback config. Save Costs to
            create the shared <code>cost_settings</code> row used by the current
            EcomDash2 loaders.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Fallback margin"
          value={formatSettingsPercent(
            resolvedSettingsPreview.defaultMarginPct
          )}
          description="Used only when an exact SKU unit cost is missing."
          footer={
            <Badge
              variant={
                initialData.resolvedSettings.source === "cost_settings"
                  ? "secondary"
                  : "outline"
              }
            >
              {initialData.resolvedSettings.source === "cost_settings"
                ? "Shared row"
                : "Legacy fallback"}
            </Badge>
          }
        />
        <MetricCard
          title="Fees and allowances"
          value={`${formatSettingsPercent(resolvedSettingsPreview.paymentFeePct)} payment`}
          description={`${formatSettingsPercent(resolvedSettingsPreview.shippingPct)} shipping, ${formatSettingsPercent(resolvedSettingsPreview.returnsAllowancePct)} returns.`}
        />
        <MetricCard
          title="Monthly overhead"
          value={formatSettingsCurrency(
            resolvedSettingsPreview.monthlyOverhead,
            currency
          )}
          description={`Workspace currency ${currency}. Used in overhead allocation and net profit.`}
        />
        <MetricCard
          title="SKU coverage"
          value={formatSettingsNumber(currentSummary.totalRows)}
          description={`${formatSettingsNumber(currentSummary.overrideRows)} overrides live, ${formatSettingsNumber(currentSummary.missingCostRows)} rows still missing an exact cost.`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editable defaults</CardTitle>
          <CardDescription>
            Adjust the fallback margin, fee defaults, and monthly overhead
            without widening this route into a broader settings framework.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <PercentageField
            field="defaultMarginPct"
            label="Default margin"
            description="Fallback only when no SKU-level unit cost is available."
            issue={issueMaps.fieldIssues.get("defaultMarginPct")?.[0]}
            value={settingsDraft.defaultMarginPct}
            onChange={(value) => updateSetting("defaultMarginPct", value)}
          />
          <PercentageField
            field="paymentFeePct"
            label="Payment fee"
            description="Applied downstream when payment-fee data points are missing."
            issue={issueMaps.fieldIssues.get("paymentFeePct")?.[0]}
            value={settingsDraft.paymentFeePct}
            onChange={(value) => updateSetting("paymentFeePct", value)}
          />
          <PercentageField
            field="shippingPct"
            label="Shipping"
            description="Used as the shipping fallback percentage."
            issue={issueMaps.fieldIssues.get("shippingPct")?.[0]}
            value={settingsDraft.shippingPct}
            onChange={(value) => updateSetting("shippingPct", value)}
          />
          <PercentageField
            field="returnsAllowancePct"
            label="Returns allowance"
            description="Used as the returns fallback percentage."
            issue={issueMaps.fieldIssues.get("returnsAllowancePct")?.[0]}
            value={settingsDraft.returnsAllowancePct}
            onChange={(value) => updateSetting("returnsAllowancePct", value)}
          />
          <div className="rounded-xl border bg-muted/10 p-4 lg:col-span-2 xl:col-span-1">
            <div className="flex flex-col gap-1">
              <Label htmlFor="monthlyOverhead" className="text-sm font-medium">
                Monthly overhead
              </Label>
              <p className="text-sm text-muted-foreground">
                Store the workspace overhead in {currency} so Shopify Profit and
                Overview allocate it immediately after save.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Input
                  id="monthlyOverhead"
                  aria-invalid={
                    issueMaps.fieldIssues.get("monthlyOverhead")?.length
                      ? true
                      : undefined
                  }
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  type="number"
                  value={settingsDraft.monthlyOverhead}
                  onChange={(event) =>
                    updateSetting("monthlyOverhead", event.target.value)
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {currency}
                </span>
              </div>
              {issueMaps.fieldIssues.get("monthlyOverhead")?.[0] ? (
                <p className="text-xs font-medium text-destructive">
                  {issueMaps.fieldIssues.get("monthlyOverhead")?.[0]}
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle>SKU override workflow</CardTitle>
              <CardDescription>
                Search, filter, select, bulk apply, or clear unit cost
                overrides. Margin stays derived and read-only.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {formatSettingsNumber(currentSummary.totalRows)} rows
              </Badge>
              <Badge variant="outline">
                {formatSettingsNumber(currentSummary.missingCostRows)} missing
              </Badge>
              <Badge variant="secondary">
                {formatSettingsNumber(currentSummary.overrideRows)} overrides
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
              <Input
                aria-label="Search SKU costs"
                className="md:max-w-sm"
                placeholder="Search product, variant, or SKU"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {COST_FILTER_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    type="button"
                    variant={filter === option.value ? "secondary" : "outline"}
                    onClick={() => setFilter(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={currentSummary.overrideRows === 0}
              onClick={() => clearOverrides("all")}
            >
              Clear all overrides
            </Button>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Bulk actions</p>
              <p className="text-sm text-muted-foreground">
                {formatSettingsNumber(selectedRowKeys.size)} selected rows.
                Apply one override value or clear the current selection.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className="sm:w-40"
                inputMode="decimal"
                min={0}
                placeholder="Bulk override cost"
                step={0.01}
                type="number"
                value={bulkOverrideValue}
                onChange={(event) => setBulkOverrideValue(event.target.value)}
              />
              <Button
                size="sm"
                type="button"
                disabled={selectedRowKeys.size === 0}
                onClick={applyBulkOverride}
              >
                Apply to selected
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={selectedRowKeys.size === 0}
                onClick={() => clearOverrides("selected")}
              >
                Clear selected
              </Button>
            </div>
          </div>

          {draftRows.length === 0 ? (
            <EmptyState
              title="No SKU rows are available yet"
              description="The current workspace has no inventory snapshot rows or sold-SKU fallback rows to seed the override table."
            />
          ) : filteredRows.length === 0 ? (
            <EmptyState
              title="No SKU rows match the current filter"
              description="Clear the search or switch filters to continue editing overrides."
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSearchValue("")
                    setFilter("all")
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="overflow-x-auto">
                <Table className="min-w-[1100px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          aria-label="Select filtered rows"
                          checked={headerCheckboxState}
                          onCheckedChange={toggleSelectAllFilteredRows}
                        />
                      </TableHead>
                      <TableHead className="min-w-[220px]">Product</TableHead>
                      <TableHead className="min-w-[180px]">Variant</TableHead>
                      <TableHead className="min-w-[140px]">SKU</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Shopify cost</TableHead>
                      <TableHead className="min-w-[170px] text-right">
                        Override cost
                      </TableHead>
                      <TableHead className="text-right">Active cost</TableHead>
                      <TableHead className="text-right">
                        Derived margin
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => {
                      const rowIssue = issueMaps.rowIssues.get(row.rowKey)?.[0]

                      return (
                        <TableRow
                          key={row.id}
                          className={
                            row.missingExactCost ||
                            selectedRowKeys.has(row.rowKey)
                              ? "bg-muted/10"
                              : undefined
                          }
                        >
                          <TableCell>
                            <Checkbox
                              aria-label={`Select ${row.productTitle || row.sku || row.rowKey}`}
                              checked={selectedRowKeys.has(row.rowKey)}
                              onCheckedChange={(checked) =>
                                toggleRowSelected(row.rowKey, checked)
                              }
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {row.productTitle || "Untitled product"}
                          </TableCell>
                          <TableCell>
                            {row.variantTitle || "Default variant"}
                          </TableCell>
                          <TableCell>{row.sku || "Unassigned"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.price !== null
                              ? formatSettingsCurrency(row.price, currency)
                              : "Missing"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.shopifyCost !== null
                              ? formatSettingsCurrency(
                                  row.shopifyCost,
                                  currency
                                )
                              : "Missing"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-1">
                              <Input
                                aria-invalid={rowIssue ? true : undefined}
                                className="max-w-[150px] text-right tabular-nums"
                                inputMode="decimal"
                                min={0}
                                placeholder="Optional override"
                                step={0.01}
                                type="number"
                                value={row.overrideUnitCostInput}
                                onChange={(event) =>
                                  updateDraftRow(row.rowKey, event.target.value)
                                }
                              />
                              {rowIssue ? (
                                <p className="text-xs font-medium text-destructive">
                                  {rowIssue}
                                </p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.activeUnitCost !== null
                              ? formatSettingsCurrency(
                                  row.activeUnitCost,
                                  currency
                                )
                              : "Missing"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatDerivedMargin(row.derivedMarginPct)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {displayedIssues.length > 0 ? (
        <Alert variant="destructive">
          <AlertCircleIcon className="size-4" />
          <AlertTitle>Fix these issues before saving</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-5">
              {displayedIssues.slice(0, 6).map((issue, index) => (
                <li key={`${issue.rowKey ?? issue.field}-${index}`}>
                  <span className="font-medium">
                    {formatIssueLabel(issue)}:
                  </span>{" "}
                  {issue.message}
                </li>
              ))}
              {displayedIssues.length > 6 ? (
                <li>
                  {formatSettingsNumber(displayedIssues.length - 6)} more issues
                  are hidden.
                </li>
              ) : null}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Save Costs</CardTitle>
          <CardDescription>
            This writes <code>cost_settings</code>, replaces{" "}
            <code>sku_costs</code>, and revalidates the existing Overview,
            Shopify Profit, Paid Media, and Settings routes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  initialData.resolvedSettings.source === "cost_settings"
                    ? "secondary"
                    : "outline"
                }
              >
                {initialData.resolvedSettings.source === "cost_settings"
                  ? "Persisting shared table values"
                  : "Creating the first shared settings row"}
              </Badge>
              {initialData.resolvedSettings.updatedAt ? (
                <Badge variant="outline">
                  Last saved{" "}
                  {formatSettingsDateTime(
                    initialData.resolvedSettings.updatedAt
                  )}
                </Badge>
              ) : (
                <Badge variant="outline">Not yet saved</Badge>
              )}
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              SKU-level overrides remain unit-cost based. Active cost prefers
              the override, then Shopify cost, and derived margin stays
              read-only from price and the active cost.
            </p>
          </div>
          <Button
            className="gap-2"
            disabled={isPending || localIssues.length > 0}
            onClick={saveCosts}
          >
            <SaveIcon className="size-4" />
            {isPending ? "Saving costs..." : "Save Costs"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
