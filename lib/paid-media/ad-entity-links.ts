import type {
  PaidMediaEntityLevel,
  PaidMediaPlatformId,
} from "@/types/backend"

export type PaidMediaEntityLinkMode = "exact" | "fallback" | "unavailable"

export type PaidMediaEntityLinkInput = {
  platform: PaidMediaPlatformId
  level: PaidMediaEntityLevel
  accountId?: string
  businessId?: string
  campaignId?: string
  adsetId?: string
  adId?: string
}

export type PaidMediaEntityLinkResult = {
  url: string
  mode: PaidMediaEntityLinkMode
  reason: string
}

const PLACEHOLDER_ENTITY_IDS = new Set([
  "unknown",
  "unknown_campaign",
  "unknown_adset",
  "unknown_adgroup",
  "unknown_ad",
])

function normalizeText(value: unknown) {
  return String(value ?? "").trim()
}

function normalizeEntityId(value: unknown) {
  const raw = normalizeText(value)

  if (!raw) {
    return ""
  }

  const lowered = raw.toLowerCase()

  if (PLACEHOLDER_ENTITY_IDS.has(lowered) || lowered.startsWith("unknown_")) {
    return ""
  }

  return raw
}

function expandScientificInteger(value: string) {
  const match = String(value ?? "")
    .trim()
    .toLowerCase()
    .match(/^([0-9]+)(?:\.([0-9]+))?e([+-]?[0-9]+)$/)

  if (!match) {
    return ""
  }

  const intPart = match[1] || ""
  const fractionPart = match[2] || ""
  const exponent = Number(match[3] || "")

  if (!Number.isFinite(exponent) || exponent < 0) {
    return ""
  }

  const digits = `${intPart}${fractionPart}`
  const targetIntegerLength = intPart.length + exponent

  if (targetIntegerLength < 1) {
    return ""
  }

  if (digits.length >= targetIntegerLength) {
    return digits.slice(0, targetIntegerLength)
  }

  return `${digits}${"0".repeat(targetIntegerLength - digits.length)}`
}

function normalizeMetaEntityId(value: unknown) {
  const base = normalizeEntityId(value)

  if (!base) {
    return ""
  }

  if (/^\d+$/.test(base)) {
    return base
  }

  const expanded = expandScientificInteger(base)

  return /^\d+$/.test(expanded) ? expanded : ""
}

function normalizeMetaAccountId(value: unknown) {
  const raw = normalizeText(value)

  if (!raw) {
    return ""
  }

  if (raw.startsWith("act_")) {
    return raw.slice(4)
  }

  const digits = raw.replace(/\D+/g, "")

  return digits || raw
}

function normalizeMetaBusinessId(value: unknown) {
  return normalizeText(value).replace(/\D+/g, "")
}

function normalizeGoogleCustomerId(value: unknown) {
  return normalizeText(value).replace(/\D+/g, "")
}

function normalizeGoogleEntityId(value: unknown) {
  const base = normalizeEntityId(value)

  if (!base) {
    return ""
  }

  if (/^\d+$/.test(base)) {
    return base
  }

  const expanded = expandScientificInteger(base)

  return /^\d+$/.test(expanded) ? expanded : ""
}

function normalizeTikTokAdvertiserId(value: unknown) {
  return normalizeText(value).replace(/\D+/g, "")
}

function unavailable(reason: string): PaidMediaEntityLinkResult {
  return {
    url: "",
    mode: "unavailable",
    reason,
  }
}

function exact(url: URL, reason = "exact_entity"): PaidMediaEntityLinkResult {
  return {
    url: url.toString(),
    mode: "exact",
    reason,
  }
}

function fallback(url: URL, reason = "fallback_view"): PaidMediaEntityLinkResult {
  return {
    url: url.toString(),
    mode: "fallback",
    reason,
  }
}

function buildMetaLink(
  input: PaidMediaEntityLinkInput
): PaidMediaEntityLinkResult {
  const accountId = normalizeMetaAccountId(input.accountId)

  if (!accountId) {
    return unavailable("missing_account_id")
  }

  const businessId = normalizeMetaBusinessId(input.businessId)
  const campaignId = normalizeMetaEntityId(input.campaignId)
  const adsetId = normalizeMetaEntityId(input.adsetId)
  const adId = normalizeMetaEntityId(input.adId)
  const separator = "\x1E"
  const quote = (value: string) => `"${value}"`
  const campaignGroupFilter = (value: string) =>
    `SEARCH_BY_CAMPAIGN_GROUP_ID-STRING${separator}EQUAL${separator}${quote(value)}`
  const campaignIdFilter = (value: string) =>
    `SEARCH_BY_CAMPAIGN_ID-STRING${separator}EQUAL${separator}${quote(value)}`
  const adGroupFilter = (value: string) =>
    `SEARCH_BY_ADGROUP_IDS-STRING_SET${separator}ANY${separator}[${quote(value)}]`

  const makeUrl = (path: "campaigns" | "adsets" | "ads") => {
    const url = new URL(`https://adsmanager.facebook.com/adsmanager/manage/${path}`)
    url.searchParams.set("act", accountId)
    url.searchParams.set("nav_source", "no_referrer")

    if (businessId) {
      url.searchParams.set("business_id", businessId)
    }

    url.hash = "#"

    return url
  }

  if (input.level === "campaign") {
    const url = makeUrl("campaigns")

    if (campaignId) {
      url.searchParams.set("filter_set", campaignGroupFilter(campaignId))
      url.searchParams.set("selected_campaign_ids", campaignId)
      return exact(url)
    }

    return fallback(url, "campaign_id_missing")
  }

  if (input.level === "adset") {
    const url = makeUrl("adsets")

    if (adsetId) {
      url.searchParams.set("filter_set", campaignIdFilter(adsetId))
      url.searchParams.set("selected_adset_ids", adsetId)
      return exact(url)
    }

    if (campaignId) {
      const campaignUrl = makeUrl("campaigns")
      campaignUrl.searchParams.set("filter_set", campaignGroupFilter(campaignId))
      campaignUrl.searchParams.set("selected_campaign_ids", campaignId)
      return fallback(campaignUrl, "adset_id_missing_with_campaign")
    }

    return fallback(url, "adset_id_missing")
  }

  const url = makeUrl("ads")

  if (adId) {
    url.searchParams.set("filter_set", adGroupFilter(adId))
    url.searchParams.set("selected_ad_ids", adId)
    return exact(url)
  }

  if (adsetId) {
    url.searchParams.set("filter_set", adGroupFilter(adsetId))
    return fallback(url, "ad_id_missing_with_adset")
  }

  if (campaignId) {
    const campaignUrl = makeUrl("campaigns")
    campaignUrl.searchParams.set("filter_set", campaignGroupFilter(campaignId))
    campaignUrl.searchParams.set("selected_campaign_ids", campaignId)
    return fallback(campaignUrl, "ad_id_missing_with_campaign")
  }

  return fallback(url, "ad_id_missing")
}

function buildGoogleLink(
  input: PaidMediaEntityLinkInput
): PaidMediaEntityLinkResult {
  const accountId = normalizeGoogleCustomerId(input.accountId)

  if (!accountId) {
    return unavailable("missing_account_id")
  }

  const campaignId = normalizeGoogleEntityId(input.campaignId)
  const adsetId = normalizeGoogleEntityId(input.adsetId)
  const adId = normalizeGoogleEntityId(input.adId)

  const makeUrl = (path: string) => {
    const url = new URL(`https://ads.google.com/aw/${path}`)
    url.searchParams.set("ocid", accountId)
    url.searchParams.set("nav_source", "no_referrer")
    url.hash = "#"
    return url
  }

  if (input.level === "campaign") {
    const url = makeUrl("campaigns")

    if (campaignId) {
      url.searchParams.set("campaignId", campaignId)
      return exact(url)
    }

    return fallback(url, "campaign_id_missing")
  }

  if (input.level === "adset") {
    const url = makeUrl("adgroups")

    if (campaignId) {
      url.searchParams.set("campaignId", campaignId)
    }

    if (adsetId) {
      url.searchParams.set("adGroupId", adsetId)
      return exact(url)
    }

    if (campaignId) {
      const campaignUrl = makeUrl("campaigns")
      campaignUrl.searchParams.set("campaignId", campaignId)
      return fallback(campaignUrl, "adgroup_id_missing_with_campaign")
    }

    return fallback(makeUrl("campaigns"), "adgroup_id_missing")
  }

  const url = makeUrl("ads")

  if (campaignId) {
    url.searchParams.set("campaignId", campaignId)
  }

  if (adsetId) {
    url.searchParams.set("adGroupId", adsetId)
  }

  if (adId) {
    url.searchParams.set("adId", adId)
    return exact(url)
  }

  if (adsetId) {
    return fallback(url, "ad_id_missing_with_adgroup")
  }

  if (campaignId) {
    const campaignUrl = makeUrl("campaigns")
    campaignUrl.searchParams.set("campaignId", campaignId)
    return fallback(campaignUrl, "ad_id_missing_with_campaign")
  }

  return fallback(makeUrl("campaigns"), "ad_id_missing")
}

function buildTikTokLink(
  input: PaidMediaEntityLinkInput
): PaidMediaEntityLinkResult {
  const accountId = normalizeTikTokAdvertiserId(input.accountId)

  if (!accountId) {
    return unavailable("missing_account_id")
  }

  const campaignId = normalizeEntityId(input.campaignId)
  const adsetId = normalizeEntityId(input.adsetId)
  const adId = normalizeEntityId(input.adId)

  const makeUrl = (path: string) => {
    const url = new URL(`https://ads.tiktok.com/i18n/perf/${path}`)
    url.searchParams.set("aadvid", accountId)
    return url
  }

  if (input.level === "campaign") {
    const url = makeUrl("campaign")

    if (campaignId) {
      url.searchParams.set("campaign_id", campaignId)
      return exact(url)
    }

    return fallback(url, "campaign_id_missing")
  }

  if (input.level === "adset") {
    const url = makeUrl("adgroup")

    if (campaignId) {
      url.searchParams.set("campaign_id", campaignId)
    }

    if (adsetId) {
      url.searchParams.set("adgroup_id", adsetId)
      return exact(url)
    }

    if (campaignId) {
      return fallback(url, "adgroup_id_missing_with_campaign")
    }

    return fallback(makeUrl("campaign"), "adgroup_id_missing")
  }

  const url = makeUrl("ad")

  if (campaignId) {
    url.searchParams.set("campaign_id", campaignId)
  }

  if (adsetId) {
    url.searchParams.set("adgroup_id", adsetId)
  }

  if (adId) {
    url.searchParams.set("ad_id", adId)
    return exact(url)
  }

  if (adsetId) {
    return fallback(url, "ad_id_missing_with_adgroup")
  }

  if (campaignId) {
    const campaignUrl = makeUrl("campaign")
    campaignUrl.searchParams.set("campaign_id", campaignId)
    return fallback(campaignUrl, "ad_id_missing_with_campaign")
  }

  return fallback(makeUrl("campaign"), "ad_id_missing")
}

export function buildPaidMediaEntityLink(
  input: PaidMediaEntityLinkInput
): PaidMediaEntityLinkResult {
  if (input.platform === "meta") {
    return buildMetaLink(input)
  }

  if (input.platform === "google") {
    return buildGoogleLink(input)
  }

  return buildTikTokLink(input)
}
