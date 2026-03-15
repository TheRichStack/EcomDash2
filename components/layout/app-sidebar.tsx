"use client"

import { useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useDashboardState } from "@/hooks/use-dashboard-state"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { appNavItems } from "@/config/nav"
import { siteConfig } from "@/config/site"

function isPathActive(pathname: string, href: string, exact = false) {
  if (exact) {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppSidebar() {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()
  const { buildHref, dateLabel, requestContext, workspaceOptions } =
    useDashboardState()
  const activeWorkspace =
    workspaceOptions.find(
      (workspace) => workspace.id === requestContext.workspaceId
    ) ?? workspaceOptions[0]

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }, [isMobile, pathname, setOpenMobile])

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href={buildHref("/dashboard")}>
                <Image
                  src="/logo-mark.svg"
                  alt={`${siteConfig.name} logo`}
                  width={32}
                  height={32}
                  className="size-8"
                />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {siteConfig.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Reporting dashboard
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>App Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {appNavItems.map((item) => {
                const Icon = item.icon
                const isActiveItem =
                  (item.href
                    ? isPathActive(pathname, item.href, item.exact)
                    : false) ||
                  item.children?.some((child) =>
                    isPathActive(pathname, child.href, child.exact)
                  ) ||
                  item.matchPrefixes?.some((prefix) =>
                    isPathActive(pathname, prefix)
                  )

                return (
                  <SidebarMenuItem key={item.title}>
                    {item.href ? (
                      <SidebarMenuButton
                        asChild
                        isActive={isActiveItem}
                        tooltip={item.title}
                      >
                        <Link href={buildHref(item.href)}>
                          <Icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton isActive={isActiveItem}>
                        <Icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    )}

                    {item.children?.length ? (
                      <SidebarMenuSub>
                        {item.children.map((child) => (
                          <SidebarMenuSubItem key={child.href}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isPathActive(
                                pathname,
                                child.href,
                                child.exact
                              )}
                            >
                              <Link href={buildHref(child.href)}>
                                <span>{child.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <div className="rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 py-2 text-xs text-sidebar-foreground/80">
          <p className="font-medium text-sidebar-foreground">
            Shared dashboard state
          </p>
          <p className="mt-1 truncate">
            {activeWorkspace?.label ?? requestContext.workspaceId}
            {" · "}
            {dateLabel}
          </p>
          <p className="mt-1 truncate text-sidebar-foreground/65">
            Compare: {requestContext.compare.replace("_", " ")}
          </p>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
