"use client"

import type { ComponentProps } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BoxesIcon,
  ChartNoAxesColumnIcon,
  GaugeIcon,
  HouseIcon,
  RefreshCcwIcon,
  WalletCardsIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useDashboardState } from "@/hooks/use-dashboard-state"
import { ROUTES } from "@/lib/constants"

type SettingsNavItem = {
  label: string
  href: string
  exact?: boolean
  icon: React.ComponentType<ComponentProps<"svg">>
}

const PRIMARY_ITEMS: SettingsNavItem[] = [
  {
    label: "Summary",
    href: ROUTES.settings,
    exact: true,
    icon: HouseIcon,
  },
  {
    label: "Workspace",
    href: ROUTES.settingsWorkspace,
    icon: WalletCardsIcon,
  },
  {
    label: "Dashboard",
    href: ROUTES.settingsDashboard,
    icon: GaugeIcon,
  },
  {
    label: "Metrics",
    href: ROUTES.settingsMetrics,
    icon: ChartNoAxesColumnIcon,
  },
  {
    label: "Syncs",
    href: ROUTES.settingsSyncs,
    icon: RefreshCcwIcon,
  },
]

const INPUT_ITEMS: SettingsNavItem[] = [
  {
    label: "Costs",
    href: ROUTES.settingsInputsCosts,
    icon: BoxesIcon,
  },
  {
    label: "Budgets",
    href: ROUTES.settingsInputsBudgets,
    icon: BoxesIcon,
  },
  {
    label: "Targets",
    href: ROUTES.settingsInputsTargets,
    icon: BoxesIcon,
  },
]

function isActivePath(pathname: string, href: string, exact = false) {
  if (exact) {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavButtons({ items }: { items: SettingsNavItem[] }) {
  const pathname = usePathname()
  const { buildHref } = useDashboardState()

  return (
    <>
      {items.map((item) => {
        const Icon = item.icon
        const isActive = isActivePath(pathname, item.href, item.exact)

        return (
          <Button
            key={item.href}
            asChild
            size="sm"
            variant={isActive ? "secondary" : "outline"}
          >
            <Link href={buildHref(item.href)}>
              <Icon data-icon="inline-start" />
              {item.label}
            </Link>
          </Button>
        )
      })}
    </>
  )
}

export function SettingsNavigation() {
  const { dateLabel, requestContext } = useDashboardState()

  return (
    <div className="rounded-xl border bg-muted/15 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">
            Settings routes
          </p>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Workspace connectivity, dashboard defaults, inputs, the metrics
            catalog, and sync visibility all stay inside the same dashboard
            shell.
          </p>
        </div>
        <Badge variant="outline" className="self-start">
          {requestContext.workspaceId} - {dateLabel}
        </Badge>
      </div>

      <Separator className="my-4" />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <NavButtons items={PRIMARY_ITEMS} />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Inputs
          </p>
          <div className="flex flex-wrap gap-2">
            <NavButtons items={INPUT_ITEMS} />
          </div>
        </div>
      </div>
    </div>
  )
}
