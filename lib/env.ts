import type { DashboardWorkspaceOption } from "@/types/dashboard"

function readFirstEnv(names: readonly string[], fallback = "") {
  for (const name of names) {
    const value = String(process.env[name] ?? "").trim()
    if (value) {
      return value
    }
  }

  return fallback
}

function readPositiveIntEnv(names: readonly string[], fallback: number) {
  const raw = readFirstEnv(names)
  const parsed = Number(raw)

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function parseWorkspaceOption(entry: string): DashboardWorkspaceOption | null {
  const [rawId, rawLabel] = entry.split(":")
  const id = String(rawId ?? "").trim()

  if (!id) {
    return null
  }

  return {
    id,
    label: String(rawLabel ?? "").trim() || id,
  }
}

function resolveWorkspaceOptions(): DashboardWorkspaceOption[] {
  const configured = readFirstEnv(["ECOMDASH2_WORKSPACE_OPTIONS"])

  if (!configured) {
    return [
      {
        id: readFirstEnv(
          ["ECOMDASH2_DEFAULT_WORKSPACE_ID", "WORKSPACE_ID_DEFAULT"],
          "default"
        ),
        label: readFirstEnv(
          ["ECOMDASH2_DEFAULT_WORKSPACE_LABEL"],
          "Default workspace"
        ),
      },
    ]
  }

  const parsed = configured
    .split(",")
    .map((entry) => parseWorkspaceOption(entry))
    .filter((entry): entry is DashboardWorkspaceOption => entry !== null)

  return parsed.length > 0
    ? parsed
    : [
        {
          id: "default",
          label: "Default workspace",
        },
      ]
}

function resolveBackendSource() {
  const source = readFirstEnv(["ECOMDASH2_BACKEND_SOURCE"], "turso").toLowerCase()

  if (source !== "turso") {
    throw new Error(
      `Unsupported ECOMDASH2_BACKEND_SOURCE="${source}". Expected "turso".`
    )
  }

  return "turso" as const
}

const workspaceOptions = resolveWorkspaceOptions()
const defaultWorkspaceId =
  readFirstEnv(["ECOMDASH2_DEFAULT_WORKSPACE_ID", "WORKSPACE_ID_DEFAULT"]) ||
  workspaceOptions[0]?.id ||
  "default"
const defaultWorkspaceLabel =
  readFirstEnv(["ECOMDASH2_DEFAULT_WORKSPACE_LABEL"]) ||
  workspaceOptions.find((workspace) => workspace.id === defaultWorkspaceId)?.label ||
  "Default workspace"
const tursoUrl = readFirstEnv(["ECOMDASH2_TURSO_URL", "TURSO_DATABASE_URL"])
const tursoAuthToken = readFirstEnv([
  "ECOMDASH2_TURSO_AUTH_TOKEN",
  "TURSO_AUTH_TOKEN",
])

export const env = {
  NEXT_PUBLIC_APP_NAME: readFirstEnv(["NEXT_PUBLIC_APP_NAME"], "EcomDash2"),
  NEXT_PUBLIC_APP_URL: readFirstEnv(
    ["NEXT_PUBLIC_APP_URL"],
    "http://localhost:3000"
  ),
  workspaces: {
    defaultId: defaultWorkspaceId,
    defaultLabel: defaultWorkspaceLabel,
    options: workspaceOptions,
  },
  dashboardSession: {
    userId: readFirstEnv(["ECOMDASH2_SESSION_USER_ID"], "local-admin"),
    email: readFirstEnv(["ECOMDASH2_SESSION_EMAIL"]),
  },
  backend: {
    source: resolveBackendSource(),
    tursoUrl,
    tursoAuthToken,
    defaultCurrency: readFirstEnv(
      ["ECOMDASH2_DEFAULT_CURRENCY", "NEXT_PUBLIC_CURRENCY"],
      "GBP"
    ),
    defaultLimit: readPositiveIntEnv(["ECOMDASH2_DB_DEFAULT_LIMIT"], 25000),
    isConfigured: Boolean(tursoUrl && tursoAuthToken),
  },
} as const
