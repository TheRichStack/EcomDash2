/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import {
  createDirectConnector,
  fetchJsonWithRetry,
  nowIso,
  readEnv,
  readRequiredEnv,
  sleep,
} from "@/lib/connectors/common"
import { normalizeDate } from "@/lib/connectors/common/rows"

const KLAVIYO_DEFAULT_REVISION = "2026-01-15"
const KLAVIYO_MAX_CHUNK_DAYS = 60

function toNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function parseBool(value, fallback = false) {
  const raw = String(value ?? "").trim().toLowerCase()
  if (!raw) return fallback
  return raw === "1" || raw === "true" || raw === "yes"
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + Number(days || 0))
  return date.toISOString().slice(0, 10)
}

function chunkDateRange(from, to, maxDays = KLAVIYO_MAX_CHUNK_DAYS) {
  const out = []
  let cursor = String(from || "").trim()
  const end = String(to || "").trim()
  if (!cursor || !end) return out
  while (cursor <= end) {
    const chunkEnd = addDays(cursor, maxDays - 1)
    out.push({
      from: cursor,
      to: chunkEnd < end ? chunkEnd : end,
    })
    cursor = addDays(chunkEnd < end ? chunkEnd : end, 1)
  }
  return out
}

function withinRange(dateValue, from, to) {
  const d = normalizeDate(dateValue)
  if (!d) return false
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

async function klaviyoRequest({
  url,
  apiKey,
  revision,
  method = "GET",
  body = undefined,
  label = "klaviyo_request",
  retries = 4,
  retryDelayMs = 3000,
}) {
  return fetchJsonWithRetry({
    url,
    method,
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    retries,
    retryDelayMs,
    label,
  })
}

async function listKlaviyoCampaigns(apiKey, revision) {
  const out = []
  let next = "https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,'email')"
  while (next) {
    const payload = await klaviyoRequest({
      url: next,
      apiKey,
      revision,
      method: "GET",
      label: "klaviyo_campaigns_list",
    })
    for (const campaign of payload?.data || []) {
      out.push({
        id: String(campaign?.id || "").trim(),
        name: String(campaign?.attributes?.name || ""),
        status: String(campaign?.attributes?.status || "").toLowerCase(),
        send_time: String(campaign?.attributes?.send_time || ""),
      })
    }
    next = String(payload?.links?.next || "").trim()
    if (next) await sleep(250)
  }
  return out.filter((item) => item.id)
}

async function listKlaviyoFlows(apiKey, revision) {
  const out = []
  let next = "https://a.klaviyo.com/api/flows/"
  while (next) {
    const payload = await klaviyoRequest({
      url: next,
      apiKey,
      revision,
      method: "GET",
      label: "klaviyo_flows_list",
    })
    for (const flow of payload?.data || []) {
      out.push({
        id: String(flow?.id || "").trim(),
        name: String(flow?.attributes?.name || ""),
        status: String(flow?.attributes?.status || "").toLowerCase(),
      })
    }
    next = String(payload?.links?.next || "").trim()
    if (next) await sleep(250)
  }
  return out.filter((item) => item.id)
}

async function detectConversionMetricId(apiKey, revision) {
  const payload = await klaviyoRequest({
    url: "https://a.klaviyo.com/api/metrics/",
    apiKey,
    revision,
    method: "GET",
    label: "klaviyo_metrics",
    retries: 2,
  })
  const first = payload?.data?.[0]?.id
  return String(first || "").trim()
}

function buildCampaignSeriesBody({ campaignId, from, to, conversionMetricId }) {
  return {
    data: {
      type: "campaign-series-report",
      attributes: {
        statistics: [
          "recipients",
          "delivered",
          "opens",
          "opens_unique",
          "clicks",
          "clicks_unique",
          "bounced",
          "unsubscribe_uniques",
        ],
        timeframe: {
          start: from,
          end: to,
        },
        interval: "daily",
        conversion_metric_id: conversionMetricId,
      },
      relationships: {
        campaigns: {
          data: [
            {
              type: "campaign",
              id: campaignId,
            },
          ],
        },
      },
    },
  }
}

function buildFlowSeriesBody({ flowId, from, to, conversionMetricId }) {
  return {
    data: {
      type: "flow-series-report",
      attributes: {
        statistics: [
          "recipients",
          "delivered",
          "opens",
          "opens_unique",
          "clicks",
          "clicks_unique",
          "bounced",
          "unsubscribe_uniques",
        ],
        timeframe: {
          start: from,
          end: to,
        },
        interval: "daily",
        filter: `equals(flow_id,"${flowId}")`,
        conversion_metric_id: conversionMetricId,
      },
    },
  }
}

function extractSeriesRows(payload, id, name, syncedAt, idFieldName) {
  const rows = []
  const results = payload?.data?.attributes?.results || []
  const dateTimes = payload?.data?.attributes?.date_times || []
  for (const result of results) {
    const stats = result?.statistics || {}
    const sends = stats.recipients || []
    const delivered = stats.delivered || []
    const opens = stats.opens || []
    const uniqueOpens = stats.opens_unique || []
    const clicks = stats.clicks || []
    const uniqueClicks = stats.clicks_unique || []
    const bounces = stats.bounced || []
    const unsubscribes = stats.unsubscribe_uniques || []

    for (let index = 0; index < dateTimes.length; index += 1) {
      const sendDate = normalizeDate(dateTimes[index])
      if (!sendDate) continue
      const row = {
        _synced_at: syncedAt,
        [idFieldName]: id,
        [`${idFieldName === "campaign_id" ? "campaign" : "flow"}_name`]: name,
        send_date: sendDate,
        sends: toNum(sends[index]),
        delivered: toNum(delivered[index]),
        opens: toNum(opens[index]),
        unique_opens: toNum(uniqueOpens[index]),
        clicks: toNum(clicks[index]),
        unique_clicks: toNum(uniqueClicks[index]),
        bounces: toNum(bounces[index]),
        unsubscribes: toNum(unsubscribes[index]),
        revenue: 0,
      }
      rows.push(row)
    }
  }
  return rows
}

function toCampaignReportRow(rawRow) {
  const delivered = toNum(rawRow.delivered)
  const opens = toNum(rawRow.opens)
  const uniqueOpens = toNum(rawRow.unique_opens)
  const uniqueClicks = toNum(rawRow.unique_clicks)
  const bounces = toNum(rawRow.bounces)
  return {
    campaign_id: rawRow.campaign_id,
    campaign_name: rawRow.campaign_name,
    send_date: rawRow.send_date,
    sends: toNum(rawRow.sends),
    delivered,
    opens,
    unique_opens: uniqueOpens,
    clicks: toNum(rawRow.clicks),
    unique_clicks: uniqueClicks,
    bounces,
    unsubscribes: toNum(rawRow.unsubscribes),
    revenue: toNum(rawRow.revenue),
    open_rate: delivered > 0 ? uniqueOpens / delivered : 0,
    click_rate: delivered > 0 ? uniqueClicks / delivered : 0,
    ctr: opens > 0 ? uniqueClicks / opens : 0,
    bounce_rate: delivered > 0 ? bounces / delivered : 0,
  }
}

function toFlowReportRow(rawRow) {
  const delivered = toNum(rawRow.delivered)
  const opens = toNum(rawRow.opens)
  const uniqueOpens = toNum(rawRow.unique_opens)
  const uniqueClicks = toNum(rawRow.unique_clicks)
  const bounces = toNum(rawRow.bounces)
  return {
    flow_id: rawRow.flow_id,
    flow_name: rawRow.flow_name,
    send_date: rawRow.send_date,
    sends: toNum(rawRow.sends),
    delivered,
    opens,
    unique_opens: uniqueOpens,
    clicks: toNum(rawRow.clicks),
    unique_clicks: uniqueClicks,
    bounces,
    unsubscribes: toNum(rawRow.unsubscribes),
    revenue: toNum(rawRow.revenue),
    open_rate: delivered > 0 ? uniqueOpens / delivered : 0,
    click_rate: delivered > 0 ? uniqueClicks / delivered : 0,
    ctr: opens > 0 ? uniqueClicks / opens : 0,
    bounce_rate: delivered > 0 ? bounces / delivered : 0,
  }
}

async function pullKlaviyoTables(ctx) {
  const apiKey = readRequiredEnv(ctx.env, "KLAVIYO_PRIVATE_API_KEY")
  const revision =
    readEnv(ctx.env, "KLAVIYO_API_VERSION", KLAVIYO_DEFAULT_REVISION).trim() ||
    KLAVIYO_DEFAULT_REVISION
  const delayMs = Math.max(200, toNum(readEnv(ctx.env, "KLAVIYO_REPORT_DELAY_MS", "2500")))
  const syncFlows = parseBool(readEnv(ctx.env, "KLAVIYO_SYNC_FLOWS", "1"), true)
  const syncedAt = nowIso()
  let conversionMetricId = readEnv(ctx.env, "KLAVIYO_CONVERSION_METRIC_ID", "").trim()
  if (!conversionMetricId) {
    conversionMetricId = await detectConversionMetricId(apiKey, revision)
  }
  if (!conversionMetricId) {
    throw new Error(
      "Klaviyo conversion metric id is required. Set KLAVIYO_CONVERSION_METRIC_ID or grant metrics access."
    )
  }

  const dateChunks = chunkDateRange(ctx.from, ctx.to, KLAVIYO_MAX_CHUNK_DAYS)
  const campaigns = (await listKlaviyoCampaigns(apiKey, revision)).filter(
    (campaign) => campaign.status === "sent" && withinRange(campaign.send_time, ctx.from, ctx.to)
  )

  const rawCampaignRows = []
  for (const campaign of campaigns) {
    for (const chunk of dateChunks) {
      const payload = await klaviyoRequest({
        url: "https://a.klaviyo.com/api/campaign-series-reports/",
        apiKey,
        revision,
        method: "POST",
        body: buildCampaignSeriesBody({
          campaignId: campaign.id,
          from: chunk.from,
          to: chunk.to,
          conversionMetricId,
        }),
        label: "klaviyo_campaign_series",
      })
      rawCampaignRows.push(
        ...extractSeriesRows(payload, campaign.id, campaign.name, syncedAt, "campaign_id")
      )
      await sleep(delayMs)
    }
  }

  const rawFlowRows = []
  if (syncFlows) {
    const flows = (await listKlaviyoFlows(apiKey, revision)).filter((flow) =>
      ["live", "draft", "manual"].includes(flow.status)
    )
    for (const flow of flows) {
      for (const chunk of dateChunks) {
        const payload = await klaviyoRequest({
          url: "https://a.klaviyo.com/api/flow-series-reports/",
          apiKey,
          revision,
          method: "POST",
          body: buildFlowSeriesBody({
            flowId: flow.id,
            from: chunk.from,
            to: chunk.to,
            conversionMetricId,
          }),
          label: "klaviyo_flow_series",
        })
        rawFlowRows.push(...extractSeriesRows(payload, flow.id, flow.name, syncedAt, "flow_id"))
        await sleep(delayMs)
      }
    }
  }

  const reportCampaignRows = rawCampaignRows.map((row) => toCampaignReportRow(row))
  const reportFlowRows = rawFlowRows.map((row) => toFlowReportRow(row))

  const tables = {
    RAW_KLAVIYO_CAMPAIGNS: rawCampaignRows,
    REPORT_KLAVIYO_CAMPAIGNS: reportCampaignRows,
  }
  if (rawFlowRows.length) tables.RAW_KLAVIYO_FLOWS = rawFlowRows
  if (reportFlowRows.length) tables.REPORT_KLAVIYO_FLOWS = reportFlowRows

  return {
    tables,
    cursor: ctx.to,
    metadata: {
      revision,
      conversion_metric_id: conversionMetricId,
      campaigns_synced: campaigns.length,
      campaign_rows: rawCampaignRows.length,
      flows_sync_enabled: syncFlows,
      flow_rows: rawFlowRows.length,
      report_delay_ms: delayMs,
    },
  }
}

export const klaviyoConnector = createDirectConnector({
  name: "klaviyo",
  tableKeys: [
    "RAW_KLAVIYO_CAMPAIGNS",
    "RAW_KLAVIYO_FLOWS",
    "REPORT_KLAVIYO_CAMPAIGNS",
    "REPORT_KLAVIYO_FLOWS",
  ],
  requiredEnvKeys: ["KLAVIYO_PRIVATE_API_KEY"],
  async syncWindow(ctx) {
    return pullKlaviyoTables(ctx)
  },
  async backfillWindow(ctx) {
    return pullKlaviyoTables(ctx)
  },
})
