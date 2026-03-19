export const dynamic = "force-dynamic"

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { validateMcpToken } from "@/lib/mcp/auth"
import { createEcomDashMcpServer } from "@/lib/mcp/server"

async function handleMcpRequest(request: Request): Promise<Response> {
  try {
    validateMcpToken(request)
  } catch {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    const server = createEcomDashMcpServer()
    await server.connect(transport)
    return transport.handleRequest(request)
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request)
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request)
}
