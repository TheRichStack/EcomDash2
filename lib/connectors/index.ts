import type { AppConnector } from "@/lib/connectors/types"
import { ga4Connector } from "@/lib/connectors/ga4"
import { googleConnector } from "@/lib/connectors/google"
import { klaviyoConnector } from "@/lib/connectors/klaviyo"
import { metaConnector } from "@/lib/connectors/meta"
import { shopifyConnector } from "@/lib/connectors/shopify"
import { tiktokConnector } from "@/lib/connectors/tiktok"

export const CONNECTORS = [
  shopifyConnector,
  metaConnector,
  googleConnector,
  tiktokConnector,
  klaviyoConnector,
  ga4Connector,
] as const satisfies readonly AppConnector[]

export const CONNECTOR_BY_NAME = Object.fromEntries(
  CONNECTORS.map((connector) => [connector.name, connector])
) as Record<string, AppConnector>

export function getConnectorByName(name: string) {
  return CONNECTOR_BY_NAME[String(name ?? "").trim().toLowerCase()] ?? null
}

export function getConnectorsByName(names: readonly string[]) {
  if (names.length === 0) {
    return [...CONNECTORS]
  }

  return names.map((name) => {
    const connector = getConnectorByName(name)

    if (!connector) {
      throw new Error(
        `Unknown connector "${name}". Available: ${CONNECTORS.map((item) => item.name).join(", ")}`
      )
    }

    return connector
  })
}
