import "server-only"

import { resolveDashboardRequestContext } from "@/lib/dashboard-state"
import { resolveDashboardSession } from "@/lib/dashboard-session"
import { loadSettingsSlice } from "@/lib/server/loaders/settings"

type SettingsSearchParamsRecord = Record<
  string,
  string | string[] | undefined
>

export type SettingsRoutePageProps = {
  searchParams?: Promise<SettingsSearchParamsRecord>
}

type SettingsSearchParamsInput =
  | SettingsSearchParamsRecord
  | Promise<SettingsSearchParamsRecord>
  | undefined

export async function loadSettingsPageData(
  searchParams?: SettingsSearchParamsInput
) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const session = await resolveDashboardSession()
  const context = resolveDashboardRequestContext({
    session,
    searchParams: resolvedSearchParams,
  })

  return loadSettingsSlice(context)
}
