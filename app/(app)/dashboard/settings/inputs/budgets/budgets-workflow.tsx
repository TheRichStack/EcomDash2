"use client"

import {
  type HTMLAttributes,
  type ReactNode,
  useMemo,
  useState,
  useTransition,
} from "react"
import { useRouter } from "next/navigation"
import {
  CalendarRangeIcon,
  ClipboardPasteIcon,
  FileUpIcon,
  PlusIcon,
  RefreshCcwIcon,
  SaveIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react"
import { toast } from "sonner"

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import type {
  SavePlanningIssue,
  SavePlanningResult,
} from "@/app/(app)/dashboard/settings/settings-actions"
import {
  formatMonthLabel,
  formatSettingsCurrency,
  formatSettingsDate,
  formatSettingsDateRange,
  formatSettingsNumber,
  getStatusTone,
} from "@/app/(app)/dashboard/settings/settings-utils"
import {
  autoDetectBudgetImportPlan,
  mapBudgetImportRows,
  parseBudgetImportTable,
  type BudgetImportPlan,
} from "@/lib/settings/budget-import"
import {
  buildAnnualBudgetRows,
  buildBudgetPreview,
  buildRepeatedMonthlyBudgetRows,
  deriveBudgetHorizon,
  normalizeBudgetRows,
  parseBudgetNumber,
  type BudgetPlanRow,
} from "@/lib/settings/budget-plan"
import type { BudgetTargetsMeta, TargetsError } from "@/types/backend"

const EMPTY_SELECT = "__none__"

type BudgetDraftRow = {
  id: string
  month: string
  channel: string
  budget: string
  notes: string
}

type BudgetsWorkflowProps = {
  workspaceId: string
  currency: string
  initialRows: BudgetPlanRow[]
  meta: BudgetTargetsMeta | null
  currentIssues: TargetsError[]
  currentCanonicalRowCount: number
  currentEffectiveRowCount: number
  currentCoverageStart: string | null
  currentCoverageEnd: string | null
  saveAction: (input: {
    workspaceId: string
    currency: string
    rows: Array<{
      month?: string
      channel?: string
      budget?: string
      notes?: string
    }>
  }) => Promise<SavePlanningResult>
}

let draftRowCounter = 0

function createDraftRow(partial?: Partial<BudgetDraftRow>): BudgetDraftRow {
  draftRowCounter += 1
  return {
    id: `budget-draft-${draftRowCounter}`,
    month: partial?.month ?? "",
    channel: partial?.channel ?? "",
    budget: partial?.budget ?? "",
    notes: partial?.notes ?? "",
  }
}

function toDraftRows(rows: BudgetPlanRow[]) {
  return rows.map((row) =>
    createDraftRow({
      month: row.month,
      channel: row.channel,
      budget: String(row.budget),
      notes: row.notes,
    })
  )
}

function toActionRows(rows: BudgetDraftRow[]) {
  return rows.map((row) => ({
    month: row.month,
    channel: row.channel,
    budget: row.budget,
    notes: row.notes,
  }))
}

function buildIssueMap(issues: Array<{ row: number; field: string; message: string }>) {
  const map = new Map<string, string[]>()
  for (const issue of issues) {
    const key = `${issue.row}:${issue.field}`
    map.set(key, [...(map.get(key) ?? []), issue.message])
  }
  return map
}

function formatIssueTitle(issue: { row: number; field: string }) {
  return `Row ${issue.row} - ${issue.field}`
}

export function BudgetsWorkflow({
  workspaceId,
  currency,
  initialRows,
  meta,
  currentIssues,
  currentCanonicalRowCount,
  currentEffectiveRowCount,
  currentCoverageStart,
  currentCoverageEnd,
  saveAction,
}: BudgetsWorkflowProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [draftRows, setDraftRows] = useState(() => toDraftRows(initialRows))
  const [manualRow, setManualRow] = useState({
    month: "",
    channel: "",
    budget: "",
    notes: "",
  })
  const [annualGenerator, setAnnualGenerator] = useState({
    year: String(new Date().getUTCFullYear()),
    channel: "Total",
    annualBudget: "",
    notes: "Generated from annual budget",
  })
  const [spanGenerator, setSpanGenerator] = useState({
    startMonth: "",
    endMonth: "",
    channel: "Total",
    monthlyBudget: "",
    notes: "Generated monthly value",
  })
  const [pasteValue, setPasteValue] = useState("")
  const [importPlan, setImportPlan] = useState<BudgetImportPlan | null>(null)
  const [importSourceLabel, setImportSourceLabel] = useState("")
  const [serverIssues, setServerIssues] = useState<SavePlanningIssue[]>([])

  const actionRows = useMemo(() => toActionRows(draftRows), [draftRows])
  const normalizedDraft = useMemo(() => normalizeBudgetRows(actionRows), [actionRows])
  const previewRows = useMemo(
    () => buildBudgetPreview(normalizedDraft.rows),
    [normalizedDraft.rows]
  )
  const previewHorizon = useMemo(
    () => deriveBudgetHorizon(normalizedDraft.rows),
    [normalizedDraft.rows]
  )
  const draftIssueMap = useMemo(
    () => buildIssueMap(normalizedDraft.errors),
    [normalizedDraft.errors]
  )
  const mappedImportRows = useMemo(
    () => (importPlan ? mapBudgetImportRows(importPlan.table, importPlan.mapping) : []),
    [importPlan]
  )
  const importValidation = useMemo(
    () => normalizeBudgetRows(mappedImportRows),
    [mappedImportRows]
  )

  function analyzeImport(text: string, sourceLabel: string) {
    const table = parseBudgetImportTable(text)

    if (!table.headers.length || !table.rows.length) {
      toast.error("No import rows found.")
      setImportPlan(null)
      setImportSourceLabel("")
      return
    }

    setImportPlan(autoDetectBudgetImportPlan(table))
    setImportSourceLabel(sourceLabel)
    toast.success(`Loaded ${formatSettingsNumber(table.rows.length)} import rows.`)
  }

  function appendRows(
    rows: Array<{ month: string; channel: string; budget: string | number; notes: string }>,
    replace = false
  ) {
    const nextRows = rows.map((row) =>
      createDraftRow({
        month: row.month,
        channel: row.channel,
        budget: String(row.budget),
        notes: row.notes,
      })
    )
    setDraftRows((current) => (replace ? nextRows : [...current, ...nextRows]))
    setServerIssues([])
  }

  function applyPlan() {
    startTransition(() => {
      void (async () => {
        const result = await saveAction({
          workspaceId,
          currency,
          rows: actionRows,
        })

        if (result.status === "error") {
          setServerIssues(result.issues)
          toast.error(result.message)
          return
        }

        setServerIssues([])
        toast.success(
          `${result.message} ${formatSettingsNumber(result.savedRowCount)} rows saved.`
        )
        router.refresh()
      })()
    })
  }

  function addManualRow() {
    if (
      !manualRow.month ||
      !manualRow.channel ||
      parseBudgetNumber(manualRow.budget) === null
    ) {
      toast.error("Set month, channel, and a valid budget before adding the row.")
      return
    }

    appendRows([manualRow])
    setManualRow((current) => ({ ...current, month: "", budget: "", notes: "" }))
  }

  function generateAnnualRows() {
    const annualBudget = parseBudgetNumber(annualGenerator.annualBudget)

    if (annualBudget === null) {
      toast.error("Enter a valid annual budget before generating.")
      return
    }

    const rows = buildAnnualBudgetRows(
      Number(annualGenerator.year),
      annualBudget,
      annualGenerator.channel,
      annualGenerator.notes
    )

    if (!rows.length) {
      toast.error("Annual generator inputs are invalid.")
      return
    }

    appendRows(rows)
    toast.success("Generated 12 monthly budget rows.")
  }

  function generateSpanRows() {
    const monthlyBudget = parseBudgetNumber(spanGenerator.monthlyBudget)

    if (monthlyBudget === null) {
      toast.error("Enter a valid monthly budget before generating.")
      return
    }

    const rows = buildRepeatedMonthlyBudgetRows(
      spanGenerator.startMonth,
      spanGenerator.endMonth,
      monthlyBudget,
      spanGenerator.channel,
      spanGenerator.notes
    )

    if (!rows.length) {
      toast.error("Repeated monthly generator inputs are invalid.")
      return
    }

    appendRows(rows)
    toast.success(`Generated ${formatSettingsNumber(rows.length)} monthly budget rows.`)
  }

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Draft rows"
          value={formatSettingsNumber(draftRows.length)}
          description={`${formatSettingsNumber(previewRows.length)} preview months.`}
        />
        <MetricCard
          title="Preview horizon"
          value={
            previewHorizon.horizonStart && previewHorizon.horizonEnd
              ? formatSettingsDateRange(
                  previewHorizon.horizonStart,
                  previewHorizon.horizonEnd
                )
              : "Not set"
          }
          description={`Currency ${currency}.`}
        />
        <MetricCard
          title="Materialized coverage"
          value={
            currentCoverageStart && currentCoverageEnd
              ? formatSettingsDateRange(currentCoverageStart, currentCoverageEnd)
              : "Not applied"
          }
          description={`${formatSettingsNumber(currentEffectiveRowCount)} daily rows, ${formatSettingsNumber(currentCanonicalRowCount)} canonical ranges.`}
        />
        <Card size="sm">
          <CardHeader>
            <CardTitle>Planning status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant={getStatusTone(meta?.validationStatus ?? "")}>
                {meta?.validationStatus || "No status"}
              </Badge>
              {meta?.lastRunResult ? (
                <Badge variant={getStatusTone(meta.lastRunResult)}>
                  {meta.lastRunResult}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {meta?.lastAppliedAt
                ? `Last applied ${formatSettingsDate(meta.lastAppliedAt)}.`
                : "No successful budget apply has been recorded yet."}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileUpIcon className="size-4" />
              Import CSV
            </CardTitle>
            <CardDescription>Upload CSV, TSV, or delimited exports.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                void (async () => analyzeImport(await file.text(), file.name))()
              }}
            />
            <p className="text-sm text-muted-foreground">
              Long and wide shapes are both supported.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardPasteIcon className="size-4" />
              Paste from spreadsheet
            </CardTitle>
            <CardDescription>Paste copied rows, then review the mapping.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              value={pasteValue}
              onChange={(event) => setPasteValue(event.target.value)}
              placeholder="Month,Channel,Budget,Notes"
              className="min-h-36"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => analyzeImport(pasteValue, "Pasted data")}
                disabled={!pasteValue.trim()}
              >
                Analyze pasted rows
              </Button>
              <Button
                variant="ghost"
                onClick={() => setPasteValue("")}
                disabled={!pasteValue}
              >
                Clear paste
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import mapping</CardTitle>
          <CardDescription>
            Map imported columns before adding them to the monthly budget table.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {importPlan ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{importSourceLabel}</Badge>
                <Badge variant="outline">
                  {formatSettingsNumber(importPlan.table.rows.length)} source rows
                </Badge>
                <Badge
                  variant={importPlan.requiresMapping ? "destructive" : "secondary"}
                >
                  {importPlan.requiresMapping ? "Needs mapping" : "Auto-mapped"}
                </Badge>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="grid gap-3">
                  <SelectField
                    label="Import shape"
                    value={importPlan.mapping.shape}
                    onValueChange={(value) =>
                      setImportPlan((current) =>
                        current
                          ? {
                              ...current,
                              mapping: {
                                ...current.mapping,
                                shape: value as "long" | "wide",
                                wideChannelColumns:
                                  value === "wide"
                                    ? current.mapping.wideChannelColumns
                                    : [],
                              },
                            }
                          : current
                      )
                    }
                    options={[
                      { label: "Long rows", value: "long" },
                      { label: "Wide monthly columns", value: "wide" },
                    ]}
                  />
                  <SelectField
                    label="Month column"
                    value={importPlan.mapping.monthColumn}
                    onValueChange={(value) =>
                      setImportPlan((current) =>
                        current
                          ? {
                              ...current,
                              mapping: { ...current.mapping, monthColumn: value },
                            }
                          : current
                      )
                    }
                    options={importPlan.table.headers.map((header) => ({
                      label: header,
                      value: header,
                    }))}
                  />
                  {importPlan.mapping.shape === "long" ? (
                    <>
                      <SelectField
                        label="Budget column"
                        value={importPlan.mapping.budgetColumn}
                        onValueChange={(value) =>
                          setImportPlan((current) =>
                            current
                              ? {
                                  ...current,
                                  mapping: { ...current.mapping, budgetColumn: value },
                                }
                              : current
                          )
                        }
                        options={importPlan.table.headers.map((header) => ({
                          label: header,
                          value: header,
                        }))}
                      />
                      <SelectField
                        label="Channel column"
                        value={importPlan.mapping.channelColumn || EMPTY_SELECT}
                        allowEmpty
                        onValueChange={(value) =>
                          setImportPlan((current) =>
                            current
                              ? {
                                  ...current,
                                  mapping: {
                                    ...current.mapping,
                                    channelColumn:
                                      value === EMPTY_SELECT ? "" : value,
                                  },
                                }
                              : current
                          )
                        }
                        options={importPlan.table.headers.map((header) => ({
                          label: header,
                          value: header,
                        }))}
                      />
                    </>
                  ) : (
                    <div className="grid gap-2">
                      <Label>Wide budget columns</Label>
                      <div className="grid gap-2 rounded-xl border bg-muted/10 p-3">
                        {importPlan.table.headers.map((header) => (
                          <label
                            key={header}
                            className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
                          >
                            <span className="text-sm">{header}</span>
                            <Checkbox
                              checked={importPlan.mapping.wideChannelColumns.includes(
                                header
                              )}
                              onCheckedChange={(checked) =>
                                setImportPlan((current) =>
                                  current
                                    ? {
                                        ...current,
                                        mapping: {
                                          ...current.mapping,
                                          wideChannelColumns: checked === true
                                            ? Array.from(
                                                new Set([
                                                  ...current.mapping.wideChannelColumns,
                                                  header,
                                                ])
                                              )
                                            : current.mapping.wideChannelColumns.filter(
                                                (value) => value !== header
                                              ),
                                        },
                                      }
                                    : current
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <SelectField
                    label="Notes column"
                    value={importPlan.mapping.notesColumn || EMPTY_SELECT}
                    allowEmpty
                    onValueChange={(value) =>
                      setImportPlan((current) =>
                        current
                          ? {
                              ...current,
                              mapping: {
                                ...current.mapping,
                                notesColumn: value === EMPTY_SELECT ? "" : value,
                              },
                            }
                          : current
                      )
                    }
                    options={importPlan.table.headers.map((header) => ({
                      label: header,
                      value: header,
                    }))}
                  />
                </div>

                <div className="grid gap-4">
                  {importPlan.errors.length > 0 ? (
                    <Alert variant="destructive">
                      <AlertTitle>Import mapping needs attention</AlertTitle>
                      <AlertDescription>
                        {importPlan.errors.join(" ")}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {importValidation.errors.length > 0 ? (
                    <Alert variant="destructive">
                      <AlertTitle>Imported rows have validation issues</AlertTitle>
                      <AlertDescription>
                        Fix the mapping before appending rows.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert>
                      <AlertTitle>Mapped import preview</AlertTitle>
                      <AlertDescription>
                        {formatSettingsNumber(importValidation.rows.length)} clean
                        rows are ready to add.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="overflow-x-auto rounded-xl border bg-background">
                    <Table className="min-w-[560px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead>Channel</TableHead>
                          <TableHead className="text-right">Budget</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mappedImportRows.slice(0, 8).map((row, index) => (
                          <TableRow key={`${row.month}-${row.channel}-${index}`}>
                            <TableCell>{row.month}</TableCell>
                            <TableCell>{row.channel || "Total"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.budget}
                            </TableCell>
                            <TableCell className="whitespace-normal text-muted-foreground">
                              {row.notes || "No note"}
                            </TableCell>
                          </TableRow>
                        ))}
                        {!mappedImportRows.length ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-muted-foreground">
                              No mapped rows yet.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => appendRows(mappedImportRows)}
                      disabled={
                        !mappedImportRows.length || importValidation.errors.length > 0
                      }
                    >
                      Append imported rows
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => appendRows(mappedImportRows, true)}
                      disabled={
                        !mappedImportRows.length || importValidation.errors.length > 0
                      }
                    >
                      Replace table with import
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <Alert>
              <AlertTitle>No import loaded</AlertTitle>
              <AlertDescription>
                Upload or paste spreadsheet data to unlock import mapping.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <GeneratorCard
          icon={PlusIcon}
          title="Manual entry"
          description="Add a single month-channel budget row."
        >
          <TextField
            label="Month"
            value={manualRow.month}
            onChange={(value) =>
              setManualRow((current) => ({ ...current, month: value }))
            }
            type="month"
          />
          <TextField
            label="Channel"
            value={manualRow.channel}
            onChange={(value) =>
              setManualRow((current) => ({ ...current, channel: value }))
            }
            placeholder="Meta"
          />
          <TextField
            label="Budget"
            value={manualRow.budget}
            onChange={(value) =>
              setManualRow((current) => ({ ...current, budget: value }))
            }
            inputMode="decimal"
            placeholder="12000"
          />
          <TextField
            label="Notes"
            value={manualRow.notes}
            onChange={(value) =>
              setManualRow((current) => ({ ...current, notes: value }))
            }
            placeholder="Promo launch"
          />
          <Button onClick={addManualRow}>Add row</Button>
        </GeneratorCard>

        <GeneratorCard
          icon={WandSparklesIcon}
          title="Annual split generator"
          description="Split one annual total evenly across 12 months."
        >
          <TextField
            label="Year"
            value={annualGenerator.year}
            onChange={(value) =>
              setAnnualGenerator((current) => ({ ...current, year: value }))
            }
            inputMode="numeric"
          />
          <TextField
            label="Channel"
            value={annualGenerator.channel}
            onChange={(value) =>
              setAnnualGenerator((current) => ({ ...current, channel: value }))
            }
          />
          <TextField
            label="Annual budget"
            value={annualGenerator.annualBudget}
            onChange={(value) =>
              setAnnualGenerator((current) => ({
                ...current,
                annualBudget: value,
              }))
            }
            inputMode="decimal"
          />
          <TextField
            label="Notes"
            value={annualGenerator.notes}
            onChange={(value) =>
              setAnnualGenerator((current) => ({ ...current, notes: value }))
            }
          />
          <Button variant="outline" onClick={generateAnnualRows}>
            Generate 12 rows
          </Button>
        </GeneratorCard>

        <GeneratorCard
          icon={CalendarRangeIcon}
          title="Repeated monthly generator"
          description="Repeat one monthly value across a month range."
        >
          <TextField
            label="Start month"
            value={spanGenerator.startMonth}
            onChange={(value) =>
              setSpanGenerator((current) => ({ ...current, startMonth: value }))
            }
            type="month"
          />
          <TextField
            label="End month"
            value={spanGenerator.endMonth}
            onChange={(value) =>
              setSpanGenerator((current) => ({ ...current, endMonth: value }))
            }
            type="month"
          />
          <TextField
            label="Channel"
            value={spanGenerator.channel}
            onChange={(value) =>
              setSpanGenerator((current) => ({ ...current, channel: value }))
            }
          />
          <TextField
            label="Monthly budget"
            value={spanGenerator.monthlyBudget}
            onChange={(value) =>
              setSpanGenerator((current) => ({
                ...current,
                monthlyBudget: value,
              }))
            }
            inputMode="decimal"
          />
          <Button variant="outline" onClick={generateSpanRows}>
            Generate range
          </Button>
        </GeneratorCard>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Editable monthly budget table</CardTitle>
            <CardDescription>
              Duplicate month-channel lines merge in preview and on apply.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setDraftRows((current) => [...current, createDraftRow()])}
            >
              <PlusIcon className="size-4" />
              Add blank row
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDraftRows(toDraftRows(initialRows))
                setServerIssues([])
              }}
              disabled={isPending}
            >
              <RefreshCcwIcon className="size-4" />
              Reset to saved
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-xl border bg-background">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[18%]">Month</TableHead>
                  <TableHead className="w-[20%]">Channel</TableHead>
                  <TableHead className="w-[18%]">Budget</TableHead>
                  <TableHead className="w-[34%]">Notes</TableHead>
                  <TableHead className="w-[10%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draftRows.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Input
                        type="month"
                        value={row.month}
                        onChange={(event) => {
                          setDraftRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, month: event.target.value }
                                : item
                            )
                          )
                          setServerIssues([])
                        }}
                        className={
                          draftIssueMap.get(`${index + 1}:month`)
                            ? "border-destructive"
                            : ""
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.channel}
                        onChange={(event) => {
                          setDraftRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, channel: event.target.value }
                                : item
                            )
                          )
                          setServerIssues([])
                        }}
                        placeholder="Meta"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.budget}
                        onChange={(event) => {
                          setDraftRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, budget: event.target.value }
                                : item
                            )
                          )
                          setServerIssues([])
                        }}
                        inputMode="decimal"
                        placeholder="0"
                        className={
                          draftIssueMap.get(`${index + 1}:budget`)
                            ? "border-destructive"
                            : ""
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.notes}
                        onChange={(event) => {
                          setDraftRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, notes: event.target.value }
                                : item
                            )
                          )
                          setServerIssues([])
                        }}
                        placeholder="Optional note"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setDraftRows((current) =>
                            current.filter((item) => item.id !== row.id)
                          )
                        }
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!draftRows.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Add a row manually, generate one, or import a spreadsheet
                      to start the plan.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          {normalizedDraft.errors.length > 0 ? (
            <IssueCard
              title="Draft validation"
              description="Fix these row issues before Save and Apply."
              issues={normalizedDraft.errors.map((issue) => ({
                row: issue.row,
                field: issue.field,
                message: issue.message,
                value: issue.value,
                source: "draft" as const,
              }))}
            />
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              Horizon, currency, and rolled-up monthly totals update as you edit.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <PreviewPill
                label="Horizon start"
                value={
                  previewHorizon.horizonStart
                    ? formatSettingsDate(previewHorizon.horizonStart)
                    : "Not set"
                }
              />
              <PreviewPill
                label="Horizon end"
                value={
                  previewHorizon.horizonEnd
                    ? formatSettingsDate(previewHorizon.horizonEnd)
                    : "Not set"
                }
              />
              <PreviewPill label="Currency" value={currency} />
            </div>
            <div className="overflow-x-auto rounded-xl border bg-background">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Channels</TableHead>
                    <TableHead className="text-right">Total budget</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell className="font-medium">
                        {formatMonthLabel(row.month)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatSettingsNumber(row.channelCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatSettingsCurrency(row.totalBudget, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!previewRows.length ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-10 text-center text-muted-foreground"
                      >
                        Preview rows appear once the draft contains at least one
                        valid month and budget.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Save and Apply</CardTitle>
              <CardDescription>
                Budgets write `budget_plan_monthly` and then recompute shared
                target materialization using the current target plan.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    normalizedDraft.errors.length > 0 || serverIssues.length > 0
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {normalizedDraft.errors.length > 0 || serverIssues.length > 0
                    ? "Needs attention"
                    : "Ready to apply"}
                </Badge>
                <Badge variant="outline">
                  {formatSettingsNumber(normalizedDraft.rows.length)} normalized rows
                </Badge>
              </div>
              <Button
                onClick={applyPlan}
                disabled={isPending || draftRows.length === 0}
              >
                <SaveIcon className="size-4" />
                {isPending ? "Saving and applying..." : "Save and Apply"}
              </Button>
              <p className="text-sm text-muted-foreground">
                After a successful apply the route reloads from the existing
                settings loader path.
              </p>
            </CardContent>
          </Card>

          {serverIssues.length > 0 ? (
            <IssueCard
              title="Apply issues"
              description="The server rejected this apply."
              issues={serverIssues.map((issue) => ({
                row: issue.row,
                field: issue.field,
                message: issue.message,
                value: issue.value,
                source: issue.source,
              }))}
            />
          ) : currentIssues.length > 0 ? (
            <IssueCard
              title="Current materialization issues"
              description="These are the latest persisted target materialization errors returned by the loader."
              issues={currentIssues.map((issue) => ({
                row: issue.sourceRow,
                field: issue.field,
                message: issue.message,
                value: issue.value,
                source: "materialization" as const,
              }))}
            />
          ) : (
            <Alert>
              <AlertTitle>No persisted validation issues</AlertTitle>
              <AlertDescription>
                The current materialized target tables do not report any
                validation errors.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string
  value: string
  description: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-lg font-semibold tracking-tight">{value}</p>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function SelectField({
  label,
  value,
  onValueChange,
  options,
  allowEmpty = false,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: Array<{ label: string; value: string }>
  allowEmpty?: boolean
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty ? <SelectItem value={EMPTY_SELECT}>Not used</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  type,
  placeholder,
  inputMode,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"]
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    </div>
  )
}

function GeneratorCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof PlusIcon
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  )
}

function PreviewPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/15 p-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  )
}

function IssueCard({
  title,
  description,
  issues,
}: {
  title: string
  description: string
  issues: Array<{
    row: number
    field: string
    message: string
    value: string
    source: "draft" | "materialization"
  }>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {issues.map((issue, index) => (
          <div
            key={`${issue.row}-${issue.field}-${index}`}
            className="rounded-xl border bg-muted/15 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{formatIssueTitle(issue)}</p>
              <Badge
                variant={issue.source === "draft" ? "outline" : "destructive"}
              >
                {issue.source}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{issue.message}</p>
            {issue.value ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Raw value: {issue.value}
              </p>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
