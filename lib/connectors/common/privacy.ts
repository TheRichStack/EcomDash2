import crypto from "node:crypto"

import type { RuntimeEnv } from "@/lib/jobs/runtime/env"

const HASH_PREFIX = "anon_"

const SHOPIFY_RAW_DROP_FIELDS = new Set([
  "customer_email",
  "billing_city",
  "shipping_city",
  "landing_site",
  "referring_site",
  "note",
])

const SHOPIFY_HASH_FIELDS_BY_TABLE: Record<string, string[]> = {
  FACT_ORDERS: ["customer_id"],
  RAW_SHOPIFY_ORDERS: ["customer_id"],
}

let cachedKeyRaw = ""
let cachedKey: Buffer | null = null

type RowRecord = Record<string, unknown>

function readEncryptionKey(runtimeEnv: RuntimeEnv) {
  const raw = String(runtimeEnv.DATA_ENCRYPTION_KEY ?? "").trim()

  if (!raw) {
    throw new Error(
      "Missing DATA_ENCRYPTION_KEY. It is required to anonymize Shopify customer identifiers."
    )
  }

  if (raw === cachedKeyRaw && cachedKey) {
    return cachedKey
  }

  const decoded = Buffer.from(raw, "base64")

  if (decoded.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.")
  }

  cachedKeyRaw = raw
  cachedKey = decoded

  return decoded
}

export function anonymizeCustomerId(value: unknown, runtimeEnv: RuntimeEnv) {
  const input = String(value ?? "").trim()

  if (!input) {
    return ""
  }

  if (input.startsWith(HASH_PREFIX)) {
    return input
  }

  const digest = crypto
    .createHmac("sha256", readEncryptionKey(runtimeEnv))
    .update(input)
    .digest("hex")
    .slice(0, 32)

  return `${HASH_PREFIX}${digest}`
}

function normalizeRow(row: unknown): RowRecord {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return {}
  }

  return row as RowRecord
}

function withoutKeys(row: RowRecord, keys: Set<string>) {
  const output: RowRecord = {}

  for (const [key, value] of Object.entries(row)) {
    if (keys.has(key)) {
      continue
    }

    output[key] = value
  }

  return output
}

export function sanitizeConnectorRow(
  tableKey: string,
  row: unknown,
  runtimeEnv: RuntimeEnv
) {
  const normalizedTableKey = String(tableKey ?? "").trim().toUpperCase()
  let output = normalizeRow(row)

  if (normalizedTableKey === "RAW_SHOPIFY_ORDERS") {
    output = withoutKeys(output, SHOPIFY_RAW_DROP_FIELDS)
  }

  const hashFields = SHOPIFY_HASH_FIELDS_BY_TABLE[normalizedTableKey] ?? []

  if (hashFields.length === 0) {
    return output
  }

  const hashed = { ...output }

  for (const field of hashFields) {
    if (!Object.prototype.hasOwnProperty.call(hashed, field)) {
      continue
    }

    hashed[field] = anonymizeCustomerId(hashed[field], runtimeEnv)
  }

  return hashed
}

export function sanitizeConnectorRows(
  tableKey: string,
  rows: unknown[],
  runtimeEnv: RuntimeEnv
) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return []
  }

  return rows.map((row) => sanitizeConnectorRow(tableKey, row, runtimeEnv))
}
