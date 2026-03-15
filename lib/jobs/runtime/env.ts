import fs from "node:fs"
import path from "node:path"
import process from "node:process"

export type RuntimeEnv = Record<string, string>
export type ConnectorSupportTablesMode = "owned" | "shared"

type DatabaseConfig = {
  authToken: string
  isConfigured: boolean
  url: string
}

const LOCAL_ENV_FILES = [".env", ".env.local"] as const

function stripWrappedQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function parseEnvFile(content: string): RuntimeEnv {
  const parsed: RuntimeEnv = {}
  let pendingKey = ""
  let pendingQuote = ""
  let pendingValue = ""

  for (const rawLine of content.split(/\r?\n/)) {
    if (pendingKey) {
      pendingValue = `${pendingValue}\n${rawLine}`

      if (rawLine.trimEnd().endsWith(pendingQuote)) {
        parsed[pendingKey] = stripWrappedQuotes(pendingValue.trim())
        pendingKey = ""
        pendingQuote = ""
        pendingValue = ""
      }

      continue
    }

    const line = rawLine.trim()

    if (!line || line.startsWith("#")) {
      continue
    }

    const separatorIndex = line.indexOf("=")

    if (separatorIndex < 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()

    const quote = value[0]

    if ((quote === '"' || quote === "'") && !value.endsWith(quote)) {
      pendingKey = key
      pendingQuote = quote
      pendingValue = value
      continue
    }

    if (key) {
      parsed[key] = stripWrappedQuotes(value)
    }
  }

  if (pendingKey) {
    parsed[pendingKey] = stripWrappedQuotes(pendingValue.trim())
  }

  return parsed
}

function readLocalEnvFiles(cwd: string): RuntimeEnv {
  const merged: RuntimeEnv = {}

  for (const filename of LOCAL_ENV_FILES) {
    const filePath = path.resolve(cwd, filename)

    if (!fs.existsSync(filePath)) {
      continue
    }

    Object.assign(merged, parseEnvFile(fs.readFileSync(filePath, "utf8")))
  }

  return merged
}

function readProcessEnv(): RuntimeEnv {
  return Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : []
    )
  )
}

export function loadRuntimeEnv(cwd = process.cwd()): RuntimeEnv {
  return {
    ...readLocalEnvFiles(cwd),
    ...readProcessEnv(),
  }
}

export function readFirstEnv(
  runtimeEnv: RuntimeEnv,
  names: readonly string[],
  fallback = ""
) {
  for (const name of names) {
    const value = String(runtimeEnv[name] ?? "").trim()

    if (value) {
      return value
    }
  }

  return fallback
}

export function readPositiveIntEnv(
  runtimeEnv: RuntimeEnv,
  names: readonly string[],
  fallback: number
) {
  const parsed = Number(readFirstEnv(runtimeEnv, names))

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export function parseBooleanEnv(value: unknown, fallback = false) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()

  if (!normalized) {
    return fallback
  }

  return normalized === "1" || normalized === "true" || normalized === "yes"
}

export function resolveWorkspaceId(
  runtimeEnv: RuntimeEnv,
  explicitWorkspaceId?: string
) {
  const candidate = String(explicitWorkspaceId ?? "").trim()

  if (candidate) {
    return candidate
  }

  return readFirstEnv(
    runtimeEnv,
    [
      "ECOMDASH2_DEFAULT_WORKSPACE_ID",
      "WORKSPACE_ID_DEFAULT",
      "WORKSPACE_ID",
    ],
    "default"
  )
}

export function isSettingsEnvHydrationEnabled(runtimeEnv: RuntimeEnv) {
  return parseBooleanEnv(runtimeEnv.SETTINGS_ENV_HYDRATE, true)
}

export function resolveSettingsEnvMode(runtimeEnv: RuntimeEnv) {
  const mode = readFirstEnv(runtimeEnv, ["SETTINGS_ENV_MODE"]).toLowerCase()

  return mode === "prefer" ? "prefer" : "fallback"
}

export function resolveConnectorSupportTablesMode(
  runtimeEnv: RuntimeEnv
): ConnectorSupportTablesMode {
  const mode = readFirstEnv(runtimeEnv, ["CONNECTOR_SUPPORT_TABLES"]).toLowerCase()

  return mode === "shared" ? "shared" : "owned"
}

export function areSharedDbSupportTableWritesEnabled(runtimeEnv: RuntimeEnv) {
  return resolveConnectorSupportTablesMode(runtimeEnv) === "shared"
}

export function resolveDatabaseConfig(runtimeEnv: RuntimeEnv): DatabaseConfig {
  const url = readFirstEnv(runtimeEnv, [
    "ECOMDASH2_TURSO_URL",
    "TURSO_DATABASE_URL",
  ])
  const authToken = readFirstEnv(runtimeEnv, [
    "ECOMDASH2_TURSO_AUTH_TOKEN",
    "TURSO_AUTH_TOKEN",
  ])

  return {
    authToken,
    isConfigured: Boolean(url && authToken),
    url,
  }
}
