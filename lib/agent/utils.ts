import crypto from "node:crypto"

type TokenCipherPayload = {
  authTag: string
  ciphertext: string
  iv: string
}

function toBase64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4)
  return Buffer.from(padded, "base64")
}

export function nowIso() {
  return new Date().toISOString()
}

export function generateAgentId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

export function parseJsonRecord(value: string | null | undefined) {
  if (!value) {
    return {} as Record<string, unknown>
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? null)
}

export function compactText(value: string, maxLength = 160) {
  const trimmed = String(value ?? "").trim()

  if (trimmed.length <= maxLength) {
    return trimmed
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

export function getEncryptionKey() {
  const encoded = String(process.env.DATA_ENCRYPTION_KEY ?? "").trim()

  if (!encoded) {
    throw new Error("Missing DATA_ENCRYPTION_KEY.")
  }

  const key = Buffer.from(encoded, "base64")

  if (key.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes.")
  }

  return key
}

export function encryptSecret(plainText: string): TokenCipherPayload {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(String(plainText ?? ""), "utf8"),
    cipher.final(),
  ])

  return {
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
  }
}

export function decryptSecret(payload: TokenCipherPayload) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(payload.iv, "base64")
  )
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"))

  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ])

  return plain.toString("utf8")
}

export function createSignedToken(payload: unknown, secret: string) {
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest()

  return `${encodedPayload}.${toBase64Url(signature)}`
}

export function verifySignedToken<T>(token: string, secret: string): T | null {
  const [encodedPayload, encodedSignature] = String(token ?? "").split(".")

  if (!encodedPayload || !encodedSignature) {
    return null
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest()
  const actual = fromBase64Url(encodedSignature)

  if (expected.length !== actual.length) {
    return null
  }

  if (!crypto.timingSafeEqual(expected, actual)) {
    return null
  }

  try {
    return JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as T
  } catch {
    return null
  }
}

export function signRequestBody(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex")
}

export function verifyRequestBodySignature(
  body: string,
  signature: string,
  secret: string
) {
  const expected = signRequestBody(body, secret)
  const actual = String(signature ?? "")

  if (expected.length !== actual.length) {
    return false
  }

  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(actual, "utf8")
  )
}

export function extractJsonObject<T>(rawText: string): T | null {
  const text = String(rawText ?? "").trim()

  if (!text) {
    return null
  }

  const normalized = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  try {
    return JSON.parse(normalized) as T
  } catch {
    const start = normalized.indexOf("{")
    const end = normalized.lastIndexOf("}")

    if (start === -1 || end === -1 || end <= start) {
      return null
    }

    try {
      return JSON.parse(normalized.slice(start, end + 1)) as T
    } catch {
      return null
    }
  }
}
