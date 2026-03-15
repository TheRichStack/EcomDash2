"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowDownIcon, ArrowUpIcon, RotateCcwIcon, SaveIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import type { EcomDashMetricId } from "@/types/metrics"

import type { SaveMetricSelectionResult } from "../../settings-actions"

const EMPTY_SLOT_VALUE = "__empty__"

type MetricOption = {
  id: EcomDashMetricId
  label: string
  description: string
}

type OverviewPacingEditorProps = {
  workspaceId: string
  currentMetricIds: EcomDashMetricId[]
  defaultMetricIds: EcomDashMetricId[]
  metricOptions: MetricOption[]
  maxRows: number
  savedAtLabel: string | null
  saveAction: (input: {
    workspaceId: string
    metricIds: readonly string[]
  }) => Promise<SaveMetricSelectionResult>
}

function buildSlotMetricIds(
  metricIds: readonly EcomDashMetricId[],
  maxRows: number
) {
  const nextMetricIds = [...metricIds]

  while (nextMetricIds.length < maxRows) {
    nextMetricIds.push("" as EcomDashMetricId)
  }

  return nextMetricIds.slice(0, maxRows)
}

function arraysMatch(
  left: readonly string[],
  right: readonly string[]
) {
  return (
    left.length === right.length &&
    left.every((metricId, index) => metricId === right[index])
  )
}

function formatSavedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatMetricSummary(metricIds: readonly string[], options: MetricOption[]) {
  const summary = metricIds
    .map(
      (metricId) =>
        options.find((option) => option.id === metricId)?.label ?? metricId
    )
    .join(" -> ")

  return summary || "None"
}

export function OverviewPacingEditor({
  workspaceId,
  currentMetricIds,
  defaultMetricIds,
  metricOptions,
  maxRows,
  savedAtLabel,
  saveAction,
}: OverviewPacingEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [slotMetricIds, setSlotMetricIds] = useState(() =>
    buildSlotMetricIds(currentMetricIds, maxRows)
  )
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const currentSlotMetricIds = buildSlotMetricIds(currentMetricIds, maxRows)
  const defaultSlotMetricIds = buildSlotMetricIds(defaultMetricIds, maxRows)
  const selectedMetricIds = slotMetricIds.filter(Boolean) as EcomDashMetricId[]
  const isDirty = !arraysMatch(slotMetricIds, currentSlotMetricIds)

  const handleMetricChange = (slotIndex: number, rawValue: string) => {
    const nextMetricId = rawValue === EMPTY_SLOT_VALUE ? "" : rawValue

    setFeedbackMessage(null)
    setErrorMessage(null)
    setSlotMetricIds((currentMetricIdsState) => {
      const nextMetricIds = [...currentMetricIdsState]
      const existingIndex = nextMetricIds.findIndex(
        (metricId, index) => index !== slotIndex && metricId === nextMetricId
      )

      if (existingIndex >= 0 && nextMetricId) {
        const currentMetricId = nextMetricIds[slotIndex]

        nextMetricIds[slotIndex] = nextMetricId as EcomDashMetricId
        nextMetricIds[existingIndex] = currentMetricId

        return nextMetricIds
      }

      nextMetricIds[slotIndex] = nextMetricId as EcomDashMetricId
      return nextMetricIds
    })
  }

  const moveSlot = (slotIndex: number, direction: -1 | 1) => {
    const nextIndex = slotIndex + direction

    if (nextIndex < 0 || nextIndex >= slotMetricIds.length) {
      return
    }

    setFeedbackMessage(null)
    setErrorMessage(null)
    setSlotMetricIds((currentMetricIdsState) => {
      const nextMetricIds = [...currentMetricIdsState]
      ;[nextMetricIds[slotIndex], nextMetricIds[nextIndex]] = [
        nextMetricIds[nextIndex],
        nextMetricIds[slotIndex],
      ]
      return nextMetricIds
    })
  }

  const clearSlot = (slotIndex: number) => {
    setFeedbackMessage(null)
    setErrorMessage(null)
    setSlotMetricIds((currentMetricIdsState) => {
      const nextMetricIds = [...currentMetricIdsState]
      nextMetricIds[slotIndex] = "" as EcomDashMetricId
      return nextMetricIds
    })
  }

  const handleSave = () => {
    if (!isDirty || selectedMetricIds.length === 0 || isPending) {
      return
    }

    startTransition(() => {
      void (async () => {
        const result = await saveAction({
          workspaceId,
          metricIds: selectedMetricIds,
        })

        if (result.status === "error") {
          setErrorMessage(result.message)
          setFeedbackMessage(null)
          toast.error(result.message)
          return
        }

        setSlotMetricIds(buildSlotMetricIds(result.metricIds, maxRows))
        setErrorMessage(null)
        setFeedbackMessage(
          `Saved overview pacing metrics at ${formatSavedAt(result.updatedAt)}.`
        )
        toast.success("Saved overview pacing metrics.")
        router.refresh()
      })()
    })
  }

  const handleResetToCurrent = () => {
    setSlotMetricIds(currentSlotMetricIds)
    setFeedbackMessage(null)
    setErrorMessage(null)
  }

  const handleUseDefaults = () => {
    setSlotMetricIds(defaultSlotMetricIds)
    setFeedbackMessage(null)
    setErrorMessage(null)
  }

  const statusMessage = (() => {
    if (errorMessage) {
      return errorMessage
    }

    if (isPending) {
      return "Saving overview pacing metrics..."
    }

    if (feedbackMessage) {
      return feedbackMessage
    }

    if (selectedMetricIds.length === 0) {
      return "Select at least one pacing metric before saving."
    }

    if (isDirty) {
      return "Unsaved changes. Only non-empty rows are stored, in top-to-bottom order."
    }

    if (savedAtLabel) {
      return `Saved ${savedAtLabel}.`
    }

    return "Using the current saved pacing selection."
  })()

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          Overview pacing metric selection
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Choose up to {maxRows} ordered pacing rows for the Overview board.
          Empty rows are ignored on save, and target coverage tables below stay
          read-only in this slice.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border bg-muted/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">
              {selectedMetricIds.length} of {maxRows} rows selected
            </p>
            <p className="text-sm text-muted-foreground">
              Selecting an already-used metric swaps rows instead of creating a duplicate.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleResetToCurrent}
              disabled={isPending || !isDirty}
            >
              Reset to current
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleUseDefaults}
              disabled={isPending}
            >
              <RotateCcwIcon data-icon="inline-start" />
              Use defaults
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isDirty || selectedMetricIds.length === 0 || isPending}
            >
              <SaveIcon data-icon="inline-start" />
              Save pacing rows
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-background">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[12%]">Row</TableHead>
                <TableHead className="w-[38%]">Metric</TableHead>
                <TableHead className="w-[32%]">Details</TableHead>
                <TableHead className="w-[18%] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slotMetricIds.map((metricId, index) => {
                const option =
                  metricOptions.find((candidate) => candidate.id === metricId) ?? null

                return (
                  <TableRow key={`overview-pacing-${index + 1}`}>
                    <TableCell className="font-medium">Row {index + 1}</TableCell>
                    <TableCell className="align-top">
                      <Select
                        value={metricId || EMPTY_SLOT_VALUE}
                        onValueChange={(nextMetricId) =>
                          handleMetricChange(index, nextMetricId)
                        }
                      >
                        <SelectTrigger className="w-full min-w-[240px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SLOT_VALUE}>Not used</SelectItem>
                          {metricOptions.map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.id}>
                              {candidate.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="align-top text-sm text-muted-foreground">
                      {option ? (
                        <div className="flex flex-col gap-2">
                          <p>{option.description}</p>
                          <code>{option.id}</code>
                        </div>
                      ) : (
                        <p>This row will not render on the Overview pacing board.</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => moveSlot(index, -1)}
                          disabled={index === 0 || isPending}
                        >
                          <ArrowUpIcon data-icon="inline-start" />
                          Up
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => moveSlot(index, 1)}
                          disabled={index === slotMetricIds.length - 1 || isPending}
                        >
                          <ArrowDownIcon data-icon="inline-start" />
                          Down
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => clearSlot(index)}
                          disabled={!metricId || isPending}
                        >
                          <XIcon data-icon="inline-start" />
                          Clear
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border bg-background p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{statusMessage}</p>
            <p className="text-sm text-muted-foreground">
              Default rows: {formatMetricSummary(defaultMetricIds, metricOptions)}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Current rows: {formatMetricSummary(selectedMetricIds, metricOptions)}
          </p>
        </div>
      </div>
    </section>
  )
}
