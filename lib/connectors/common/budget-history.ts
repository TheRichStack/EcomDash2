import type { JobDatabaseClient } from "@/lib/jobs/runtime/db"

type BudgetHistoryRow = {
  campaign_id?: unknown
  daily_budget?: unknown
}

function toNum(value: unknown) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

function normalizedDateFromIso(value: unknown) {
  const text = String(value ?? "").trim()

  if (!text) {
    return ""
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10)
  }

  const parsed = new Date(text)

  if (Number.isNaN(parsed.getTime())) {
    return ""
  }

  return parsed.toISOString().slice(0, 10)
}

export async function loadLatestCampaignBudgets(
  client: JobDatabaseClient,
  workspaceId: string,
  platform: string
) {
  const map = new Map<string, number>()
  const result = await client.execute({
    sql: `
      SELECT b1.campaign_id, b1.daily_budget
      FROM budget_history b1
      WHERE b1.workspace_id = ? AND b1.platform = ?
        AND NOT EXISTS (
          SELECT 1
          FROM budget_history b2
          WHERE b2.workspace_id = b1.workspace_id
            AND b2.platform = b1.platform
            AND b2.campaign_id = b1.campaign_id
            AND (
              b2.effective_date > b1.effective_date OR
              (b2.effective_date = b1.effective_date AND b2.synced_at > b1.synced_at)
            )
        )
    `,
    args: [workspaceId, platform],
  })

  for (const row of (result.rows ?? []) as BudgetHistoryRow[]) {
    const campaignId = String(row.campaign_id ?? "").trim()
    const budget = toNum(row.daily_budget)

    if (campaignId && budget > 0) {
      map.set(campaignId, budget)
    }
  }

  return map
}

export function buildBudgetHistoryRows(input: {
  campaignBudgetMap: Map<string, number>
  knownBudgetMap?: Map<string, number>
  platform: string
  syncedAt: string
}) {
  if (!(input.campaignBudgetMap instanceof Map)) {
    return []
  }

  const effectiveDate = normalizedDateFromIso(input.syncedAt)

  if (!effectiveDate) {
    return []
  }

  const rows: Array<{
    campaign_id: string
    daily_budget: number
    effective_date: string
    platform: string
    synced_at: string
  }> = []
  const knownBudgetMap = input.knownBudgetMap ?? new Map<string, number>()

  for (const [campaignIdRaw, budgetRaw] of input.campaignBudgetMap.entries()) {
    const campaignId = String(campaignIdRaw ?? "").trim()
    const budget = toNum(budgetRaw)

    if (!campaignId || budget <= 0) {
      continue
    }

    const previousBudget = toNum(knownBudgetMap.get(campaignId))

    if (Math.abs(previousBudget - budget) < 0.000001) {
      continue
    }

    rows.push({
      platform: input.platform,
      campaign_id: campaignId,
      effective_date: effectiveDate,
      daily_budget: budget,
      synced_at: String(input.syncedAt ?? "").trim(),
    })
  }

  rows.sort((left, right) => left.campaign_id.localeCompare(right.campaign_id))

  return rows
}

export async function buildChangedBudgetHistoryRows(input: {
  campaignBudgetMap: Map<string, number>
  client: JobDatabaseClient
  platform: string
  syncedAt: string
  workspaceId: string
}) {
  if (!(input.campaignBudgetMap instanceof Map) || input.campaignBudgetMap.size === 0) {
    return []
  }

  const knownBudgetMap = await loadLatestCampaignBudgets(
    input.client,
    input.workspaceId,
    input.platform
  )

  return buildBudgetHistoryRows({
    campaignBudgetMap: input.campaignBudgetMap,
    knownBudgetMap,
    platform: input.platform,
    syncedAt: input.syncedAt,
  })
}
