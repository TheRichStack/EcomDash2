import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import { humanizeToken } from "../settings-utils"

import type { MetricCatalogEntry, MetricDefinition } from "@/types/metrics"

export type MetricLibraryFormulaToken =
  | {
      type: "metric"
      metricId: string
    }
  | {
      type: "operator"
      value: string
    }

export type MetricLibraryProvenance =
  | "source_reported"
  | "derived_internal"
  | "blended_hybrid"
  | "unknown"

export type MetricLibraryEntry = MetricCatalogEntry & {
  formulaTokens: MetricLibraryFormulaToken[]
  provenance: MetricLibraryProvenance
  readableFormulaText: string
  runtimeAvailable: boolean
  searchIndex: string
}

type RawMetricDefinition = {
  formula_readable?: unknown
  formula_tokens?: unknown
  gotchas?: unknown
  notes?: unknown
  provenance?: unknown
}

type RawMetricDefinitionDetails = {
  formulaReadable: string
  formulaTokens: MetricLibraryFormulaToken[]
  gotchas: string[]
  notes: string
  provenance: MetricLibraryProvenance
}

const metricDefinitionDetailsCache = new Map<
  string,
  Promise<RawMetricDefinitionDetails | null>
>()

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
}

function toFormulaTokens(value: unknown): MetricLibraryFormulaToken[] {
  if (!Array.isArray(value)) {
    return []
  }

  const tokens: MetricLibraryFormulaToken[] = []

  for (const token of value) {
    if (!token || typeof token !== "object") {
      continue
    }

    const tokenRecord = token as Record<string, unknown>

    if (
      tokenRecord.type === "metric" &&
      typeof tokenRecord.metric_id === "string" &&
      tokenRecord.metric_id.trim()
    ) {
      tokens.push({
        type: "metric",
        metricId: tokenRecord.metric_id.trim(),
      })
      continue
    }

    if (
      tokenRecord.type === "operator" &&
      typeof tokenRecord.value === "string" &&
      tokenRecord.value.trim()
    ) {
      tokens.push({
        type: "operator",
        value: tokenRecord.value.trim(),
      })
    }
  }

  return tokens
}

function toProvenance(value: unknown): MetricLibraryProvenance {
  if (
    value === "source_reported" ||
    value === "derived_internal" ||
    value === "blended_hybrid"
  ) {
    return value
  }

  return "unknown"
}

function normalizeRuntimeFormulaTokens(
  tokens: MetricDefinition["formulaTokens"]
): MetricLibraryFormulaToken[] {
  return tokens.map((token) => {
    if (token.type === "metric") {
      return {
        type: "metric" as const,
        metricId: token.metricId,
      }
    }

    return {
      type: "operator" as const,
      value: token.value,
    }
  })
}

function formatFormulaExpression(
  tokens: MetricLibraryFormulaToken[],
  labelsById: Map<string, string>
) {
  return tokens
    .map((token) =>
      token.type === "metric"
        ? labelsById.get(token.metricId) ?? humanizeToken(token.metricId)
        : token.value
    )
    .join(" ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
}

function buildReadableFormulaText(input: {
  entry: MetricCatalogEntry
  labelsById: Map<string, string>
  rawFormulaReadable: string
  formulaTokens: MetricLibraryFormulaToken[]
}) {
  const { entry, labelsById, rawFormulaReadable, formulaTokens } = input

  if (formulaTokens.length > 0) {
    return `${entry.label} = ${formatFormulaExpression(formulaTokens, labelsById)}`
  }

  if (rawFormulaReadable) {
    return rawFormulaReadable
  }

  if (entry.formulaReadable) {
    return entry.formulaReadable
  }

  if (entry.isBase) {
    return "Source-reported/base metric."
  }

  return "No formula reported."
}

function buildSearchIndex(input: {
  entry: MetricCatalogEntry
  gotchas: string[]
  labelsById: Map<string, string>
  provenance: MetricLibraryProvenance
  readableFormulaText: string
}) {
  const { entry, gotchas, labelsById, provenance, readableFormulaText } = input
  const dependencyLabels = entry.dependencies.map(
    (dependencyId) => labelsById.get(dependencyId) ?? humanizeToken(dependencyId)
  )

  return [
    entry.id,
    entry.label,
    entry.description,
    entry.metricType,
    entry.formulaReadable,
    readableFormulaText,
    provenance,
    entry.notes,
    ...entry.aliases,
    ...entry.dependencies,
    ...dependencyLabels,
    ...entry.sources,
    ...gotchas,
  ]
    .join(" ")
    .trim()
    .toLowerCase()
}

async function readMetricDefinitionDetails(
  sourceFile: string
): Promise<RawMetricDefinitionDetails | null> {
  if (!metricDefinitionDetailsCache.has(sourceFile)) {
    metricDefinitionDetailsCache.set(
      sourceFile,
      (async () => {
        try {
          const filePath = path.resolve(
            process.cwd(),
            "lib",
            "metrics",
            "definitions",
            sourceFile
          )
          const contents = await readFile(filePath, "utf8")
          const raw = JSON.parse(contents) as RawMetricDefinition

          return {
            formulaReadable: toStringValue(raw.formula_readable),
            formulaTokens: toFormulaTokens(raw.formula_tokens),
            gotchas: toStringArray(raw.gotchas),
            notes: toStringValue(raw.notes),
            provenance: toProvenance(raw.provenance),
          }
        } catch {
          return null
        }
      })()
    )
  }

  return (await metricDefinitionDetailsCache.get(sourceFile)) ?? null
}

export async function buildMetricsLibraryEntries(input: {
  catalogEntries: MetricCatalogEntry[]
  runtimeRegistry: MetricDefinition[]
}): Promise<MetricLibraryEntry[]> {
  const { catalogEntries, runtimeRegistry } = input
  const runtimeById = new Map<string, MetricDefinition>()
  const labelsById = new Map<string, string>()

  for (const entry of catalogEntries) {
    labelsById.set(entry.id, entry.label)
  }

  for (const metric of runtimeRegistry) {
    runtimeById.set(metric.id, metric)

    if (!labelsById.has(metric.id)) {
      labelsById.set(metric.id, metric.label)
    }
  }

  const rawDetailsEntries = await Promise.all(
    catalogEntries.map(
      async (entry) =>
        [
          entry.id,
          await readMetricDefinitionDetails(entry.sourceFile),
        ] as const
    )
  )
  const rawDetailsById = new Map(rawDetailsEntries)

  return catalogEntries.map((entry) => {
    const runtimeMetric = runtimeById.get(entry.id)
    const rawDetails = rawDetailsById.get(entry.id)
    const formulaTokens =
      rawDetails?.formulaTokens.length
        ? rawDetails.formulaTokens
        : runtimeMetric
          ? normalizeRuntimeFormulaTokens(runtimeMetric.formulaTokens)
          : []
    const gotchas = entry.gotchas.length ? entry.gotchas : rawDetails?.gotchas ?? []
    const notes =
      entry.notes || rawDetails?.notes || runtimeMetric?.notes || ""
    const provenance = rawDetails?.provenance ?? "unknown"
    const readableFormulaText = buildReadableFormulaText({
      entry,
      labelsById,
      rawFormulaReadable: rawDetails?.formulaReadable ?? "",
      formulaTokens,
    })

    return {
      ...entry,
      gotchas,
      notes,
      formulaTokens,
      provenance,
      readableFormulaText,
      runtimeAvailable: Boolean(runtimeMetric),
      searchIndex: buildSearchIndex({
        entry: {
          ...entry,
          gotchas,
          notes,
        },
        gotchas,
        labelsById,
        provenance,
        readableFormulaText,
      }),
    }
  })
}
