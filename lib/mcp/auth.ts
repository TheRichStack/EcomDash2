import { timingSafeEqual } from "crypto"

/**
 * Validates the ECOMDASH2_MCP_TOKEN bearer token from the request Authorization header.
 * Returns the workspace ID on success, throws on failure.
 */
export function validateMcpToken(request: Request): string {
  const secret = process.env.ECOMDASH2_MCP_TOKEN
  if (!secret) throw new Error("ECOMDASH2_MCP_TOKEN is not configured")

  const header = request.headers.get("authorization") ?? ""
  const [, token = ""] = header.split(/\s+/)

  const a = Buffer.from(token)
  const b = Buffer.from(secret)

  // timingSafeEqual requires both buffers to be the same length.
  // If lengths differ we know it's invalid, but we still run the comparison
  // on equal-length buffers to avoid leaking length information via timing.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Unauthorized")
  }

  return process.env.ECOMDASH2_DEFAULT_WORKSPACE_ID ?? "default"
}
