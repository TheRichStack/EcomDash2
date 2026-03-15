import "server-only"

import { env } from "@/lib/env"
import type { DashboardSession } from "@/types/dashboard"

function resolveWorkspaceMemberships() {
  return env.workspaces.options.length > 0
    ? env.workspaces.options
    : [
        {
          id: "default",
          label: "Default workspace",
        },
      ]
}

export async function resolveDashboardSession(): Promise<DashboardSession> {
  const workspaceMemberships = resolveWorkspaceMemberships()
  const defaultWorkspaceId =
    env.workspaces.defaultId || workspaceMemberships[0]?.id || "default"

  return {
    userId: env.dashboardSession.userId || "local-admin",
    email: env.dashboardSession.email || null,
    role: "admin",
    defaultWorkspaceId,
    workspaceMemberships,
    source: "env-stub",
  }
}
