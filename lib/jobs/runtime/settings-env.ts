import crypto from "node:crypto"

import type { JobDatabaseClient } from "@/lib/jobs/runtime/db"
import type { RuntimeEnv } from "@/lib/jobs/runtime/env"

type ConfigEntryRow = {
  setting_key?: unknown
  setting_value?: unknown
}

type TokenEntryRow = {
  auth_tag?: unknown
  ciphertext?: unknown
  iv?: unknown
  token_key?: unknown
}

export type SettingsEnvOverrides = {
  loadedConfigKeys: number
  loadedTokenKeys: number
  overrides: RuntimeEnv
  skippedTokenKeys: string[]
}

function getEncryptionKey(runtimeEnv: RuntimeEnv) {
  const encoded = String(runtimeEnv.DATA_ENCRYPTION_KEY ?? "").trim()

  if (!encoded) {
    throw new Error(
      "Missing DATA_ENCRYPTION_KEY. It is required to decrypt settings token values."
    )
  }

  const key = Buffer.from(encoded, "base64")

  if (key.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes.")
  }

  return key
}

function decryptTokenRow(row: TokenEntryRow, runtimeEnv: RuntimeEnv) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(runtimeEnv),
    Buffer.from(String(row.iv ?? ""), "base64")
  )

  decipher.setAuthTag(Buffer.from(String(row.auth_tag ?? ""), "base64"))

  const plain = Buffer.concat([
    decipher.update(Buffer.from(String(row.ciphertext ?? ""), "base64")),
    decipher.final(),
  ])

  return plain.toString("utf8")
}

function shouldSetKey(
  baseEnv: RuntimeEnv,
  key: string,
  preferSettings: boolean
) {
  if (preferSettings) {
    return true
  }

  return !String(baseEnv[key] ?? "").trim()
}

export async function loadSettingsEnvOverrides(
  client: JobDatabaseClient,
  workspaceId: string,
  baseEnv: RuntimeEnv,
  options: {
    preferSettings?: boolean
  } = {}
): Promise<SettingsEnvOverrides> {
  const preferSettings = Boolean(options.preferSettings)
  const result: SettingsEnvOverrides = {
    loadedConfigKeys: 0,
    loadedTokenKeys: 0,
    overrides: {},
    skippedTokenKeys: [],
  }

  const configResult = await client.execute({
    args: [workspaceId],
    sql: `
      SELECT setting_key, setting_value
      FROM config_entries
      WHERE workspace_id = ?
      ORDER BY setting_key ASC
    `,
  })

  for (const row of (configResult.rows ?? []) as ConfigEntryRow[]) {
    const key = String(row.setting_key ?? "").trim()

    if (!key || !shouldSetKey(baseEnv, key, preferSettings)) {
      continue
    }

    result.overrides[key] = String(row.setting_value ?? "")
    result.loadedConfigKeys += 1
  }

  const tokenResult = await client.execute({
    args: [workspaceId],
    sql: `
      SELECT token_key, ciphertext, iv, auth_tag
      FROM settings_tokens_encrypted
      WHERE workspace_id = ?
      ORDER BY token_key ASC
    `,
  })

  for (const row of (tokenResult.rows ?? []) as TokenEntryRow[]) {
    const key = String(row.token_key ?? "").trim()

    if (!key || !shouldSetKey(baseEnv, key, preferSettings)) {
      continue
    }

    try {
      result.overrides[key] = decryptTokenRow(row, baseEnv)
      result.loadedTokenKeys += 1
    } catch {
      result.skippedTokenKeys.push(key)
    }
  }

  return result
}
