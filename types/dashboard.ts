export type DashboardCompareMode =
  | "none"
  | "previous_period"
  | "previous_year"

export type DashboardWorkspaceOption = {
  id: string
  label: string
}

export type DashboardSession = {
  userId: string
  email: string | null
  role: "admin"
  defaultWorkspaceId: string
  workspaceMemberships: DashboardWorkspaceOption[]
  source: "env-stub"
}

export type DashboardRequestContext = {
  session: DashboardSession
  workspaceId: string
  from: string
  to: string
  compare: DashboardCompareMode
  refresh?: string
  loadedAt?: string
}

export type DashboardStateFields = Omit<DashboardRequestContext, "session">
