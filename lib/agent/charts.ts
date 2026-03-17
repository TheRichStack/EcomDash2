import "server-only"

import type { AgentChartSpec, AgentToolResult } from "@/lib/agent/types"

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
] as const

function asRecordArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null
  )
}

function readNumber(
  row: Record<string, unknown>,
  keys: readonly string[]
): number | null {
  for (const key of keys) {
    const value = row[key]

    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function readString(
  row: Record<string, unknown>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const value = String(row[key] ?? "").trim()

    if (value) {
      return value
    }
  }

  return null
}

function trimLabel(value: string, limit = 28) {
  const normalized = value.replace(/\s+/g, " ").trim()

  if (normalized.length <= limit) {
    return normalized
  }

  return `${normalized.slice(0, limit - 1).trimEnd()}…`
}

function buildPaidMediaChart(result: AgentToolResult): AgentChartSpec | null {
  const rows = asRecordArray(result.data.channelSummary)
    .map((row) => ({
      attributedRevenue: readNumber(row, ["attributedRevenue", "revenue"]),
      label: readString(row, ["platform", "channel", "name"]),
      spend: readNumber(row, ["spend", "adSpend"]),
    }))
    .filter((row) => row.label && (row.spend !== null || row.attributedRevenue !== null))
    .slice(0, 5)

  if (rows.length === 0) {
    return null
  }

  return {
    description: "Spend versus attributed revenue by channel in the current scope.",
    id: "paid-media-channel-mix",
    kind: "bar",
    rows: rows.map((row) => ({
      attributedRevenue: row.attributedRevenue ?? 0,
      label: trimLabel(String(row.label)),
      spend: row.spend ?? 0,
    })),
    series: [
      {
        color: CHART_COLORS[1],
        format: "currency",
        key: "spend",
        label: "Spend",
      },
      {
        color: CHART_COLORS[3],
        format: "currency",
        key: "attributedRevenue",
        label: "Attributed revenue",
      },
    ],
    title: "Paid media by channel",
    xKey: "label",
  }
}

function buildProductChart(result: AgentToolResult): AgentChartSpec | null {
  const matchingRows = asRecordArray(result.data.matchingProducts)
  const topRows = asRecordArray(result.data.topProducts)
  const sourceRows = (matchingRows.length > 0 ? matchingRows : topRows)
    .map((row) => ({
      label: readString(row, ["product", "sku", "variant"]),
      qtySold: readNumber(row, ["qtySold", "unitsSold"]),
    }))
    .filter((row) => row.label && row.qtySold !== null)
    .slice(0, 6)

  if (sourceRows.length === 0) {
    return null
  }

  return {
    description:
      matchingRows.length > 0
        ? "Units sold for the matched products in the requested scope."
        : "Top-selling products by units sold in the requested scope.",
    id: matchingRows.length > 0 ? "matched-product-units" : "top-product-units",
    kind: "bar",
    rows: sourceRows.map((row) => ({
      label: trimLabel(String(row.label)),
      qtySold: row.qtySold ?? 0,
    })),
    series: [
      {
        color: CHART_COLORS[0],
        format: "number",
        key: "qtySold",
        label: "Units sold",
      },
    ],
    title: matchingRows.length > 0 ? "Matched product units" : "Top product units",
    xKey: "label",
  }
}

function buildAnomalyChart(result: AgentToolResult): AgentChartSpec | null {
  const signals = asRecordArray(result.data.signals)

  if (signals.length === 0) {
    return null
  }

  const byCategory = new Map<string, number>()

  for (const signal of signals) {
    const category = readString(signal, ["category"]) ?? "other"
    byCategory.set(category, Number(byCategory.get(category) ?? 0) + 1)
  }

  const rows = Array.from(byCategory.entries())
    .map(([category, count]) => ({
      count,
      label: trimLabel(category.replace(/_/g, " "), 18),
    }))
    .sort((left, right) => right.count - left.count)

  if (rows.length === 0) {
    return null
  }

  return {
    description: "How many anomaly signals triggered in each category.",
    id: "anomaly-signal-counts",
    kind: "bar",
    rows,
    series: [
      {
        color: CHART_COLORS[2],
        format: "number",
        key: "count",
        label: "Signals",
      },
    ],
    title: "Anomaly signal count",
    xKey: "label",
  }
}

export function buildAgentCharts(toolResults: AgentToolResult[]) {
  const charts: AgentChartSpec[] = []

  for (const result of toolResults) {
    let chart: AgentChartSpec | null = null

    switch (result.name) {
      case "paid_media_summary":
        chart = buildPaidMediaChart(result)
        break
      case "product_performance":
        chart = buildProductChart(result)
        break
      case "anomaly_scan":
        chart = buildAnomalyChart(result)
        break
      default:
        chart = null
        break
    }

    if (chart) {
      charts.push(chart)
    }

    if (charts.length >= 2) {
      break
    }
  }

  return charts
}
