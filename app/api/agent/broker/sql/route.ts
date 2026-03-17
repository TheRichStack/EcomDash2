import { runAgentSqlBroker, verifyAgentBrokerToken } from "@/lib/agent/broker"

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
    sql?: string
  }

  if (!payload.capabilities.includes("sql")) {
    return Response.json({ message: "SQL capability is not allowed." }, { status: 403 })
  }

  try {
    return Response.json(
      await runAgentSqlBroker({
        sql: String(body.sql ?? ""),
        workspaceId: payload.workspaceId,
      })
    )
  } catch (error) {
    return Response.json(
      {
        message: error instanceof Error ? error.message : "SQL broker failed.",
      },
      { status: 400 }
    )
  }
}
