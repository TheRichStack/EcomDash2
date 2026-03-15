import type {
  AppConnector,
  ConnectorConfigStatus,
  ConnectorContext,
  ConnectorResult,
} from "@/lib/connectors/types"
import { sanitizeConnectorRows } from "@/lib/connectors/common/privacy"
import { filterRowsByDate, normalizeRowsByDateField, upsertRows } from "@/lib/connectors/common/rows"
import { resolveTableSpec } from "@/lib/connectors/common/table-specs"
import type { JobDatabaseClient } from "@/lib/jobs/runtime/db"
import type { RuntimeEnv } from "@/lib/jobs/runtime/env"

const DEFAULT_CONNECTOR_TIMEOUT_MS = 120000
const DEFAULT_RETRY_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504])
const DEFAULT_ENABLED_CONNECTORS = [
  "shopify",
  "meta",
  "google",
  "tiktok",
  "klaviyo",
  "ga4",
] as const

type RetryResponse = {
  headers: Headers
  json: Record<string, unknown>
  status: number
}

type ConnectorTables = Record<string, unknown[]>

type CreateDirectConnectorInput = {
  backfillWindow?: (context: ConnectorContext) => Promise<ConnectorProducedPayload>
  name: string
  requiredEnvKeys?: string[]
  syncWindow?: (context: ConnectorContext) => Promise<ConnectorProducedPayload>
  tableKeys?: string[]
}

type CreateStubConnectorInput = {
  name: string
  requiredEnvKeys?: string[]
  stubReason?: string
  tableKeys?: string[]
}

type ConnectorProducedPayload = {
  cursor?: string
  metadata?: Record<string, unknown>
  tables?: ConnectorTables
}

function summarizeBody(body: unknown, maxLength = 500) {
  const text =
    typeof body === "string"
      ? body
      : (() => {
          try {
            return JSON.stringify(body)
          } catch {
            return String(body)
          }
        })()

  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`
}

function buildTimeoutController(timeoutMs: number) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)

  return {
    clear() {
      clearTimeout(id)
    },
    signal: controller.signal,
  }
}

function buildConfigStatus(
  runtimeEnv: RuntimeEnv,
  requiredEnvKeys: readonly string[]
): ConnectorConfigStatus {
  const missing = requiredEnvKeys.filter(
    (key) => !String(runtimeEnv[key] ?? "").trim()
  )

  return {
    configured: missing.length === 0,
    missing,
    required: [...requiredEnvKeys],
  }
}

function buildStubResult(
  context: ConnectorContext,
  tableKeys: readonly string[],
  reason: string
): ConnectorResult {
  return {
    cursor: String(context.to ?? context.cursor ?? ""),
    metadata: {
      reason,
      stubbed: true,
    },
    processed: 0,
    tableCounts: Object.fromEntries(
      tableKeys.map((tableKey) => [resolveTableSpec(tableKey)?.dbTable ?? tableKey, 0])
    ),
  }
}

function normalizeTableKeys(tableKeys: readonly string[]) {
  return Array.from(
    new Set(
      tableKeys
        .map((key) => resolveTableSpec(key)?.dbTable ?? String(key ?? "").trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

function normalizeProducedPayload(raw: ConnectorProducedPayload | null | undefined) {
  const payload = raw && typeof raw === "object" ? raw : {}

  return {
    tables:
      payload.tables && typeof payload.tables === "object" ? (payload.tables as ConnectorTables) : {},
    cursor: String(payload.cursor ?? ""),
    metadata:
      payload.metadata && typeof payload.metadata === "object"
        ? payload.metadata
        : ({} as Record<string, unknown>),
  }
}

export function readEnv(runtimeEnv: RuntimeEnv, key: string, fallback = "") {
  return String(runtimeEnv[key] ?? fallback)
}

export function readRequiredEnv(runtimeEnv: RuntimeEnv, key: string) {
  const value = readEnv(runtimeEnv, key).trim()

  if (!value) {
    throw new Error(`Missing required env key: ${key}`)
  }

  return value
}

export function nowIso() {
  return new Date().toISOString()
}

export function sleep(ms: number) {
  const delay = Number(ms)

  if (!Number.isFinite(delay) || delay <= 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => setTimeout(resolve, Math.floor(delay)))
}

export async function fetchJsonWithRetry(input: {
  body?: BodyInit | null
  headers?: HeadersInit
  label?: string
  method?: string
  retries?: number
  retryDelayMs?: number
  retryStatuses?: ReadonlySet<number> | number[]
  returnMeta?: boolean
  timeoutMs?: number
  url: string
}): Promise<Record<string, unknown> | RetryResponse> {
  const maxAttempts = Math.max(1, Number(input.retries) || 1)
  let lastError = ""

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const timeoutMs =
      Number.isFinite(Number(input.timeoutMs)) && Number(input.timeoutMs) > 0
        ? Math.floor(Number(input.timeoutMs))
        : DEFAULT_CONNECTOR_TIMEOUT_MS
    const timeout = buildTimeoutController(timeoutMs)

    try {
      const response = await fetch(input.url, {
        body: input.body,
        headers: input.headers,
        method: input.method ?? "GET",
        signal: timeout.signal,
      })
      const text = await response.text()
      const json = text ? (JSON.parse(text) as Record<string, unknown>) : {}

      if (!response.ok) {
        const status = Number(response.status)
        const detail = summarizeBody(json.error ?? json.message ?? json ?? text)
        lastError = `${input.label ?? "connector_request"} failed (${status}): ${detail}`
        const retryStatuses = input.retryStatuses ?? DEFAULT_RETRY_STATUSES
        const retryable =
          retryStatuses instanceof Set
            ? retryStatuses.has(status)
            : Array.isArray(retryStatuses)
              ? retryStatuses.includes(status)
              : false

        if (retryable && attempt < maxAttempts) {
          await sleep(input.retryDelayMs ?? 2000)
          continue
        }

        throw new Error(lastError)
      }

      if (!input.returnMeta) {
        return json
      }

      return {
        headers: response.headers,
        json,
        status: Number(response.status || 0),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lastError = `${input.label ?? "connector_request"} failed: ${message}`

      if (attempt >= maxAttempts) {
        throw new Error(lastError)
      }

      await sleep(input.retryDelayMs ?? 2000)
    } finally {
      timeout.clear()
    }
  }

  throw new Error(lastError || `${input.label ?? "connector_request"} failed`)
}

export function isConnectorEnabled(name: string, runtimeEnv: RuntimeEnv) {
  const configured = String(runtimeEnv.CONNECTORS_ENABLED ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  const enabled = configured.length > 0 ? configured : [...DEFAULT_ENABLED_CONNECTORS]

  return enabled.includes(String(name ?? "").trim().toLowerCase())
}

export function isConnectorStrict(runtimeEnv: RuntimeEnv) {
  const normalized = String(runtimeEnv.CONNECTOR_STRICT ?? "")
    .trim()
    .toLowerCase()

  return normalized === "1" || normalized === "true" || normalized === "yes"
}

export function assertConnectorResult(
  connectorName: string,
  result: ConnectorResult
) {
  if (!result || typeof result !== "object") {
    throw new Error(`Connector ${connectorName} returned an invalid result payload.`)
  }

  if (!Number.isFinite(Number(result.processed)) || Number(result.processed) < 0) {
    throw new Error(`Connector ${connectorName} returned an invalid processed count.`)
  }

  if (typeof result.cursor !== "string") {
    throw new Error(`Connector ${connectorName} returned an invalid cursor.`)
  }

  if (!result.tableCounts || typeof result.tableCounts !== "object") {
    throw new Error(`Connector ${connectorName} returned invalid table counts.`)
  }
}

async function ingestConnectorTables(input: {
  client: JobDatabaseClient
  connectorName: string
  env: RuntimeEnv
  from: string
  tableKeys: readonly string[]
  tables: ConnectorTables
  to: string
  workspaceId: string
}) {
  const allowed = new Set(
    input.tableKeys.flatMap((key) => {
      const spec = resolveTableSpec(key)
      const normalized = String(key ?? "").trim()

      return spec
        ? [normalized, spec.tableKey, spec.dbTable, spec.tableKey.toLowerCase()]
        : [normalized]
    })
  )
  const counts: Record<string, number> = {}
  let total = 0

  for (const [tableKey, payload] of Object.entries(input.tables ?? {})) {
    const spec = resolveTableSpec(tableKey)

    if (!spec) {
      throw new Error(`Missing table spec for ${tableKey}`)
    }

    if (
      !allowed.has(tableKey) &&
      !allowed.has(spec.tableKey) &&
      !allowed.has(spec.dbTable) &&
      !allowed.has(spec.tableKey.toLowerCase())
    ) {
      throw new Error(
        `Connector ${input.connectorName} returned unexpected table ${tableKey}`
      )
    }

    if (!Array.isArray(payload)) {
      throw new Error(
        `Connector ${input.connectorName} returned non-array rows for ${tableKey}`
      )
    }

    let rows = sanitizeConnectorRows(spec.tableKey, payload, input.env)

    if (spec.dateField) {
      rows = normalizeRowsByDateField(rows, spec.dateField, {
        dropInvalid: true,
      })
      rows = filterRowsByDate(rows, spec.dateField, input.from, input.to)
    }

    if (!rows.length) {
      counts[spec.dbTable] = 0
      continue
    }

    const upsertResult = await upsertRows(input.client, spec.dbTable, rows, {
      workspaceId: input.workspaceId,
      keyColumns: spec.keyColumns,
      chunkSize: Number(input.env.CONNECTOR_WRITE_CHUNK_SIZE ?? 500),
    })

    counts[spec.dbTable] = upsertResult.processed
    total += upsertResult.processed
  }

  for (const tableKey of input.tableKeys) {
    const spec = resolveTableSpec(tableKey)

    if (spec && !(spec.dbTable in counts)) {
      counts[spec.dbTable] = 0
    }
  }

  return { counts, total }
}

async function runDirectConnectorWindow(
  connectorName: string,
  tableKeys: readonly string[],
  context: ConnectorContext,
  producer: (context: ConnectorContext) => Promise<ConnectorProducedPayload>
) {
  const produced = normalizeProducedPayload(await producer(context))
  const ingest = await ingestConnectorTables({
    connectorName,
    tableKeys,
    client: context.client,
    workspaceId: context.workspaceId,
    from: context.from,
    to: context.to,
    tables: produced.tables,
    env: context.env,
  })
  const result: ConnectorResult = {
    processed: ingest.total,
    cursor: produced.cursor || String(context.to || ""),
    tableCounts: ingest.counts,
    metadata: produced.metadata,
  }

  assertConnectorResult(connectorName, result)

  return result
}

export function createDirectConnector(
  input: CreateDirectConnectorInput
): AppConnector {
  const connectorName = String(input.name ?? "").trim().toLowerCase()
  const rawTableKeys = Array.from(
    new Set((input.tableKeys ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))
  )
  const exposedTableKeys = normalizeTableKeys(rawTableKeys)
  const requiredEnvKeys = Array.from(
    new Set(
      (input.requiredEnvKeys ?? [])
        .map((key) => String(key ?? "").trim())
        .filter(Boolean)
    )
  )

  function getStatus(runtimeEnv: RuntimeEnv) {
    return buildConfigStatus(runtimeEnv, requiredEnvKeys)
  }

  return {
    async backfillWindow(context) {
      const producer = input.backfillWindow ?? input.syncWindow

      if (!producer) {
        throw new Error(
          `Connector ${connectorName} is missing a backfill implementation.`
        )
      }

      return runDirectConnectorWindow(connectorName, rawTableKeys, context, producer)
    },
    getConfigStatus(runtimeEnv) {
      return getStatus(runtimeEnv)
    },
    implemented: true,
    name: connectorName,
    async syncWindow(context) {
      const producer = input.syncWindow ?? input.backfillWindow

      if (!producer) {
        throw new Error(`Connector ${connectorName} is missing a sync implementation.`)
      }

      return runDirectConnectorWindow(connectorName, rawTableKeys, context, producer)
    },
    tableKeys: exposedTableKeys,
  }
}

export function validateConnectorConfigs(
  runtimeEnv: RuntimeEnv,
  connectors: readonly AppConnector[],
  options: {
    strict: boolean
  }
) {
  const enabled: string[] = []
  const failures: Array<{
    connector: string
    missing: string[]
  }> = []
  const stubbed: string[] = []

  for (const connector of connectors) {
    if (!isConnectorEnabled(connector.name, runtimeEnv)) {
      continue
    }

    enabled.push(connector.name)

    if (!connector.implemented) {
      stubbed.push(connector.name)
    }

    const status = connector.getConfigStatus(runtimeEnv)

    if (!status.configured) {
      failures.push({
        connector: connector.name,
        missing: status.missing,
      })
    }
  }

  if (options.strict && failures.length > 0) {
    const detail = failures
      .map((failure) => `${failure.connector}: ${failure.missing.join(", ")}`)
      .join("\n")

    throw new Error(`Missing connector credentials:\n${detail}`)
  }

  return {
    enabled,
    failures,
    stubbed,
  }
}

export function createStubConnector(
  input: CreateStubConnectorInput
): AppConnector {
  const name = String(input.name ?? "").trim().toLowerCase()
  const tableKeys = normalizeTableKeys(input.tableKeys ?? [])
  const requiredEnvKeys = [
    ...new Set((input.requiredEnvKeys ?? []).map((key) => String(key).trim())),
  ]
  const reason =
    String(input.stubReason ?? "").trim() ||
    "Connector implementation is deferred to the next connector-port pass."

  return {
    async backfillWindow(context) {
      const result = buildStubResult(context, tableKeys, reason)
      assertConnectorResult(name, result)
      return result
    },
    getConfigStatus(runtimeEnv) {
      return buildConfigStatus(runtimeEnv, requiredEnvKeys)
    },
    implemented: false,
    name,
    async syncWindow(context) {
      const result = buildStubResult(context, tableKeys, reason)
      assertConnectorResult(name, result)
      return result
    },
    tableKeys,
  }
}
