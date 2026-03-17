import { listAgentPresets } from "@/lib/agent/presets"
import { resolveDashboardSession } from "@/lib/dashboard-session"
import { env } from "@/lib/env"

export const dynamic = "force-dynamic"

export async function GET() {
  await resolveDashboardSession()

  return Response.json({
    presets: listAgentPresets({
      enforceProductionReadiness: env.agent.enforceRunbookReleaseGates,
    }).map((preset) => ({
      defaultMessage: preset.defaultMessage,
      description: preset.description,
      id: preset.id,
      label: preset.label,
      releaseGate: preset.releaseGate,
      titleSeed: preset.titleSeed,
    })),
  })
}
