import "server-only"

import { AGENT_CONFIG_KEYS, AGENT_TOKEN_KEYS } from "@/lib/agent/constants"
import type {
  AgentProvider,
  AgentWorkspaceSettings,
} from "@/lib/agent/types"
import { executeStatement, queryRows } from "@/lib/db/query"
import { parseConfigEntry } from "@/lib/db/record-parsers"
import {
  decryptSecret,
  encryptSecret,
  nowIso,
} from "@/lib/agent/utils"

type ConfigRow = {
  description?: string
  setting_key?: string
  setting_value?: string
  updated_at?: string
  workspace_id?: string
}

type TokenRow = {
  auth_tag?: string
  ciphertext?: string
  iv?: string
  token_key?: string
  updated_at?: string
  workspace_id?: string
}

const AGENT_PROVIDER_SET = new Set<AgentProvider>(["openai", "anthropic"])

function isAgentProvider(value: string): value is AgentProvider {
  return AGENT_PROVIDER_SET.has(value as AgentProvider)
}

async function upsertConfigEntry(input: {
  workspaceId: string
  settingKey: string
  settingValue: string
  description: string
}) {
  const updatedAt = nowIso()

  await executeStatement(
    `
      INSERT INTO config_entries (
        workspace_id,
        setting_key,
        setting_value,
        description,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id, setting_key)
      DO UPDATE SET
        setting_value = excluded.setting_value,
        description = excluded.description,
        updated_at = excluded.updated_at
    `,
    [
      input.workspaceId,
      input.settingKey,
      input.settingValue,
      input.description,
      updatedAt,
    ]
  )

  return updatedAt
}

async function upsertEncryptedToken(input: {
  workspaceId: string
  tokenKey: string
  value: string
}) {
  const encrypted = encryptSecret(input.value)
  const updatedAt = nowIso()

  await executeStatement(
    `
      INSERT INTO settings_tokens_encrypted (
        workspace_id,
        token_key,
        ciphertext,
        iv,
        auth_tag,
        version,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT (workspace_id, token_key)
      DO UPDATE SET
        ciphertext = excluded.ciphertext,
        iv = excluded.iv,
        auth_tag = excluded.auth_tag,
        updated_at = excluded.updated_at
    `,
    [
      input.workspaceId,
      input.tokenKey,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      updatedAt,
    ]
  )

  return updatedAt
}

export async function loadWorkspaceAgentSettings(
  workspaceId: string
): Promise<AgentWorkspaceSettings> {
  const [configRows, tokenRows] = await Promise.all([
    queryRows<ConfigRow>(
      `
        SELECT workspace_id, setting_key, setting_value, description, updated_at
        FROM config_entries
        WHERE workspace_id = ?
          AND setting_key IN (?, ?, ?)
      `,
      [
        workspaceId,
        AGENT_CONFIG_KEYS.provider,
        AGENT_CONFIG_KEYS.model,
        AGENT_CONFIG_KEYS.businessProfile,
      ],
      { bypassCache: true }
    ),
    queryRows<TokenRow>(
      `
        SELECT workspace_id, token_key, ciphertext, iv, auth_tag, updated_at
        FROM settings_tokens_encrypted
        WHERE workspace_id = ?
          AND token_key IN (?, ?)
      `,
      [
        workspaceId,
        AGENT_TOKEN_KEYS.openai,
        AGENT_TOKEN_KEYS.anthropic,
      ],
      { bypassCache: true }
    ),
  ])

  const configEntries = configRows.map(parseConfigEntry)
  const configMap = Object.fromEntries(
    configEntries.map((entry) => [entry.settingKey, entry.settingValue])
  )
  const provider = String(configMap[AGENT_CONFIG_KEYS.provider] ?? "").trim()
  const updatedAt =
    [
      ...configRows.map((row) => String(row.updated_at ?? "").trim()),
      ...tokenRows.map((row) => String(row.updated_at ?? "").trim()),
    ]
      .filter(Boolean)
      .sort((left, right) => right.localeCompare(left))[0] ?? null

  const apiKeyByProvider: Partial<Record<AgentProvider, string>> = {}
  const hasKeyByProvider: Record<AgentProvider, boolean> = {
    anthropic: false,
    openai: false,
  }

  for (const row of tokenRows) {
    const tokenKey = String(row.token_key ?? "").trim()
    const providerEntry = Object.entries(AGENT_TOKEN_KEYS).find(
      ([, value]) => value === tokenKey
    )?.[0]

    if (!providerEntry || !isAgentProvider(providerEntry)) {
      continue
    }

    hasKeyByProvider[providerEntry] = Boolean(String(row.ciphertext ?? "").trim())

    if (!hasKeyByProvider[providerEntry]) {
      continue
    }

    try {
      apiKeyByProvider[providerEntry] = decryptSecret({
        authTag: String(row.auth_tag ?? ""),
        ciphertext: String(row.ciphertext ?? ""),
        iv: String(row.iv ?? ""),
      })
    } catch {
      apiKeyByProvider[providerEntry] = undefined
    }
  }

  return {
    apiKeyByProvider,
    businessProfile:
      String(configMap[AGENT_CONFIG_KEYS.businessProfile] ?? "").trim(),
    hasKeyByProvider,
    model: String(configMap[AGENT_CONFIG_KEYS.model] ?? "auto").trim() || "auto",
    provider: isAgentProvider(provider) ? provider : null,
    updatedAt,
    workspaceId,
  }
}

export async function saveWorkspaceAgentSettings(input: {
  workspaceId: string
  provider: AgentProvider
  model: string
  businessProfile?: string
  apiKey?: string
}) {
  const updatedAt = await upsertConfigEntry({
    description: "Selected BYOK provider for the EcomDash2 agent.",
    settingKey: AGENT_CONFIG_KEYS.provider,
    settingValue: input.provider,
    workspaceId: input.workspaceId,
  })

  await upsertConfigEntry({
    description: "Selected model id for the EcomDash2 agent. Use auto to resolve a recommended model.",
    settingKey: AGENT_CONFIG_KEYS.model,
    settingValue: String(input.model ?? "auto").trim() || "auto",
    workspaceId: input.workspaceId,
  })

  await upsertConfigEntry({
    description:
      "Optional workspace business brief used to ground the EcomDash2 agent in business context and KPI caveats.",
    settingKey: AGENT_CONFIG_KEYS.businessProfile,
    settingValue: String(input.businessProfile ?? "").trim(),
    workspaceId: input.workspaceId,
  })

  if (String(input.apiKey ?? "").trim()) {
    await upsertEncryptedToken({
      tokenKey: AGENT_TOKEN_KEYS[input.provider],
      value: String(input.apiKey ?? "").trim(),
      workspaceId: input.workspaceId,
    })
  }

  return updatedAt
}

export async function resolveWorkspaceAgentCredential(input: {
  workspaceId: string
  provider?: AgentProvider | null
}) {
  const settings = await loadWorkspaceAgentSettings(input.workspaceId)
  const provider = input.provider ?? settings.provider

  if (!provider) {
    throw new Error("No AI provider is configured for this workspace.")
  }

  const apiKey = settings.apiKeyByProvider[provider]

  if (!apiKey) {
    throw new Error(`No ${provider} API key is configured for this workspace.`)
  }

  return {
    apiKey,
    model: settings.model || "auto",
    provider,
    settings,
  }
}
