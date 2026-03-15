import type { ReactNode } from "react"

import { DashboardStateProvider } from "@/hooks/use-dashboard-state"
import type { DashboardSession } from "@/types/dashboard"

import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { PageContainer } from "@/components/layout/page-container"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function AppShell({
  children,
  session,
}: {
  children: ReactNode
  session: DashboardSession
}) {
  return (
    <DashboardStateProvider session={session}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <PageContainer>{children}</PageContainer>
        </SidebarInset>
      </SidebarProvider>
    </DashboardStateProvider>
  )
}
