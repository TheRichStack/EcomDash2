"use client"

import {
  Suspense,
  createContext,
  startTransition,
  useContext,
  type ReactNode,
} from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import {
  applyDashboardStateToSearchParams,
  buildDashboardHref,
  formatDashboardDateRangeLabel,
  getDashboardDatePresets,
  getDashboardWorkspaceOptions,
  resolveDashboardRequestContext,
} from "@/lib/dashboard-state"
import type {
  DashboardRequestContext,
  DashboardSession,
  DashboardStateFields,
} from "@/types/dashboard"

type DashboardStateContextValue = {
  requestContext: DashboardRequestContext
  dateLabel: string
  workspaceOptions: DashboardSession["workspaceMemberships"]
  buildHref: (href: string) => string
  setState: (nextState: Partial<DashboardStateFields>) => void
  datePresets: ReturnType<typeof getDashboardDatePresets>
}

const DashboardStateContext =
  createContext<DashboardStateContextValue | null>(null)

type DashboardStateProviderProps = {
  session: DashboardSession
  children: ReactNode
}

function DashboardStateContextProvider({
  children,
  requestContext,
  session,
  setState,
}: DashboardStateProviderProps & {
  requestContext: DashboardRequestContext
  setState: (nextState: Partial<DashboardStateFields>) => void
}) {
  const workspaceOptions = getDashboardWorkspaceOptions(
    session,
    requestContext.workspaceId
  )
  const dateLabel = formatDashboardDateRangeLabel(
    requestContext.from,
    requestContext.to
  )
  const datePresets = getDashboardDatePresets()

  return (
    <DashboardStateContext.Provider
      value={{
        requestContext,
        dateLabel,
        workspaceOptions,
        buildHref: (href) => buildDashboardHref(href, requestContext),
        setState,
        datePresets,
      }}
    >
      {children}
    </DashboardStateContext.Provider>
  )
}

function DashboardStateProviderFallback({
  children,
  session,
}: DashboardStateProviderProps) {
  const requestContext = resolveDashboardRequestContext({ session })

  return (
    <DashboardStateContextProvider
      session={session}
      requestContext={requestContext}
      setState={() => {}}
    >
      {children}
    </DashboardStateContextProvider>
  )
}

function DashboardStateProviderRuntime({
  children,
  session,
}: DashboardStateProviderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requestContext = resolveDashboardRequestContext({
    session,
    searchParams,
  })

  const setState = (nextState: Partial<DashboardStateFields>) => {
    const mergedState: DashboardStateFields = {
      workspaceId: nextState.workspaceId ?? requestContext.workspaceId,
      from: nextState.from ?? requestContext.from,
      to: nextState.to ?? requestContext.to,
      compare: nextState.compare ?? requestContext.compare,
      refresh: nextState.refresh ?? requestContext.refresh,
      loadedAt: nextState.loadedAt ?? requestContext.loadedAt,
    }
    const nextSearchParams = new URLSearchParams(searchParams.toString())

    applyDashboardStateToSearchParams(nextSearchParams, mergedState)

    const nextSearch = nextSearchParams.toString()
    const nextHref = nextSearch ? `${pathname}?${nextSearch}` : pathname

    startTransition(() => {
      router.replace(nextHref)
    })
  }

  return (
    <DashboardStateContextProvider
      session={session}
      requestContext={requestContext}
      setState={setState}
    >
      {children}
    </DashboardStateContextProvider>
  )
}

export function DashboardStateProvider({
  children,
  session,
}: DashboardStateProviderProps) {
  return (
    <Suspense
      fallback={
        <DashboardStateProviderFallback session={session}>
          {children}
        </DashboardStateProviderFallback>
      }
    >
      <DashboardStateProviderRuntime session={session}>
        {children}
      </DashboardStateProviderRuntime>
    </Suspense>
  )
}

export function useDashboardState() {
  const value = useContext(DashboardStateContext)

  if (!value) {
    throw new Error("useDashboardState must be used within DashboardStateProvider.")
  }

  return value
}
