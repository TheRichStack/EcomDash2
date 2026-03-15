"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowDownIcon, ArrowUpIcon, RotateCcwIcon, SaveIcon } from "lucide-react"
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

import type { SaveMetricSelectionResult } from "../settings-actions"

type MetricOption = {
  id: EcomDashMetricId
  label: string
  description: string
}

type DashboardKpiStripEditorProps = {
  title: string
  description: string
  workspaceId: string
  currentMetricIds: EcomDashMetricId[]
  defaultMetricIds: EcomDashMetricId[]
  metricOptions: MetricOption[]
  savedAtLabel: string | null
  saveLabel: string
  successMessage: string
  saveAction: (input: {
    workspaceId: string
    metricIds: readonly string[]
  }) => Promise<SaveMetricSelectionResult>
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

function formatMetricSummary(metricIds: readonly string[], options: MetricOption[]) {
  const summary = metricIds
    .map(
      (metricId) =>
        options.find((option) => option.id === metricId)?.label ?? metricId
    )
    .join(" -> ")

  return summary || "None"
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

export function DashboardKpiStripEditor({
  title,
  description,
  workspaceId,
  currentMetricIds,
  defaultMetricIds,
  metricOptions,
  savedAtLabel,
  saveLabel,
  successMessage,
  saveAction,
}: DashboardKpiStripEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [slotMetricIds, setSlotMetricIds] = useState(currentMetricIds)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const isDirty = !arraysMatch(slotMetricIds, currentMetricIds)

  const handleMetricChange = (slotIndex: number, nextMetricId: string) => {
    setFeedbackMessage(null)
    setErrorMessage(null)

    setSlotMetricIds((currentMetricIdsState) => {
      const nextMetricIds = [...currentMetricIdsState]
      const existingIndex = nextMetricIds.findIndex(
        (metricId, index) => index !== slotIndex && metricId === nextMetricId
      )

      if (existingIndex >= 0) {
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

  const handleSave = () => {
    if (!isDirty || isPending) {
      return
    }

    startTransition(() => {
      void (async () => {
        const result = await saveAction({
          workspaceId,
          metricIds: slotMetricIds,
        })

        if (result.status === "error") {
          setErrorMessage(result.message)
          setFeedbackMessage(null)
          toast.error(result.message)
          return
        }

        setSlotMetricIds(result.metricIds)
        setErrorMessage(null)
        setFeedbackMessage(`Saved ${title} at ${formatSavedAt(result.updatedAt)}.`)
        toast.success(successMessage)
        router.refresh()
      })()
    })
  }

  const handleResetToCurrent = () => {
    setSlotMetricIds(currentMetricIds)
    setFeedbackMessage(null)
    setErrorMessage(null)
  }

  const handleUseDefaults = () => {
    setSlotMetricIds(defaultMetricIds)
    setFeedbackMessage(null)
    setErrorMessage(null)
  }

  const statusMessage = (() => {
    if (errorMessage) {
      return errorMessage
    }

    if (isPending) {
      return `Saving ${title.toLowerCase()}...`
    }

    if (feedbackMessage) {
      return feedbackMessage
    }

    if (isDirty) {
      return "Unsaved changes. Slot order is saved exactly as shown."
    }

    if (savedAtLabel) {
      return `Saved ${savedAtLabel}.`
    }

    return "Using the current saved selection."
  })()

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border bg-muted/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Locked {slotMetricIds.length} slots</p>
            <p className="text-sm text-muted-foreground">
              Selecting a metric already used in another row swaps the two slots.
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
            <Button size="sm" onClick={handleSave} disabled={!isDirty || isPending}>
              <SaveIcon data-icon="inline-start" />
              {saveLabel}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-background">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[12%]">Slot</TableHead>
                <TableHead className="w-[38%]">Metric</TableHead>
                <TableHead className="w-[32%]">Metric id</TableHead>
                <TableHead className="w-[18%] text-right">Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slotMetricIds.map((metricId, index) => {
                const option =
                  metricOptions.find((candidate) => candidate.id === metricId) ?? null

                return (
                  <TableRow key={`${title}-${index + 1}`}>
                    <TableCell className="font-medium">Slot {index + 1}</TableCell>
                    <TableCell className="align-top">
                      <Select
                        value={metricId}
                        onValueChange={(nextMetricId) =>
                          handleMetricChange(index, nextMetricId)
                        }
                      >
                        <SelectTrigger className="w-full min-w-[240px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {metricOptions.map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.id}>
                              {candidate.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {option?.description || "No description available."}
                      </p>
                    </TableCell>
                    <TableCell className="align-top text-sm text-muted-foreground">
                      <code>{metricId}</code>
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
              Default order: {formatMetricSummary(defaultMetricIds, metricOptions)}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Current order: {formatMetricSummary(slotMetricIds, metricOptions)}
          </p>
        </div>
      </div>
    </section>
  )
}
