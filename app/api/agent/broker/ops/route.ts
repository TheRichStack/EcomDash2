import { AGENT_ALLOWED_OPS } from "@/lib/agent/constants"
import { runAgentOpsBroker, verifyAgentBrokerToken } from "@/lib/agent/broker"

export const dynamic = "force-dynamic"

function readBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? ""
  const [, token] = header.split(/\s+/)
  return token ?? ""
}

export async function POST(request: Request) {
  const token = readBearerToken(request)
  const payload = verifyAgentBrokerToken(token)
  const body = (await request.json()) as {
    op?: string
  }
  const requestedOp = String(body.op ?? "").trim()

  if (!payload.capabilities.includes("ops")) {
    return Response.json({ message: "Ops capability is not allowed." }, { status: 403 })
  }

  if (!requestedOp) {
    return Response.json({ message: "Missing op." }, { status: 400 })
  }

  if (!AGENT_ALLOWED_OPS.includes(requestedOp as (typeof AGENT_ALLOWED_OPS)[number])) {
    return Response.json({ message: `Unknown op "${requestedOp}".` }, { status: 400 })
  }

  if (!payload.allowedOps.includes(requestedOp)) {
    return Response.json(
      { message: `Operation "${requestedOp}" is not permitted by this broker token.` },
      { status: 403 }
    )
  }

  try {
    return Response.json(
      await runAgentOpsBroker({
        op: requestedOp as (typeof AGENT_ALLOWED_OPS)[number],
        workspaceId: payload.workspaceId,
      })
    )
  } catch (error) {
    return Response.json(
      {
        message: error instanceof Error ? error.message : "Ops dispatch failed.",
      },
      { status: 400 }
    )
  }
}
