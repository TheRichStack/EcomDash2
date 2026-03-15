/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { buildChangedBudgetHistoryRows } from "@/lib/connectors/common/budget-history"
import {
  fetchJsonWithRetry,
  nowIso,
  readEnv,
  readRequiredEnv,
} from "@/lib/connectors/common"
import {
  buildGoogleInventoryMaps,
  deriveGoogleFactDailyRows,
  deriveGoogleFactSegmentRows,
  deriveGoogleSegmentRows,
  mapGoogleApiRows,
  normalizeGoogleCustomerId,
} from "@/lib/connectors/google/transform"

export const GOOGLE_DIRECT_REQUIRED_ENV_KEYS = [
  "GOOGLE_ADS_CUSTOMER_ID",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
]

const GOOGLE_ADS_DEFAULT_API_VERSION = "v23"

function resolveGoogleDirectConfig(runtimeEnv) {
  return {
    apiVersion:
      readEnv(runtimeEnv, "GOOGLE_ADS_API_VERSION", GOOGLE_ADS_DEFAULT_API_VERSION).trim() ||
      GOOGLE_ADS_DEFAULT_API_VERSION,
    clientId: readRequiredEnv(runtimeEnv, "GOOGLE_ADS_CLIENT_ID").trim(),
    clientSecret: readRequiredEnv(runtimeEnv, "GOOGLE_ADS_CLIENT_SECRET").trim(),
    customerId: normalizeGoogleCustomerId(readRequiredEnv(runtimeEnv, "GOOGLE_ADS_CUSTOMER_ID")),
    developerToken: readRequiredEnv(runtimeEnv, "GOOGLE_ADS_DEVELOPER_TOKEN").trim(),
    loginCustomerId: normalizeGoogleCustomerId(readEnv(runtimeEnv, "GOOGLE_ADS_LOGIN_CUSTOMER_ID", "")),
    refreshToken: readRequiredEnv(runtimeEnv, "GOOGLE_ADS_REFRESH_TOKEN").trim(),
  }
}

export function hasGoogleDirectCredentials(runtimeEnv) {
  return GOOGLE_DIRECT_REQUIRED_ENV_KEYS.every((key) => String(runtimeEnv[key] || "").trim())
}

async function fetchGoogleAccessToken(config) {
  const form = new URLSearchParams()
  form.set("client_id", config.clientId)
  form.set("client_secret", config.clientSecret)
  form.set("refresh_token", config.refreshToken)
  form.set("grant_type", "refresh_token")

  const payload = await fetchJsonWithRetry({
    body: form.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    label: "google_ads_oauth_token",
    method: "POST",
    retries: 3,
    retryDelayMs: 2500,
    url: "https://oauth2.googleapis.com/token",
  })
  const accessToken = String(payload?.access_token || "").trim()

  if (!accessToken) {
    throw new Error("Google OAuth response missing access_token")
  }

  return accessToken
}

async function fetchGoogleSearchRows({
  accessToken,
  apiVersion,
  customerId,
  developerToken,
  label,
  loginCustomerId,
  query,
}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "developer-token": developerToken,
  }

  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId
  }

  const payload = await fetchJsonWithRetry({
    body: JSON.stringify({ query }),
    headers,
    label,
    method: "POST",
    retries: 3,
    retryDelayMs: 3000,
    url: `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:searchStream`,
  })
  const pages =
    Array.isArray(payload) ?
      payload
    : Array.isArray(payload?.results) ?
      [payload]
    : []
  const rows = []

  for (const page of pages) {
    for (const row of page?.results || []) {
      rows.push(row)
    }
  }

  return rows
}

async function fetchGoogleInventory(config, accessToken) {
  const errors = []
  let campaignRows = []
  let adGroupRows = []
  let adRows = []

  try {
    campaignRows = await fetchGoogleSearchRows({
      accessToken,
      apiVersion: config.apiVersion,
      customerId: config.customerId,
      developerToken: config.developerToken,
      label: "google_ads_campaign_inventory",
      loginCustomerId: config.loginCustomerId,
      query: [
        "SELECT",
        "customer.id,",
        "campaign.id,",
        "campaign.status,",
        "campaign_budget.amount_micros",
        "FROM campaign",
      ].join(" "),
    })
  } catch (error) {
    errors.push(`campaign: ${error.message || String(error)}`)
  }

  try {
    adGroupRows = await fetchGoogleSearchRows({
      accessToken,
      apiVersion: config.apiVersion,
      customerId: config.customerId,
      developerToken: config.developerToken,
      label: "google_ads_adgroup_inventory",
      loginCustomerId: config.loginCustomerId,
      query: [
        "SELECT",
        "customer.id,",
        "campaign.id,",
        "ad_group.id,",
        "ad_group.status",
        "FROM ad_group",
      ].join(" "),
    })
  } catch (error) {
    errors.push(`ad_group: ${error.message || String(error)}`)
  }

  try {
    adRows = await fetchGoogleSearchRows({
      accessToken,
      apiVersion: config.apiVersion,
      customerId: config.customerId,
      developerToken: config.developerToken,
      label: "google_ads_ad_inventory",
      loginCustomerId: config.loginCustomerId,
      query: [
        "SELECT",
        "customer.id,",
        "campaign.id,",
        "ad_group.id,",
        "ad_group_ad.ad.id,",
        "ad_group_ad.ad.name,",
        "ad_group_ad.status",
        "FROM ad_group_ad",
      ].join(" "),
    })
  } catch (error) {
    errors.push(`ad: ${error.message || String(error)}`)
  }

  return {
    ...buildGoogleInventoryMaps({
      adGroupRows,
      adRows,
      campaignRows,
    }),
    counts: {
      ad_groups: adGroupRows.length,
      ads: adRows.length,
      campaigns: campaignRows.length,
    },
    errors,
  }
}

async function fetchGoogleAdsReportRows(config, accessToken, from, to) {
  return fetchGoogleSearchRows({
    accessToken,
    apiVersion: config.apiVersion,
    customerId: config.customerId,
    developerToken: config.developerToken,
    label: "google_ads_report",
    loginCustomerId: config.loginCustomerId,
    query: [
      "SELECT",
      "segments.date,",
      "customer.id,",
      "campaign.id,",
      "campaign.name,",
      "ad_group.id,",
      "ad_group.name,",
      "ad_group_ad.ad.id,",
      "metrics.impressions,",
      "metrics.clicks,",
      "metrics.cost_micros,",
      "metrics.conversions,",
      "metrics.conversions_value,",
      "metrics.all_conversions",
      "FROM ad_group_ad",
      `WHERE segments.date BETWEEN '${from}' AND '${to}'`,
    ].join(" "),
  })
}

export async function pullGoogleDirectTables(ctx) {
  const config = resolveGoogleDirectConfig(ctx.env)
  const syncedAt = nowIso()
  const accessToken = await fetchGoogleAccessToken(config)
  const inventory = await fetchGoogleInventory(config, accessToken)
  const reportRows = await fetchGoogleAdsReportRows(config, accessToken, ctx.from, ctx.to)
  const rawDailyRows = mapGoogleApiRows(reportRows, syncedAt, inventory.campaignBudgetMap)
  const rawSegmentRows = deriveGoogleSegmentRows(rawDailyRows, syncedAt)
  const factDailyRows = deriveGoogleFactDailyRows(rawDailyRows, inventory)
  const factSegmentRows = deriveGoogleFactSegmentRows(rawSegmentRows, inventory)
  const budgetHistoryRows = await buildChangedBudgetHistoryRows({
    campaignBudgetMap: inventory.campaignBudgetMap,
    client: ctx.client,
    platform: "Google",
    syncedAt,
    workspaceId: ctx.workspaceId,
  })

  const tables = {
    RAW_GOOGLE_ADS_DAILY: rawDailyRows,
    RAW_GOOGLE_ADS_SEGMENTS_DAILY: rawSegmentRows,
    FACT_ADS_DAILY: factDailyRows,
    FACT_ADS_SEGMENTS_DAILY: factSegmentRows,
  }

  if (budgetHistoryRows.length) {
    tables.BUDGET_HISTORY = budgetHistoryRows
  }

  return {
    cursor: ctx.to,
    metadata: {
      api_version: config.apiVersion,
      budget_history_rows: budgetHistoryRows.length,
      customer_id: config.customerId,
      fetched_report_rows: reportRows.length,
      inventory_counts: inventory.counts,
      inventory_errors: inventory.errors,
      transport: "direct",
    },
    tables,
  }
}
