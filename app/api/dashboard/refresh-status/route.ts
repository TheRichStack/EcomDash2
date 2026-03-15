import { env } from "@/lib/env"
import { loadDashboardRefreshStatus } from "@/lib/server/dashboard-refresh-status"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const workspaceId =
    searchParams.get("workspace")?.trim() || env.workspaces.defaultId

  try {
    const status = await loadDashboardRefreshStatus(workspaceId)
    return Response.json(status)
  } catch (error) {
    return Response.json(
      {
        workspaceId,
        lastSuccessfulHourlySyncAt: null,
        lastSuccessfulHourlySyncSource: "unknown",
        hourlyCursorUpdatedAt: null,
        error:
          error instanceof Error ? error.message : "Failed to load refresh status.",
      },
      { status: 500 }
    )
  }
}
