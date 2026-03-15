export type BootstrapDbRole = "source" | "target"

export type BootstrapDbConfig = {
  authToken: string
  authTokenEnvName: string | null
  isConfigured: boolean
  role: BootstrapDbRole
  url: string
  urlEnvName: string | null
}

function readFirstEnv(names: readonly string[]) {
  for (const name of names) {
    const value = String(process.env[name] ?? "").trim()

    if (value) {
      return {
        name,
        value,
      }
    }
  }

  return {
    name: null,
    value: "",
  }
}

export function resolveBootstrapDbConfig(
  role: BootstrapDbRole,
  overrides?: {
    authToken?: string
    url?: string
  }
): BootstrapDbConfig {
  const urlFromEnv = readFirstEnv(
    role === "source"
      ? [
          "ECOMDASH2_SOURCE_TURSO_URL",
          "ECOMDASH2_TURSO_URL",
          "TURSO_DATABASE_URL",
        ]
      : ["ECOMDASH2_TARGET_TURSO_URL"]
  )
  const authTokenFromEnv = readFirstEnv(
    role === "source"
      ? [
          "ECOMDASH2_SOURCE_TURSO_AUTH_TOKEN",
          "ECOMDASH2_TURSO_AUTH_TOKEN",
          "TURSO_AUTH_TOKEN",
        ]
      : ["ECOMDASH2_TARGET_TURSO_AUTH_TOKEN"]
  )
  const url = String(overrides?.url ?? urlFromEnv.value).trim()
  const authToken = String(overrides?.authToken ?? authTokenFromEnv.value).trim()

  return {
    authToken,
    authTokenEnvName: overrides?.authToken ? "cli" : authTokenFromEnv.name,
    isConfigured: Boolean(url && authToken),
    role,
    url,
    urlEnvName: overrides?.url ? "cli" : urlFromEnv.name,
  }
}

export function resolveBootstrapWorkspaceId(explicitWorkspaceId?: string) {
  const workspaceId = String(
    explicitWorkspaceId ??
      process.env.ECOMDASH2_DEFAULT_WORKSPACE_ID ??
      process.env.WORKSPACE_ID_DEFAULT ??
      "default"
  ).trim()

  return workspaceId || "default"
}
