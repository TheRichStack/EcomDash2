import {
  HomeIcon,
  LayoutDashboardIcon,
  MailIcon,
  MegaphoneIcon,
  PanelsTopLeftIcon,
  Settings2Icon,
  ShoppingBagIcon,
} from "lucide-react"

import { ROUTES } from "@/lib/constants"
import type { AppNavItem, NavItem } from "@/types/navigation"

export const navItems: NavItem[] = [
  {
    title: "Home",
    href: ROUTES.home,
    description: "EcomDash2 landing placeholder.",
    icon: HomeIcon,
  },
  {
    title: "Dashboard",
    href: ROUTES.dashboard,
    description: "EcomDash2 reporting app shell.",
    icon: LayoutDashboardIcon,
  },
  {
    title: "Component Preview",
    href: ROUTES.previewComponents,
    description: "Visual index for bundled core components.",
    icon: PanelsTopLeftIcon,
  },
]

export const appNavItems: AppNavItem[] = [
  {
    title: "Overview",
    href: ROUTES.dashboard,
    exact: true,
    description: "Store-wide reporting overview.",
    icon: LayoutDashboardIcon,
  },
  {
    title: "Paid Media",
    href: ROUTES.paidMediaAll,
    description: "Cross-channel and platform paid reporting.",
    icon: MegaphoneIcon,
    children: [
      {
        title: "All",
        href: ROUTES.paidMediaAll,
        exact: true,
      },
      {
        title: "Meta",
        href: ROUTES.paidMediaMeta,
      },
      {
        title: "Google",
        href: ROUTES.paidMediaGoogle,
      },
      {
        title: "TikTok",
        href: ROUTES.paidMediaTiktok,
      },
      {
        title: "Creative",
        href: ROUTES.paidMediaCreative,
      },
    ],
  },
  {
    title: "Shopify",
    href: ROUTES.shopifyProfit,
    icon: ShoppingBagIcon,
    description: "Store operations and profit reporting.",
    matchPrefixes: [ROUTES.shopifyRoot],
    children: [
      {
        title: "Profit",
        href: ROUTES.shopifyProfit,
      },
      {
        title: "Products",
        href: ROUTES.shopifyProducts,
      },
      {
        title: "Inventory",
        href: ROUTES.shopifyInventory,
      },
      {
        title: "Funnel",
        href: ROUTES.shopifyFunnel,
      },
    ],
  },
  {
    title: "Email",
    href: ROUTES.email,
    description: "Campaign and flow reporting.",
    icon: MailIcon,
  },
  {
    title: "Settings",
    href: ROUTES.settings,
    description: "Workspace, inputs, metrics, and sync controls.",
    icon: Settings2Icon,
  },
]

export const appRouteTitles: Record<string, string> = {
  [ROUTES.dashboard]: "Overview",
  [ROUTES.paidMediaAll]: "Paid Media",
  [ROUTES.paidMediaMeta]: "Meta",
  [ROUTES.paidMediaGoogle]: "Google",
  [ROUTES.paidMediaTiktok]: "TikTok",
  [ROUTES.paidMediaCreative]: "Creative",
  [ROUTES.shopifyProfit]: "Profit",
  [ROUTES.shopifyProducts]: "Products",
  [ROUTES.shopifyInventory]: "Inventory",
  [ROUTES.shopifyFunnel]: "Funnel",
  [ROUTES.email]: "Email",
  [ROUTES.settings]: "Settings",
  [ROUTES.settingsWorkspace]: "Workspace",
  [ROUTES.settingsDashboard]: "Dashboard",
  [ROUTES.settingsInputsCosts]: "Costs",
  [ROUTES.settingsInputsBudgets]: "Budgets",
  [ROUTES.settingsInputsTargets]: "Targets",
  [ROUTES.settingsMetrics]: "Metrics",
  [ROUTES.settingsSyncs]: "Syncs",
}
