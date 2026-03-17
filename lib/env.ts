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

function readBooleanEnv(names: readonly string[], fallback = false) {
  const raw = readFirstEnv(names).toLowerCase()

  if (!raw) {
    return fallback
  }

  return raw === "1" || raw === "true" || raw === "yes"
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
  agent: {
    executorUrl: readFirstEnv(["ECOMDASH2_AGENT_EXECUTOR_URL"]),
    enableWorker: readBooleanEnv(["ECOMDASH2_AGENT_ENABLE_WORKER"], false),
    sharedSecret: readFirstEnv([
      "ECOMDASH2_AGENT_SHARED_SECRET",
      "DATA_ENCRYPTION_KEY",
    ]),
    routerModels: {
      openai: readFirstEnv(["ECOMDASH2_AGENT_ROUTER_MODEL_OPENAI"]),
      anthropic: readFirstEnv(["ECOMDASH2_AGENT_ROUTER_MODEL_ANTHROPIC"]),
    },
    defaultModels: {
      openai: readFirstEnv(
        ["ECOMDASH2_AGENT_DEFAULT_OPENAI_MODEL"],
        "gpt-5.4"
      ),
      anthropic: readFirstEnv(
        ["ECOMDASH2_AGENT_DEFAULT_ANTHROPIC_MODEL"],
        "claude-sonnet-4-5"
      ),
    },
    sqlMaxRows: readPositiveIntEnv(["ECOMDASH2_AGENT_SQL_MAX_ROWS"], 500),
    datasetRowLimit: readPositiveIntEnv(
      ["ECOMDASH2_AGENT_DATASET_ROW_LIMIT"],
      200
    ),
    budgetUsdPerDay: readPositiveIntEnv(
      ["ECOMDASH2_AGENT_BUDGET_USD_PER_DAY"],
      5
    ),
    budgetUsdPerMonth: readPositiveIntEnv(
      ["ECOMDASH2_AGENT_BUDGET_USD_PER_MONTH"],
      250
    ),
    labBudgetUsdPerRun: readPositiveIntEnv(
      ["ECOMDASH2_AGENT_LAB_BUDGET_USD_PER_RUN"],
      2
    ),
    allowInlineOps: readBooleanEnv(["ECOMDASH2_AGENT_ALLOW_INLINE_OPS"], false),
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
