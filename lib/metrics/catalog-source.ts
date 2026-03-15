import "server-only"

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import type {
  MetricCatalogDirection,
  MetricCatalogEntry,
  MetricCatalogImplementationStatus,
  MetricCatalogSource,
  MetricCatalogUnit,
} from "@/types/metrics"

type RawMetricCatalogEntry = {
  id?: unknown
  name?: unknown
  definition_short?: unknown
  unit_type?: unknown
  direction?: unknown
  metric_type?: unknown
  formula_readable?: unknown
  dependencies?: unknown
  sources?: unknown
  aliases?: unknown
  gotchas?: unknown
  notes?: unknown
  used_in_dashboard?: unknown
  is_base?: unknown
  implementation_status?: unknown
  display_order?: unknown
}

const ECOMDASH2_METRIC_DEFINITIONS_DIR = path.resolve(
  process.cwd(),
  "lib",
  "metrics",
  "definitions"
)

let metricsCatalogSourcePromise: Promise<MetricCatalogSource> | null = null

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0)
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback
}

function toNumberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function toBooleanValue(value: unknown): boolean {
  return value === true
}

function toCatalogUnit(value: unknown): MetricCatalogUnit {
  if (
    value === "currency" ||
    value === "count" ||
    value === "ratio" ||
    value === "percent"
  ) {
    return value
  }

  return "unknown"
}

function toCatalogDirection(value: unknown): MetricCatalogDirection {
  if (
    value === "higher_is_better" ||
    value === "lower_is_better" ||
    value === "neutral"
  ) {
    return value
  }

  return "unknown"
}

function toImplementationStatus(
  value: unknown
): MetricCatalogImplementationStatus {
  if (value === "implemented" || value === "placeholder") {
    return value
  }

  return "unknown"
}

function parseMetricCatalogEntry(
  fileName: string,
  contents: string
): MetricCatalogEntry {
  const raw = JSON.parse(contents) as RawMetricCatalogEntry
  const id = toStringValue(raw.id, path.basename(fileName, ".json"))

  return {
    id,
    label: toStringValue(raw.name, id),
    description: toStringValue(raw.definition_short),
    unit: toCatalogUnit(raw.unit_type),
    direction: toCatalogDirection(raw.direction),
    metricType: toStringValue(raw.metric_type),
    formulaReadable: toStringValue(raw.formula_readable),
    dependencies: toStringArray(raw.dependencies),
    sources: toStringArray(raw.sources),
    aliases: toStringArray(raw.aliases),
    gotchas: toStringArray(raw.gotchas),
    notes: toStringValue(raw.notes),
    usedInDashboard: toBooleanValue(raw.used_in_dashboard),
    isBase: toBooleanValue(raw.is_base),
    implementationStatus: toImplementationStatus(raw.implementation_status),
    displayOrder: toNumberValue(raw.display_order),
    sourceFile: fileName,
  }
}

async function loadMetricsCatalogSourceUncached(): Promise<MetricCatalogSource> {
  try {
    const fileNames = (await readdir(ECOMDASH2_METRIC_DEFINITIONS_DIR))
      .filter((fileName) => fileName.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right))

    const entries = await Promise.all(
      fileNames.map(async (fileName) => {
        const filePath = path.join(ECOMDASH2_METRIC_DEFINITIONS_DIR, fileName)
        const contents = await readFile(filePath, "utf8")

        return parseMetricCatalogEntry(fileName, contents)
      })
    )

    entries.sort((left, right) => {
      if (left.displayOrder !== right.displayOrder) {
        return left.displayOrder - right.displayOrder
      }

      return left.label.localeCompare(right.label)
    })

    return {
      status: "ready",
      source: "ecomdash2-definitions",
      completeness: "full-app-owned",
      entries,
      message: "Loaded full metrics catalog from EcomDash2-owned definitions.",
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error loading metric definitions."

    return {
      status: "unavailable",
      source: "ecomdash2-definitions",
      completeness: "none",
      entries: [],
      message: `Unable to load the full EcomDash2 metrics catalog: ${message}`,
    }
  }
}

export async function loadMetricsCatalogSource(): Promise<MetricCatalogSource> {
  if (!metricsCatalogSourcePromise) {
    metricsCatalogSourcePromise = loadMetricsCatalogSourceUncached()
  }

  return metricsCatalogSourcePromise
}
