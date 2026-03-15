import type { LucideIcon } from "lucide-react"

export type NavItem = {
  title: string
  href: string
  description?: string
  icon: LucideIcon
}

export type AppNavChildItem = {
  title: string
  href: string
  description?: string
  exact?: boolean
}

export type AppNavItem = {
  title: string
  icon: LucideIcon
  href?: string
  description?: string
  exact?: boolean
  matchPrefixes?: string[]
  children?: AppNavChildItem[]
}
