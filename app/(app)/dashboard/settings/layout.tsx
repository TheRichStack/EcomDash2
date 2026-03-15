import type { ReactNode } from "react"

import { SettingsNavigation } from "./settings-navigation"

export default function SettingsLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SettingsNavigation />
      {children}
    </div>
  )
}
