import {
  buildBrokerDashboardContext,
  runAgentDatasetBroker,
  verifyAgentBrokerToken,
} from "@/lib/agent/broker"
import type { AgentDashboardContext } from "@/lib/agent/types"
import { resolveDashboardSession } from "@/lib/dashboard-session"

export const dynamic = "force-dynamic"

function readBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? ""
  const [, token] = header.split(/\s+/)
  return token ?? ""
}

export async function POST(request: Request) {
  const session = await resolveDashboardSession()
  const token = readBearerToken(request)
  const payload = verifyAgentBrokerToken(token)
  const body = (await request.json()) as {
    context?: AgentDashboardContext
    dataset?: string
  }

  if (!payload.capabilities.includes("datasets")) {
    return Response.json({ message: "Dataset capability is not allowed." }, { status: 403 })
  }

  if (payload.workspaceId !== body.context?.workspaceId) {
    return Response.json({ message: "Workspace mismatch." }, { status: 403 })
  }

  const context = buildBrokerDashboardContext({
    dashboardContext: body.context ?? {
      compare: "previous_period",
      from: "",
      to: "",
      workspaceId: payload.workspaceId,
    },
    session,
  })

  return Response.json(
    await runAgentDatasetBroker({
      context,
      dataset: String(body.dataset ?? "").trim(),
    })
  )
}
