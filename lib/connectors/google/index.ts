import { createDirectConnector, readEnv } from "@/lib/connectors/common"
import type { ConnectorConfigStatus, ConnectorContext } from "@/lib/connectors/types"
import type { RuntimeEnv } from "@/lib/jobs/runtime/env"

import {
  pullGoogleBridgeTables,
} from "@/lib/connectors/google/bridge"
import {
  GOOGLE_DIRECT_REQUIRED_ENV_KEYS,
  hasGoogleDirectCredentials,
  pullGoogleDirectTables,
} from "@/lib/connectors/google/direct"

const GOOGLE_BRIDGE_TRANSPORT = "bridge"

function resolveGoogleTransport(runtimeEnv: RuntimeEnv) {
  const transport = readEnv(runtimeEnv, "GOOGLE_ADS_TRANSPORT", "").trim().toLowerCase()

  return transport === GOOGLE_BRIDGE_TRANSPORT ? GOOGLE_BRIDGE_TRANSPORT : "direct"
}

function getGoogleConfigStatus(runtimeEnv: RuntimeEnv): ConnectorConfigStatus {
  if (resolveGoogleTransport(runtimeEnv) === GOOGLE_BRIDGE_TRANSPORT) {
    return {
      configured: true,
      missing: [],
      required: ["GOOGLE_ADS_TRANSPORT"],
    }
  }

  const missing = GOOGLE_DIRECT_REQUIRED_ENV_KEYS.filter(
    (key) => !String(runtimeEnv[key] ?? "").trim()
  )

  return {
    configured: missing.length === 0,
    missing,
    required: [...GOOGLE_DIRECT_REQUIRED_ENV_KEYS],
  }
}

async function pullGoogleTables(ctx: ConnectorContext) {
  if (resolveGoogleTransport(ctx.env) === GOOGLE_BRIDGE_TRANSPORT) {
    return pullGoogleBridgeTables(ctx)
  }

  if (!hasGoogleDirectCredentials(ctx.env)) {
    throw new Error(
      "Google Ads direct API credentials are missing. Set GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_ADS_REFRESH_TOKEN, or explicitly set GOOGLE_ADS_TRANSPORT=bridge for compatibility fallback."
    )
  }

  return pullGoogleDirectTables(ctx)
}

const baseGoogleConnector = createDirectConnector({
  name: "google",
  tableKeys: [
    "RAW_GOOGLE_ADS_DAILY",
    "RAW_GOOGLE_ADS_SEGMENTS_DAILY",
    "BUDGET_HISTORY",
    "FACT_ADS_DAILY",
    "FACT_ADS_SEGMENTS_DAILY",
  ],
  async syncWindow(ctx: ConnectorContext) {
    return pullGoogleTables(ctx)
  },
  async backfillWindow(ctx: ConnectorContext) {
    return pullGoogleTables(ctx)
  },
})

export const googleConnector = {
  ...baseGoogleConnector,
  getConfigStatus(runtimeEnv: RuntimeEnv) {
    return getGoogleConfigStatus(runtimeEnv)
  },
}
