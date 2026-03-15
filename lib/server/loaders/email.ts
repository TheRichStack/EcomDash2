import "server-only"

import { safeDivide } from "@/lib/metrics/formulas"
import { selectRowsFromTable } from "@/lib/db/query"
import {
  parseKlaviyoCampaign,
  parseKlaviyoFlow,
} from "@/lib/db/record-parsers"
import { env } from "@/lib/env"
import { getComparisonRange } from "@/lib/server/date-ranges"
import type {
  EmailCampaignRow,
  EmailFlowRow,
  EmailFlowSequenceStep,
  EmailKpiTotals,
  EmailPerformanceSummary,
  EmailSliceData,
  KlaviyoCampaign,
  KlaviyoFlow,
  LoaderRange,
} from "@/types/backend"
import type { DashboardRequestContext } from "@/types/dashboard"
import type { EcomDashMetricId } from "@/types/metrics"

const EMAIL_KPI_METRIC_IDS = [
  "email_revenue",
  "email_sends",
  "email_open_rate",
  "email_click_rate",
  "email_revenue_per_recipient",
  "email_placed_orders",
] as const satisfies readonly EcomDashMetricId[]

const PLACED_ORDERS_EXTRA_KEYS = [
  "placed_orders",
  "placed_order_count",
  "placed_order_total",
  "order_count",
] as const

type EmailSummarySeed = {
  sends: number
  delivered: number
  opens: number
  uniqueOpens: number
  clicks: number
  uniqueClicks: number
  bounces: number
  unsubscribes: number
  revenue: number
  placedOrders: number | null
}

type SequenceAccumulator = EmailSummarySeed & {
  key: string
  stepIndex: number | null
  messageId: string
  messageName: string
}

type CampaignAccumulator = EmailSummarySeed & {
  campaignId: string
  campaignName: string
  latestSendDate: string
  activeDates: Set<string>
}

type FlowAccumulator = EmailSummarySeed & {
  flowId: string
  flowName: string
  latestSendDate: string
  activeDates: Set<string>
  sequenceRows: KlaviyoFlow[]
}

function createSummarySeed(): EmailSummarySeed {
  return {
    sends: 0,
    delivered: 0,
    opens: 0,
    uniqueOpens: 0,
    clicks: 0,
    uniqueClicks: 0,
    bounces: 0,
    unsubscribes: 0,
    revenue: 0,
    placedOrders: null,
  }
}

function pickPlacedOrders(extraMetrics: Record<string, number>) {
  for (const key of PLACED_ORDERS_EXTRA_KEYS) {
    const value = Number(extraMetrics[key])

    if (Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function addPlacedOrders(current: number | null, next: number | null) {
  if (current === null && next === null) {
    return null
  }

  return Number(current ?? 0) + Number(next ?? 0)
}

function finalizeSummary(seed: EmailSummarySeed): EmailPerformanceSummary {
  return {
    ...seed,
    deliveryRate: safeDivide(seed.delivered * 100, seed.sends),
    openRate: safeDivide(seed.uniqueOpens * 100, seed.delivered),
    clickRate: safeDivide(seed.uniqueClicks * 100, seed.delivered),
    ctr: safeDivide(seed.uniqueClicks * 100, seed.uniqueOpens),
    bounceRate: safeDivide(seed.bounces * 100, seed.sends),
    revenuePerRecipient: safeDivide(seed.revenue, seed.delivered),
  }
}

function summarizeEmailRows(rows: Array<KlaviyoCampaign | KlaviyoFlow>): EmailKpiTotals {
  const seed = createSummarySeed()

  for (const row of rows) {
    seed.sends += row.sends
    seed.delivered += row.delivered
    seed.opens += row.opens
    seed.uniqueOpens += row.uniqueOpens
    seed.clicks += row.clicks
    seed.uniqueClicks += row.uniqueClicks
    seed.bounces += row.bounces
    seed.unsubscribes += row.unsubscribes
    seed.revenue += row.revenue
    seed.placedOrders = addPlacedOrders(
      seed.placedOrders,
      pickPlacedOrders(row.extraMetrics)
    )
  }

  const summary = finalizeSummary(seed)

  return {
    revenue: summary.revenue,
    sends: summary.sends,
    openRate: summary.openRate,
    clickRate: summary.clickRate,
    revenuePerRecipient: summary.revenuePerRecipient,
    placedOrders: summary.placedOrders,
  }
}

function buildCampaignRows(rows: KlaviyoCampaign[]): EmailCampaignRow[] {
  const byCampaign = new Map<string, CampaignAccumulator>()

  for (const row of rows) {
    const campaignId = row.campaignId || row.campaignName || "unknown-campaign"
    const existing = byCampaign.get(campaignId) ?? {
      ...createSummarySeed(),
      campaignId,
      campaignName: row.campaignName || campaignId,
      latestSendDate: row.sendDate,
      activeDates: new Set<string>(),
    }

    existing.campaignName = row.campaignName || existing.campaignName
    existing.latestSendDate =
      row.sendDate > existing.latestSendDate ? row.sendDate : existing.latestSendDate
    if (row.sendDate) {
      existing.activeDates.add(row.sendDate)
    }
    existing.sends += row.sends
    existing.delivered += row.delivered
    existing.opens += row.opens
    existing.uniqueOpens += row.uniqueOpens
    existing.clicks += row.clicks
    existing.uniqueClicks += row.uniqueClicks
    existing.bounces += row.bounces
    existing.unsubscribes += row.unsubscribes
    existing.revenue += row.revenue
    existing.placedOrders = addPlacedOrders(
      existing.placedOrders,
      pickPlacedOrders(row.extraMetrics)
    )
    byCampaign.set(campaignId, existing)
  }

  return Array.from(byCampaign.values())
    .map((entry) => ({
      campaignId: entry.campaignId,
      campaignName: entry.campaignName,
      latestSendDate: entry.latestSendDate,
      activeDays: entry.activeDates.size,
      ...finalizeSummary(entry),
    }))
    .sort((left, right) => {
      if (right.revenue !== left.revenue) {
        return right.revenue - left.revenue
      }

      if (right.sends !== left.sends) {
        return right.sends - left.sends
      }

      return left.campaignName.localeCompare(right.campaignName)
    })
}

function buildSequenceKey(row: KlaviyoFlow) {
  if (row.stepIndex !== null) {
    return `step:${row.stepIndex}:${row.messageId || row.messageName || row.flowId}`
  }

  if (row.messageId) {
    return `message:${row.messageId}`
  }

  if (row.messageName) {
    return `name:${row.messageName}`
  }

  return `flow:${row.flowId}`
}

function buildFlowSequenceSteps(rows: KlaviyoFlow[]): EmailFlowSequenceStep[] {
  const byStep = new Map<string, SequenceAccumulator>()

  for (const row of rows) {
    if (!row.messageId && !row.messageName && row.stepIndex === null) {
      continue
    }

    const key = buildSequenceKey(row)
    const existing = byStep.get(key) ?? {
      ...createSummarySeed(),
      key,
      stepIndex: row.stepIndex,
      messageId: row.messageId,
      messageName: row.messageName,
    }

    if (!existing.messageId && row.messageId) {
      existing.messageId = row.messageId
    }

    if (!existing.messageName && row.messageName) {
      existing.messageName = row.messageName
    }

    if (existing.stepIndex === null && row.stepIndex !== null) {
      existing.stepIndex = row.stepIndex
    }

    existing.sends += row.sends
    existing.delivered += row.delivered
    existing.opens += row.opens
    existing.uniqueOpens += row.uniqueOpens
    existing.clicks += row.clicks
    existing.uniqueClicks += row.uniqueClicks
    existing.bounces += row.bounces
    existing.unsubscribes += row.unsubscribes
    existing.revenue += row.revenue
    existing.placedOrders = addPlacedOrders(
      existing.placedOrders,
      pickPlacedOrders(row.extraMetrics)
    )
    byStep.set(key, existing)
  }

  return Array.from(byStep.values())
    .map((entry) => ({
      key: entry.key,
      stepIndex: entry.stepIndex,
      messageId: entry.messageId,
      messageName: entry.messageName,
      ...finalizeSummary(entry),
    }))
    .sort((left, right) => {
      if (left.stepIndex !== null && right.stepIndex !== null) {
        return left.stepIndex - right.stepIndex
      }

      if (left.stepIndex !== null) {
        return -1
      }

      if (right.stepIndex !== null) {
        return 1
      }

      const leftLabel = left.messageName || left.messageId || left.key
      const rightLabel = right.messageName || right.messageId || right.key

      return leftLabel.localeCompare(rightLabel)
    })
}

function buildFlowRows(rows: KlaviyoFlow[]): EmailFlowRow[] {
  const byFlow = new Map<string, FlowAccumulator>()

  for (const row of rows) {
    const flowId = row.flowId || row.flowName || "unknown-flow"
    const existing = byFlow.get(flowId) ?? {
      ...createSummarySeed(),
      flowId,
      flowName: row.flowName || flowId,
      latestSendDate: row.sendDate,
      activeDates: new Set<string>(),
      sequenceRows: [],
    }

    existing.flowName = row.flowName || existing.flowName
    existing.latestSendDate =
      row.sendDate > existing.latestSendDate ? row.sendDate : existing.latestSendDate
    if (row.sendDate) {
      existing.activeDates.add(row.sendDate)
    }
    existing.sends += row.sends
    existing.delivered += row.delivered
    existing.opens += row.opens
    existing.uniqueOpens += row.uniqueOpens
    existing.clicks += row.clicks
    existing.uniqueClicks += row.uniqueClicks
    existing.bounces += row.bounces
    existing.unsubscribes += row.unsubscribes
    existing.revenue += row.revenue
    existing.placedOrders = addPlacedOrders(
      existing.placedOrders,
      pickPlacedOrders(row.extraMetrics)
    )
    existing.sequenceRows.push(row)
    byFlow.set(flowId, existing)
  }

  return Array.from(byFlow.values())
    .map((entry) => ({
      flowId: entry.flowId,
      flowName: entry.flowName,
      latestSendDate: entry.latestSendDate,
      activeDays: entry.activeDates.size,
      sequenceSteps: buildFlowSequenceSteps(entry.sequenceRows),
      ...finalizeSummary(entry),
    }))
    .sort((left, right) => {
      if (right.revenue !== left.revenue) {
        return right.revenue - left.revenue
      }

      if (right.sends !== left.sends) {
        return right.sends - left.sends
      }

      return left.flowName.localeCompare(right.flowName)
    })
}

function getFlowSequenceSettings(rows: KlaviyoFlow[]) {
  const available = rows.some(
    (row) => Boolean(row.messageId || row.messageName || row.stepIndex !== null)
  )

  return {
    available,
    reason: available
      ? "Sequence detail is grouped from flow message fields on the report rows."
      : "Sequence detail is unavailable because report_klaviyo_flows does not expose message_id, message_name, or step_index in the current dataset.",
  }
}

async function loadEmailRangeRows(
  workspaceId: string,
  range: LoaderRange,
  cacheBuster?: string
): Promise<{
  campaigns: KlaviyoCampaign[]
  flows: KlaviyoFlow[]
}> {
  const [campaignRows, flowRows] = await Promise.all([
    selectRowsFromTable("reportKlaviyoCampaigns", {
      workspaceId,
      from: range.from,
      to: range.to,
      cacheBuster,
    }),
    selectRowsFromTable("reportKlaviyoFlows", {
      workspaceId,
      from: range.from,
      to: range.to,
      cacheBuster,
    }),
  ])

  return {
    campaigns: campaignRows.map(parseKlaviyoCampaign),
    flows: flowRows.map(parseKlaviyoFlow),
  }
}

export async function loadEmailSlice(
  context: DashboardRequestContext
): Promise<EmailSliceData> {
  const cacheBuster = context.refresh ?? context.loadedAt
  const comparisonRange = getComparisonRange(
    context.from,
    context.to,
    context.compare
  )
  const currentRange = {
    from: context.from,
    to: context.to,
  }
  const [currentRows, comparisonRows] = await Promise.all([
    loadEmailRangeRows(context.workspaceId, currentRange, cacheBuster),
    comparisonRange
      ? loadEmailRangeRows(context.workspaceId, comparisonRange, cacheBuster)
      : Promise.resolve(null),
  ])

  return {
    context,
    currentRange: {
      range: currentRange,
      kpis: summarizeEmailRows([
        ...currentRows.campaigns,
        ...currentRows.flows,
      ]),
      campaigns: buildCampaignRows(currentRows.campaigns),
      flows: buildFlowRows(currentRows.flows),
    },
    comparison:
      comparisonRange && comparisonRows
        ? {
            range: comparisonRange,
            kpis: summarizeEmailRows([
              ...comparisonRows.campaigns,
              ...comparisonRows.flows,
            ]),
          }
        : null,
    settings: {
      currency: env.backend.defaultCurrency,
      kpiMetricIds: [...EMAIL_KPI_METRIC_IDS],
      flowSequence: getFlowSequenceSettings(currentRows.flows),
    },
  }
}
