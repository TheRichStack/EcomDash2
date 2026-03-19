import type {
  DashboardRequestContext,
  DashboardSession,
  DashboardCompareMode,
} from "@/types/dashboard"

/**
 * Builds a DashboardRequestContext for MCP tool calls.
 * The session is a stub — session fields are not read by tool functions.
 */
export function buildMcpContext(
  workspaceId: string,
  from: string,
  to: string,
  compare?: DashboardCompareMode,
): DashboardRequestContext {
  const session: DashboardSession = {
    userId: "mcp-service",
    email: null,
    role: "admin",
    defaultWorkspaceId: workspaceId,
    workspaceMemberships: [{ id: workspaceId, label: "mcp" }],
    source: "env-stub",
  }

  return {
    session,
    workspaceId,
    from,
    to,
    compare: compare ?? "none",
  }
}
