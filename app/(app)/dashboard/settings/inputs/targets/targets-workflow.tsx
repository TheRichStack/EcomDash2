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
import { parseBudgetImportTable } from "@/lib/settings/budget-import"
import { parseBudgetNumber } from "@/lib/settings/budget-plan"
import {
  autoDetectMonthlyTargetImportPlan,
  buildAnnualMonthlyTargetRows,
  buildMonthlyTargetPlanPreview,
  deriveMonthlyTargetPlanHorizon,
  mapMonthlyTargetImportRows,
  normalizeMonthlyTargetPlanRows,
  type MonthlyTargetImportPlan,
  type MonthlyTargetPlanRow,
} from "@/lib/settings/monthly-target-plan"
import type { BudgetTargetsMeta, TargetsError } from "@/types/backend"

const EMPTY_SELECT = "__none__"

type TargetDraftRow = {
  id: string
  month: string
  revenueTarget: string
  profitTarget: string
  notes: string
}

type TargetsWorkflowProps = {
  workspaceId: string
  currency: string
  initialRows: MonthlyTargetPlanRow[]
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
      revenueTarget?: string
      profitTarget?: string
      notes?: string
    }>
  }) => Promise<SavePlanningResult>
}

let targetDraftRowCounter = 0

function createDraftRow(partial?: Partial<TargetDraftRow>): TargetDraftRow {
  targetDraftRowCounter += 1
  return {
    id: `target-draft-${targetDraftRowCounter}`,
    month: partial?.month ?? "",
    revenueTarget: partial?.revenueTarget ?? "",
    profitTarget: partial?.profitTarget ?? "",
    notes: partial?.notes ?? "",
  }
}

function toDraftRows(rows: MonthlyTargetPlanRow[]) {
  return rows.map((row) =>
    createDraftRow({
      month: row.month,
      revenueTarget: row.revenueTarget === null ? "" : String(row.revenueTarget),
      profitTarget: row.profitTarget === null ? "" : String(row.profitTarget),
      notes: row.notes,
    })
  )
}

function toActionRows(rows: TargetDraftRow[]) {
  return rows.map((row) => ({
    month: row.month,
    revenueTarget: row.revenueTarget,
    profitTarget: row.profitTarget,
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

export function TargetsWorkflow({
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
}: TargetsWorkflowProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [draftRows, setDraftRows] = useState(() => toDraftRows(initialRows))
  const [manualRow, setManualRow] = useState({
    month: "",
    revenueTarget: "",
    profitTarget: "",
    notes: "",
  })
  const [annualGenerator, setAnnualGenerator] = useState({
    year: String(new Date().getUTCFullYear()),
    annualRevenueTarget: "",
    annualProfitTarget: "",
    notes: "Generated from annual split",
  })
  const [pasteValue, setPasteValue] = useState("")
  const [importPlan, setImportPlan] = useState<MonthlyTargetImportPlan | null>(null)
  const [importSourceLabel, setImportSourceLabel] = useState("")
  const [serverIssues, setServerIssues] = useState<SavePlanningIssue[]>([])

  const actionRows = useMemo(() => toActionRows(draftRows), [draftRows])
  const normalizedDraft = useMemo(
    () => normalizeMonthlyTargetPlanRows(actionRows),
    [actionRows]
  )
  const previewRows = useMemo(
    () => buildMonthlyTargetPlanPreview(normalizedDraft.rows),
    [normalizedDraft.rows]
  )
  const previewHorizon = useMemo(
    () => deriveMonthlyTargetPlanHorizon(normalizedDraft.rows),
    [normalizedDraft.rows]
  )
  const draftIssueMap = useMemo(
    () => buildIssueMap(normalizedDraft.errors),
    [normalizedDraft.errors]
  )
  const mappedImportRows = useMemo(
    () =>
      importPlan ? mapMonthlyTargetImportRows(importPlan.table, importPlan.mapping) : [],
    [importPlan]
  )
  const importValidation = useMemo(
    () => normalizeMonthlyTargetPlanRows(mappedImportRows),
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

    setImportPlan(autoDetectMonthlyTargetImportPlan(table))
    setImportSourceLabel(sourceLabel)
    toast.success(`Loaded ${formatSettingsNumber(table.rows.length)} import rows.`)
  }

  function appendRows(
    rows: Array<{
      month: string
      revenueTarget?: string | number | null
      profitTarget?: string | number | null
      notes: string
    }>,
    replace = false
  ) {
    const nextRows = rows.map((row) =>
      createDraftRow({
        month: row.month,
        revenueTarget:
          row.revenueTarget === undefined ? "" : String(row.revenueTarget),
        profitTarget:
          row.profitTarget === undefined ? "" : String(row.profitTarget),
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
      (!manualRow.revenueTarget.trim() && !manualRow.profitTarget.trim())
    ) {
      toast.error("Set a month and at least one target value before adding the row.")
      return
    }

    appendRows([manualRow])
    setManualRow((current) => ({
      ...current,
      month: "",
      revenueTarget: "",
      profitTarget: "",
      notes: "",
    }))
  }

  function generateAnnualRows() {
    const annualRevenueTarget = annualGenerator.annualRevenueTarget.trim()
      ? parseBudgetNumber(annualGenerator.annualRevenueTarget)
      : null
    const annualProfitTarget = annualGenerator.annualProfitTarget.trim()
      ? parseBudgetNumber(annualGenerator.annualProfitTarget)
      : null
    const rows = buildAnnualMonthlyTargetRows(
      Number(annualGenerator.year),
      annualRevenueTarget,
      annualProfitTarget,
      annualGenerator.notes
    )

    if (!rows.length) {
      toast.error("Annual generator inputs are invalid.")
      return
    }

    appendRows(rows)
    toast.success("Generated 12 monthly target rows.")
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
                : "No successful targets apply has been recorded yet."}
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
              Revenue and profit columns can be mapped independently.
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
              placeholder="Month,Revenue Target,Profit Target,Notes"
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
            Map incoming columns before adding imported rows into the monthly target table.
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
                  <SelectField
                    label="Revenue target column"
                    value={importPlan.mapping.revenueColumn || EMPTY_SELECT}
                    allowEmpty
                    onValueChange={(value) =>
                      setImportPlan((current) =>
                        current
                          ? {
                              ...current,
                              mapping: {
                                ...current.mapping,
                                revenueColumn: value === EMPTY_SELECT ? "" : value,
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
                  <SelectField
                    label="Profit target column"
                    value={importPlan.mapping.profitColumn || EMPTY_SELECT}
                    allowEmpty
                    onValueChange={(value) =>
                      setImportPlan((current) =>
                        current
                          ? {
                              ...current,
                              mapping: {
                                ...current.mapping,
                                profitColumn: value === EMPTY_SELECT ? "" : value,
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
                    <Table className="min-w-[620px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Revenue target</TableHead>
                          <TableHead className="text-right">Profit target</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mappedImportRows.slice(0, 8).map((row, index) => (
                          <TableRow key={`${row.month}-${index}`}>
                            <TableCell>{row.month}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {String(row.revenueTarget ?? "") || "Not set"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {String(row.profitTarget ?? "") || "Not set"}
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

      <div className="grid gap-4 xl:grid-cols-2">
        <GeneratorCard
          icon={PlusIcon}
          title="Manual entry"
          description="Add a single monthly target row."
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
            label="Revenue target"
            value={manualRow.revenueTarget}
            onChange={(value) =>
              setManualRow((current) => ({ ...current, revenueTarget: value }))
            }
            inputMode="decimal"
            placeholder="120000"
          />
          <TextField
            label="Profit target"
            value={manualRow.profitTarget}
            onChange={(value) =>
              setManualRow((current) => ({ ...current, profitTarget: value }))
            }
            inputMode="decimal"
            placeholder="30000"
          />
          <TextField
            label="Notes"
            value={manualRow.notes}
            onChange={(value) =>
              setManualRow((current) => ({ ...current, notes: value }))
            }
            placeholder="Launch quarter"
          />
          <Button onClick={addManualRow}>Add row</Button>
        </GeneratorCard>

        <GeneratorCard
          icon={WandSparklesIcon}
          title="Annual target generator"
          description="Split annual revenue and profit totals evenly across 12 months."
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
            label="Annual revenue target"
            value={annualGenerator.annualRevenueTarget}
            onChange={(value) =>
              setAnnualGenerator((current) => ({
                ...current,
                annualRevenueTarget: value,
              }))
            }
            inputMode="decimal"
          />
          <TextField
            label="Annual profit target"
            value={annualGenerator.annualProfitTarget}
            onChange={(value) =>
              setAnnualGenerator((current) => ({
                ...current,
                annualProfitTarget: value,
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
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Editable monthly target table</CardTitle>
            <CardDescription>
              Explicit monthly targets stay visible and editable on this route.
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
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[18%]">Month</TableHead>
                  <TableHead className="w-[18%]">Revenue target</TableHead>
                  <TableHead className="w-[18%]">Profit target</TableHead>
                  <TableHead className="w-[36%]">Notes</TableHead>
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
                        value={row.revenueTarget}
                        onChange={(event) => {
                          setDraftRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, revenueTarget: event.target.value }
                                : item
                            )
                          )
                          setServerIssues([])
                        }}
                        inputMode="decimal"
                        placeholder="0"
                        className={
                          draftIssueMap.get(`${index + 1}:revenueTarget`)
                            ? "border-destructive"
                            : ""
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.profitTarget}
                        onChange={(event) => {
                          setDraftRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, profitTarget: event.target.value }
                                : item
                            )
                          )
                          setServerIssues([])
                        }}
                        inputMode="decimal"
                        placeholder="0"
                        className={
                          draftIssueMap.get(`${index + 1}:profitTarget`)
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
                      to start the target plan.
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
              Horizon, currency, and monthly explicit targets update as you edit.
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
              <Table className="min-w-[680px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Revenue target</TableHead>
                    <TableHead className="text-right">Profit target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell className="font-medium">
                        {formatMonthLabel(row.month)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.revenueTarget === null
                          ? "Not set"
                          : formatSettingsCurrency(row.revenueTarget, currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.profitTarget === null
                          ? "Not set"
                          : formatSettingsCurrency(row.profitTarget, currency)}
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
                        valid month and target value.
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
                Targets write the namespaced monthly plan entry and then recompute shared
                target materialization using the current monthly budgets.
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
                Explicit monthly targets override pacing fallback once this apply succeeds.
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
              title="Current validation issues"
              description="These are the latest persisted target validation errors returned by the loader."
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
                The current materialized target tables do not report any validation errors.
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
