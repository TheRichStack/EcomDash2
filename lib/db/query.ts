import "server-only"

import { ECOMDASH2_TABLE_BOUNDARY, type EcomDash2TableKey } from "@/lib/db/boundary"
import { getTursoClient, isTursoConfigured } from "@/lib/db/client"
import { DASHBOARD_READ_CACHE_TTL_MS } from "@/lib/constants"
import { env } from "@/lib/env"

type SqlArgs = ReadonlyArray<unknown>
type SqlRow = Record<string, unknown>
const QUERY_CACHE_MAX_ENTRIES = 200

type QueryRowsOptions = {
  cacheBuster?: string | null
  bypassCache?: boolean
}

type QueryCacheEntry = {
  expiresAt: number
  rows: SqlRow[]
}

const queryCache = new Map<string, QueryCacheEntry>()
const inflightQueries = new Map<string, Promise<SqlRow[]>>()

// Limit policy:
// - `limit: null` means explicitly unbounded
// - a positive numeric `limit` wins when provided
// - bounded date-range reads default to unbounded
// - unscoped reads fall back to env.backend.defaultLimit
function resolveQueryLimit(input: {
  from?: string
  to?: string
  limit?: number | null
}) {
  if (input.limit === null) {
    return null
  }

  const explicitLimit = Number(input.limit)

  if (Number.isFinite(explicitLimit) && explicitLimit > 0) {
    return Math.floor(explicitLimit)
  }

  const hasMeaningfulScope = Boolean(input.from || input.to)

  return hasMeaningfulScope ? null : env.backend.defaultLimit
}

function buildQueryCacheKey(
  sql: string,
  args: SqlArgs,
  options?: QueryRowsOptions
) {
  const normalizedCacheBuster = String(options?.cacheBuster ?? "").trim()

  return JSON.stringify([sql, args, normalizedCacheBuster])
}

function pruneQueryCache(now: number) {
  for (const [cacheKey, entry] of queryCache) {
    if (entry.expiresAt <= now) {
      queryCache.delete(cacheKey)
    }
  }

  if (queryCache.size <= QUERY_CACHE_MAX_ENTRIES) {
    return
  }

  const overflow = queryCache.size - QUERY_CACHE_MAX_ENTRIES
  const oldestKeys = [...queryCache.entries()]
    .sort((left, right) => left[1].expiresAt - right[1].expiresAt)
    .slice(0, overflow)
    .map(([cacheKey]) => cacheKey)

  for (const cacheKey of oldestKeys) {
    queryCache.delete(cacheKey)
  }
}

export function clearQueryRowsCache() {
  queryCache.clear()
  inflightQueries.clear()
}

export async function queryRows<T extends SqlRow>(
  sql: string,
  args: SqlArgs = [],
  options: QueryRowsOptions = {}
): Promise<T[]> {
  if (!isTursoConfigured()) {
    return []
  }

  if (options.bypassCache) {
    const client = await getTursoClient()
    const result = await client.execute({ sql, args })

    return ((result.rows ?? []) as SqlRow[]) as T[]
  }

  const cacheKey = buildQueryCacheKey(sql, args, options)
  const now = Date.now()
  const cachedEntry = queryCache.get(cacheKey)

  if (cachedEntry && cachedEntry.expiresAt > now) {
    return cachedEntry.rows as T[]
  }

  if (inflightQueries.has(cacheKey)) {
    return ((await inflightQueries.get(cacheKey)) ?? []) as T[]
  }

  const queryPromise = (async () => {
    const client = await getTursoClient()
    const result = await client.execute({ sql, args })
    const rows = (result.rows ?? []) as SqlRow[]

    queryCache.set(cacheKey, {
      expiresAt: Date.now() + DASHBOARD_READ_CACHE_TTL_MS,
      rows,
    })
    pruneQueryCache(Date.now())

    return rows
  })()

  inflightQueries.set(cacheKey, queryPromise)

  try {
    return (await queryPromise) as T[]
  } finally {
    inflightQueries.delete(cacheKey)
  }
}

export async function queryFirst<T extends SqlRow>(
  sql: string,
  args: SqlArgs = [],
  options?: QueryRowsOptions
): Promise<T | null> {
  const rows = await queryRows<T>(sql, args, options)
  return rows[0] ?? null
}

export async function executeStatement(
  sql: string,
  args: SqlArgs = []
): Promise<number> {
  if (!isTursoConfigured()) {
    throw new Error(
      "Turso is not configured. Set ECOMDASH2_TURSO_URL and ECOMDASH2_TURSO_AUTH_TOKEN."
    )
  }

  const client = await getTursoClient()
  const result = await client.execute({ sql, args })
  const rowsAffected = result.rowsAffected

  if (typeof rowsAffected === "bigint") {
    clearQueryRowsCache()
    return Number(rowsAffected)
  }

  const affectedRows =
    typeof rowsAffected === "number" && Number.isFinite(rowsAffected)
      ? rowsAffected
      : 0

  clearQueryRowsCache()

  return affectedRows
}

export async function selectRowsFromTable<T extends SqlRow>(
  tableKey: EcomDash2TableKey,
  input: {
    workspaceId: string
    from?: string
    to?: string
    limit?: number | null
    cacheBuster?: string | null
    bypassCache?: boolean
  }
): Promise<T[]> {
  const spec = ECOMDASH2_TABLE_BOUNDARY[tableKey]
  const dateColumn = "dateColumn" in spec ? spec.dateColumn : undefined
  const whereClauses = ["workspace_id = ?"]
  const args: unknown[] = [input.workspaceId]

  if (dateColumn && input.from) {
    whereClauses.push(`${dateColumn} >= ?`)
    args.push(input.from)
  }

  if (dateColumn && input.to) {
    whereClauses.push(`${dateColumn} <= ?`)
    args.push(input.to)
  }

  const limit = resolveQueryLimit(input)

  const sql = `
    SELECT *
    FROM ${spec.tableName}
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY ${spec.orderBy}
    ${limit !== null ? "LIMIT ?" : ""}
  `

  return queryRows<T>(sql, limit !== null ? [...args, limit] : args, {
    cacheBuster: input.cacheBuster,
    bypassCache: input.bypassCache,
  })
}
