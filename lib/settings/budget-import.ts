import { parseBudgetNumber } from "@/lib/settings/budget-plan"

export type BudgetImportShape = "long" | "wide"

export type BudgetImportTable = {
  headers: string[]
  rows: string[][]
  delimiter: string
}

export type BudgetImportMapping = {
  shape: BudgetImportShape
  monthColumn: string
  budgetColumn: string
  channelColumn: string
  notesColumn: string
  wideChannelColumns: string[]
}

export type BudgetImportPlan = {
  table: BudgetImportTable
  mapping: BudgetImportMapping
  requiresMapping: boolean
  errors: string[]
}

const MONTH_ALIASES = new Set([
  "month",
  "monthstart",
  "period",
  "date",
  "monthdate",
  "periodstart",
])

const BUDGET_ALIASES = new Set([
  "budget",
  "adbudget",
  "spendbudget",
  "mediabudget",
  "totalbudget",
  "amount",
  "value",
])

const CHANNEL_ALIASES = new Set([
  "channel",
  "platform",
  "source",
  "network",
  "campaignchannel",
])

const NOTES_ALIASES = new Set(["notes", "note", "comment", "comments", "memo"])

function normalizeHeader(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }

      continue
    }

    if (character === delimiter && !inQuotes) {
      cells.push(current.trim())
      current = ""
      continue
    }

    current += character
  }

  cells.push(current.trim())

  return cells.map((cell) => cell.replace(/^"|"$/g, "").trim())
}

function detectDelimiter(text: string) {
  const firstPopulatedLine =
    String(text ?? "")
      .split(/\r?\n/)
      .find((line) => String(line ?? "").trim()) ?? ""

  const candidates = [
    { delimiter: "\t", count: (firstPopulatedLine.match(/\t/g) ?? []).length },
    { delimiter: ",", count: (firstPopulatedLine.match(/,/g) ?? []).length },
    { delimiter: ";", count: (firstPopulatedLine.match(/;/g) ?? []).length },
  ].sort((left, right) => right.count - left.count)

  return candidates[0]?.count > 0 ? candidates[0].delimiter : ","
}

function findHeaderByAlias(headers: string[], aliases: Set<string>) {
  return headers.find((header) => aliases.has(normalizeHeader(header))) ?? ""
}

function getSampleValues(table: BudgetImportTable, header: string, max = 12) {
  const columnIndex = table.headers.indexOf(header)

  if (columnIndex < 0) {
    return [] as string[]
  }

  const values: string[] = []

  for (const row of table.rows) {
    const value = String(row[columnIndex] ?? "").trim()

    if (!value) {
      continue
    }

    values.push(value)

    if (values.length >= max) {
      break
    }
  }

  return values
}

function isLikelyNumericColumn(table: BudgetImportTable, header: string) {
  const values = getSampleValues(table, header)

  if (!values.length) {
    return false
  }

  const numericCount = values.filter((value) => parseBudgetNumber(value) !== null).length
  return numericCount >= Math.ceil(values.length / 2)
}

function getCellValue(table: BudgetImportTable, row: string[], header: string) {
  const columnIndex = table.headers.indexOf(header)
  return columnIndex >= 0 ? String(row[columnIndex] ?? "").trim() : ""
}

export function parseBudgetImportTable(rawText: string): BudgetImportTable {
  const text = String(rawText ?? "").replace(/\r\n/g, "\n").trim()

  if (!text) {
    return {
      headers: [],
      rows: [],
      delimiter: ",",
    }
  }

  const delimiter = detectDelimiter(text)
  const parsedRows = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => splitDelimitedLine(line, delimiter))

  if (!parsedRows.length) {
    return {
      headers: [],
      rows: [],
      delimiter,
    }
  }

  const width = Math.max(...parsedRows.map((row) => row.length), 0)
  const paddedRows = parsedRows.map((row) => {
    const nextRow = [...row]

    while (nextRow.length < width) {
      nextRow.push("")
    }

    return nextRow
  })

  return {
    headers: paddedRows[0].map((header, index) => header || `column_${index + 1}`),
    rows: paddedRows
      .slice(1)
      .filter((row) => row.some((cell) => String(cell ?? "").trim())),
    delimiter,
  }
}

export function autoDetectBudgetImportPlan(table: BudgetImportTable): BudgetImportPlan {
  const monthColumn = findHeaderByAlias(table.headers, MONTH_ALIASES)
  const budgetColumn = findHeaderByAlias(table.headers, BUDGET_ALIASES)
  const channelColumn = findHeaderByAlias(table.headers, CHANNEL_ALIASES)
  const notesColumn = findHeaderByAlias(table.headers, NOTES_ALIASES)
  const fallbackMonth = monthColumn || table.headers[0] || ""
  const fallbackBudget =
    budgetColumn ||
    table.headers.find(
      (header) => header !== fallbackMonth && isLikelyNumericColumn(table, header)
    ) ||
    ""
  const wideChannelColumns = table.headers.filter(
    (header) =>
      header !== fallbackMonth &&
      header !== notesColumn &&
      header !== channelColumn &&
      isLikelyNumericColumn(table, header)
  )

  let shape: BudgetImportShape = "long"
  let requiresMapping = false
  let errors: string[] = []

  if (!fallbackMonth) {
    requiresMapping = true
    errors = ["Could not identify a month column."]
  }

  if (!fallbackBudget && wideChannelColumns.length > 0) {
    shape = "wide"
  }

  if (shape === "long" && !fallbackBudget) {
    requiresMapping = true
    errors = ["Could not identify a budget column."]
  }

  if (shape === "wide" && !wideChannelColumns.length) {
    requiresMapping = true
    errors = ["Could not identify numeric channel columns for a wide import."]
  }

  return {
    table,
    mapping: {
      shape,
      monthColumn: fallbackMonth,
      budgetColumn: fallbackBudget,
      channelColumn,
      notesColumn,
      wideChannelColumns: shape === "wide" ? wideChannelColumns : [],
    },
    requiresMapping,
    errors,
  }
}

export function mapBudgetImportRows(
  table: BudgetImportTable,
  mapping: BudgetImportMapping
) {
  const mappedRows: Array<{
    month: string
    channel: string
    budget: string
    notes: string
  }> = []

  for (const row of table.rows) {
    const month = getCellValue(table, row, mapping.monthColumn)

    if (!month) {
      continue
    }

    if (mapping.shape === "long") {
      const budget = getCellValue(table, row, mapping.budgetColumn)

      if (!budget) {
        continue
      }

      mappedRows.push({
        month,
        channel: getCellValue(table, row, mapping.channelColumn) || "Total",
        budget,
        notes: getCellValue(table, row, mapping.notesColumn),
      })

      continue
    }

    const notes = getCellValue(table, row, mapping.notesColumn)

    for (const channelColumn of mapping.wideChannelColumns) {
      const budget = getCellValue(table, row, channelColumn)

      if (!budget) {
        continue
      }

      mappedRows.push({
        month,
        channel: channelColumn || "Total",
        budget,
        notes,
      })
    }
  }

  return mappedRows
}
