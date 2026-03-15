import type { ReactNode } from "react"

import { AppShell } from "@/components/layout/app-shell"
import { resolveDashboardSession } from "@/lib/dashboard-session"

export default async function AppLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await resolveDashboardSession()

  return <AppShell session={session}>{children}</AppShell>
}
