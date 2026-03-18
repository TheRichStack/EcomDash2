import "server-only"

import { selectRowsFromTable } from "@/lib/db/query"
import type { DashboardRequestContext } from "@/types/dashboard"

export type CohortAcquisitionRow = {
  cohortMonth: string
  newCustomers: number
  m0Revenue: number
  ltv3Month: number
  ltv6Month: number
  ltv12Month: number
}

export type CohortRetentionPoint = {
  monthsSince: number
  avgRevenuePerCustomer: number
  cumulativeRevenuePerCustomer: number
}

export type CustomerCohortsSlice = {
  range: { from: string; to: string }
  acquisitionByMonth: CohortAcquisitionRow[]
  retentionCurve: CohortRetentionPoint[]
  totals: {
    totalNewCustomers: number
    avgLtv3Month: number
    avgLtv6Month: number
    avgLtv12Month: number
  }
}

type RawCohortRow = {
  workspace_id: unknown
  cohort_month: unknown
  months_since_acquisition: unknown
  new_customers: unknown
  returning_orders: unknown
  returning_revenue: unknown
  total_revenue: unknown
  updated_at: unknown
}

export async function loadCustomerCohortsSlice(
  context: DashboardRequestContext
): Promise<CustomerCohortsSlice> {
  const rawRows = await selectRowsFromTable<RawCohortRow>("contractCustomerCohorts", {
    workspaceId: context.workspaceId,
    limit: null,
    bypassCache: true,
  })

  type CohortAccumulator = {
    newCustomers: number
    revenueByMonth: Map<number, number>
  }

  // Group by cohort_month
  const cohortMap = new Map<string, CohortAccumulator>()

  for (const raw of rawRows) {
    const cohortMonth = String(raw.cohort_month ?? "")
    const monthsSince = Number(raw.months_since_acquisition ?? 0)
    const newCustomers = Number(raw.new_customers ?? 0)
    const totalRevenue = Number(raw.total_revenue ?? 0)

    if (!cohortMonth) continue

    const existing = cohortMap.get(cohortMonth) ?? {
      newCustomers: 0,
      revenueByMonth: new Map<number, number>(),
    }

    if (monthsSince === 0 && newCustomers > 0) {
      existing.newCustomers = newCustomers
    }

    existing.revenueByMonth.set(monthsSince, totalRevenue)
    cohortMap.set(cohortMonth, existing)
  }

  // Sort cohort months descending, take last 12 for acquisition view
  const allCohortMonths = [...cohortMap.keys()].sort().reverse()
  const recentCohortMonths = allCohortMonths.slice(0, 12)

  function cumulativeRevenue(acc: CohortAccumulator, upToMonth: number): number {
    let total = 0
    for (let m = 0; m <= upToMonth; m++) {
      total += acc.revenueByMonth.get(m) ?? 0
    }
    return total
  }

  const acquisitionByMonth: CohortAcquisitionRow[] = recentCohortMonths.map((cohortMonth) => {
    const acc = cohortMap.get(cohortMonth)!
    const nc = acc.newCustomers || 1
    return {
      cohortMonth,
      newCustomers: acc.newCustomers,
      m0Revenue: acc.revenueByMonth.get(0) ?? 0,
      ltv3Month: cumulativeRevenue(acc, 2) / nc,
      ltv6Month: cumulativeRevenue(acc, 5) / nc,
      ltv12Month: cumulativeRevenue(acc, 11) / nc,
    }
  })

  // Retention curve: aggregate across cohorts with at least 6 months of data
  // Use cohorts that are at least 6 months old (cohort_month <= 6 months ago)
  const today = context.to || new Date().toISOString().slice(0, 7)
  const todayYear = Number(today.slice(0, 4))
  const todayMo = Number(today.slice(5, 7))

  function monthsAgo(cohortMonth: string): number {
    const cy = Number(cohortMonth.slice(0, 4))
    const cm = Number(cohortMonth.slice(5, 7))
    return (todayYear - cy) * 12 + (todayMo - cm)
  }

  const matureMonths = [...cohortMap.keys()].filter((m) => monthsAgo(m) >= 6)

  const curveMaxMonth = 6
  const curvePoints: CohortRetentionPoint[] = []

  for (let mo = 0; mo <= curveMaxMonth; mo++) {
    const validCohorts = matureMonths.filter((cm) => {
      const acc = cohortMap.get(cm)!
      return acc.newCustomers > 0 && acc.revenueByMonth.has(mo)
    })

    if (validCohorts.length === 0) continue

    const avgRevPerCustomer =
      validCohorts.reduce((sum, cm) => {
        const acc = cohortMap.get(cm)!
        return sum + (acc.revenueByMonth.get(mo) ?? 0) / acc.newCustomers
      }, 0) / validCohorts.length

    const avgCumulativePerCustomer =
      validCohorts.reduce((sum, cm) => {
        const acc = cohortMap.get(cm)!
        return sum + cumulativeRevenue(acc, mo) / acc.newCustomers
      }, 0) / validCohorts.length

    curvePoints.push({
      monthsSince: mo,
      avgRevenuePerCustomer: avgRevPerCustomer,
      cumulativeRevenuePerCustomer: avgCumulativePerCustomer,
    })
  }

  // Totals across recent 12 cohorts
  const totalNewCustomers = acquisitionByMonth.reduce((s, r) => s + r.newCustomers, 0)

  function safeAvg(values: number[]): number {
    const valid = values.filter((v) => v > 0)
    return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : 0
  }

  const avgLtv3Month = safeAvg(acquisitionByMonth.map((r) => r.ltv3Month))
  const avgLtv6Month = safeAvg(acquisitionByMonth.map((r) => r.ltv6Month))
  const avgLtv12Month = safeAvg(acquisitionByMonth.map((r) => r.ltv12Month))

  return {
    range: { from: context.from, to: context.to },
    acquisitionByMonth: [...acquisitionByMonth].reverse(),
    retentionCurve: curvePoints,
    totals: {
      totalNewCustomers,
      avgLtv3Month,
      avgLtv6Month,
      avgLtv12Month,
    },
  }
}
