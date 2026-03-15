import type { JobDatabaseClient, JobSqlStatement } from "@/lib/jobs/runtime/db"

type TableInfoRow = {
  name?: unknown
}

type RowRecord = Record<string, unknown>

type BatchCapableClient = JobDatabaseClient & {
  batch?: (statements: JobSqlStatement[], mode?: "write") => Promise<unknown>
}

function isIdLikeColumn(columnName: string) {
  const key = String(columnName ?? "").trim().toLowerCase()

  if (!key) {
    return false
  }

  return key === "id" || key.endsWith("_id")
}

export function coerce(value: unknown, columnName = ""): number | string {
  if (value === null || value === undefined) {
    return ""
  }

  if (typeof value === "number") {
    return value
  }

  const text = String(value).trim()

  if (!text) {
    return ""
  }

  if (isIdLikeColumn(columnName)) {
    return text
  }

  if (text === "true" || text === "false") {
    return text
  }

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const numberValue = Number(text)

    if (Number.isFinite(numberValue)) {
      return numberValue
    }
  }

  return text
}

export function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim()

  if (!raw) {
    return ""
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10)
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)

  if (slashMatch) {
    const first = Number(slashMatch[1])
    const second = Number(slashMatch[2])
    const year = slashMatch[3]
    let day = first
    let month = second

    if (first <= 12 && second > 12) {
      month = first
      day = second
    }

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }

  const serial = Number(raw)

  if (Number.isFinite(serial) && serial > 1000 && serial < 100000) {
    const ms = Math.round((serial - 25569) * 86400 * 1000)
    const date = new Date(ms)

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10)
    }
  }

  const parsed = new Date(raw)

  if (Number.isNaN(parsed.getTime())) {
    return ""
  }

  return parsed.toISOString().slice(0, 10)
}

export function filterRowsByDate(
  rows: RowRecord[],
  dateField: string,
  from?: string,
  to?: string
) {
  if (!dateField || (!from && !to)) {
    return rows
  }

  return rows.filter((row) => {
    const iso = normalizeDate(row[dateField])

    if (!iso) {
      return false
    }

    if (from && iso < from) {
      return false
    }

    if (to && iso > to) {
      return false
    }

    return true
  })
}

export function normalizeRowsByDateField(
  rows: RowRecord[],
  dateField: string,
  options: {
    dropInvalid?: boolean
  } = {}
) {
  if (!dateField) {
    return rows ?? []
  }

  const dropInvalid = options.dropInvalid ?? true
  const output: RowRecord[] = []

  for (const row of rows ?? []) {
    const iso = normalizeDate(row[dateField])

    if (!iso && dropInvalid) {
      continue
    }

    if (!iso) {
      output.push(row)
      continue
    }

    output.push({
      ...row,
      [dateField]: iso,
    })
  }

  return output
}

export async function getTableColumns(client: JobDatabaseClient, tableName: string) {
  const result = await client.execute(`PRAGMA table_info(${tableName})`)

  return (result.rows ?? []).map((row) => String((row as TableInfoRow).name ?? ""))
}

function buildInsertSql(
  tableName: string,
  columns: string[],
  conflictColumns: string[],
  updateColumns: string[]
) {
  const placeholders = columns.map(() => "?").join(", ")

  if (conflictColumns.length === 0) {
    return `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`
  }

  if (updateColumns.length === 0) {
    return `
      INSERT INTO ${tableName} (${columns.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT (${conflictColumns.join(", ")})
      DO NOTHING
    `
  }

  const updates = updateColumns
    .map((column) => `${column} = excluded.${column}`)
    .join(", ")

  return `
    INSERT INTO ${tableName} (${columns.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT (${conflictColumns.join(", ")})
    DO UPDATE SET ${updates}
  `
}

export async function upsertRows(
  client: JobDatabaseClient,
  tableName: string,
  rows: RowRecord[],
  options: {
    chunkSize?: number
    keyColumns?: string[]
    workspaceId?: string
  } = {}
) {
  if (!rows.length) {
    return { inserted: 0, processed: 0 }
  }

  const tableColumns = await getTableColumns(client, tableName)
  const allowedColumns = new Set(tableColumns)
  const columns = [
    "workspace_id",
    ...Object.keys(rows[0] ?? {}).filter((column) => allowedColumns.has(column)),
  ]

  if (columns.length === 1) {
    return { inserted: 0, processed: 0 }
  }

  const requestedKeyColumns = options.keyColumns ?? []
  const normalizedKeyColumns = Array.from(
    new Set(
      requestedKeyColumns.filter(
        (column) => column && column !== "workspace_id" && columns.includes(column)
      )
    )
  )
  const conflictColumns =
    requestedKeyColumns.length > 0 ? ["workspace_id", ...normalizedKeyColumns] : []
  const updateColumns = columns.filter((column) => !conflictColumns.includes(column))
  const sql = buildInsertSql(tableName, columns, conflictColumns, updateColumns)
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? 500))

  let processed = 0

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const statements: JobSqlStatement[] = chunk.map((row) => ({
      sql,
      args: columns.map((column) =>
        column === "workspace_id"
          ? String(options.workspaceId ?? "")
          : coerce(row[column], column)
      ),
    }))

    const batchClient = client as BatchCapableClient

    if (typeof batchClient.batch === "function") {
      await batchClient.batch(statements, "write")
      processed += statements.length
      continue
    }

    for (const statement of statements) {
      await client.execute(statement)
      processed += 1
    }
  }

  return {
    inserted: processed,
    processed,
  }
}
