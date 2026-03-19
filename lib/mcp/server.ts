import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { getMcpToolDefinitions } from "./tools"

/**
 * Creates and returns a configured McpServer with all 14 EcomDash2 data tools registered.
 *
 * The workspace ID is resolved from ECOMDASH2_DEFAULT_WORKSPACE_ID at call time.
 * The SDK does not pass workspace context through the tool handler extra argument,
 * so it is read from the environment inside each handler closure via buildMcpContext.
 */
export function createEcomDashMcpServer(): McpServer {
  const server = new McpServer({ name: "EcomDash2", version: "1.0.0" })

  const workspaceId = process.env.ECOMDASH2_DEFAULT_WORKSPACE_ID ?? "default"

  for (const tool of getMcpToolDefinitions()) {
    // Use the deprecated-but-stable tool(name, description, schema, cb) overload.
    // Verified against @modelcontextprotocol/sdk@1.27.1 types — this overload is present.
    server.tool(
      tool.name,
      tool.description,
      tool.schema,
      async (args) => tool.handler(args, workspaceId),
    )
  }

  return server
}
