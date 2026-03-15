function parseNum(value: unknown) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim()
}

function normalizeUpper(value: unknown) {
  return normalizeText(value).toUpperCase()
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return "{}"
  }
}

export function snapshotRow(input: {
  bidStrategy?: string
  campaignId?: string
  channel: string
  dailyBudget?: number
  entityId: string
  level: string
  name?: string
  parentId?: string
  raw?: unknown
  status?: string
  syncBatchId: string
  syncedAt: string
  targetValue?: string
}) {
  return {
    synced_at: normalizeText(input.syncedAt),
    sync_batch_id: normalizeText(input.syncBatchId),
    channel: normalizeText(input.channel).toLowerCase(),
    level: normalizeText(input.level).toLowerCase(),
    entity_id: normalizeText(input.entityId),
    parent_id: normalizeText(input.parentId),
    campaign_id: normalizeText(input.campaignId),
    name: normalizeText(input.name),
    status: normalizeUpper(input.status),
    daily_budget: parseNum(input.dailyBudget),
    bid_strategy: normalizeText(input.bidStrategy),
    target_value: normalizeText(input.targetValue),
    raw_json: safeJson(input.raw),
  }
}
