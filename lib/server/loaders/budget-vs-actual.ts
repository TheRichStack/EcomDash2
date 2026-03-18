import "server-only"

import { selectRowsFromTable } from "@/lib/db/query"
import {
  parseBudgetPlanMonthly,
  parseDailyChannelCampaignRow,
} from "@/lib/db/record-parsers"
import type { DashboardRequestContext } from "@/types/dashboard"

export type BudgetChannelRow = {
  channel: string
  budgetedAmount: number
  actualSpend: number
  remainingBudget: number
  pacePercent: number
}

export type BudgetVsActualSlice = {
  range: { from: string; to: string }
  channels: BudgetChannelRow[]
  totals: {
    budgetedAmount: number
    actualSpend: number
    remainingBudget: number
    pacePercent: number
  }
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b
}

function monthsInRange(fromDate: string, toDate: string): string[] {
  const from = fromDate.slice(0, 7)
  const to = toDate.slice(0, 7)
  const months: string[] = []
  let current = from
  while (current <= to) {
    months.push(current)
    const [y, m] = current.split("-").map(Number)
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
    current = next
  }
  return months
}

export async function loadBudgetVsActualSlice(
  context: DashboardRequestContext
): Promise<BudgetVsActualSlice> {
  const [budgetRows, campaignRows] = await Promise.all([
    selectRowsFromTable("budgetPlanMonthly", {
      workspaceId: context.workspaceId,
      cacheBuster: context.refresh ?? context.loadedAt,
    }),
    selectRowsFromTable("contractDailyChannelCampaign", {
      workspaceId: context.workspaceId,
      from: context.from,
      to: context.to,
      cacheBuster: context.refresh ?? context.loadedAt,
    }),
  ])

  const relevantMonths = new Set(monthsInRange(context.from, context.to))

  // Build budget map: channel -> total budgeted amount
  const budgetMap = new Map<string, number>()
  for (const raw of budgetRows) {
    const entry = parseBudgetPlanMonthly(raw)
    if (!relevantMonths.has(entry.month)) continue
    const key = entry.channel.toLowerCase()
    budgetMap.set(key, (budgetMap.get(key) ?? 0) + entry.budget)
  }

  // Build spend map: platform -> total actual spend
  const spendMap = new Map<string, number>()
  for (const raw of campaignRows) {
    const row = parseDailyChannelCampaignRow(raw)
    const key = row.platform.toLowerCase()
    spendMap.set(key, (spendMap.get(key) ?? 0) + row.spend)
  }

  // Union of all channels from either map
  const allChannels = new Set([...budgetMap.keys(), ...spendMap.keys()])

  const channels: BudgetChannelRow[] = []
  for (const channel of allChannels) {
    const budgetedAmount = budgetMap.get(channel) ?? 0
    const actualSpend = spendMap.get(channel) ?? 0
    const remainingBudget = budgetedAmount - actualSpend
    const pacePercent = budgetedAmount > 0 ? safeDivide(actualSpend, budgetedAmount) * 100 : 0
    channels.push({ channel, budgetedAmount, actualSpend, remainingBudget, pacePercent })
  }

  // Sort by actualSpend descending
  channels.sort((a, b) => b.actualSpend - a.actualSpend)

  // Compute totals
  const totalBudgetedAmount = channels.reduce((s, c) => s + c.budgetedAmount, 0)
  const totalActualSpend = channels.reduce((s, c) => s + c.actualSpend, 0)
  const totalRemainingBudget = totalBudgetedAmount - totalActualSpend
  const totalPacePercent = totalBudgetedAmount > 0
    ? safeDivide(totalActualSpend, totalBudgetedAmount) * 100
    : 0

  return {
    range: { from: context.from, to: context.to },
    channels,
    totals: {
      budgetedAmount: totalBudgetedAmount,
      actualSpend: totalActualSpend,
      remainingBudget: totalRemainingBudget,
      pacePercent: totalPacePercent,
    },
  }
}
