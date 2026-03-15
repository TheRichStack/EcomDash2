/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

export const META_DEFAULT_API_VERSION = "v18.0"

export function toNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function parseBool(value, fallback = false) {
  const raw = String(value ?? "").trim().toLowerCase()
  if (!raw) return fallback
  return raw === "1" || raw === "true" || raw === "yes"
}

export function normalizeAccountId(accountId) {
  const raw = String(accountId || "").trim()
  if (!raw) return ""
  if (raw.startsWith("act_")) return raw
  return `act_${raw}`
}

export function inferFormat(creative) {
  if (!creative || typeof creative !== "object") return "image"
  const oss = creative.object_story_spec || {}
  if (creative.video_id || oss.video_data) return "video"
  const childAttachments = oss?.link_data?.child_attachments || []
  if (Array.isArray(childAttachments) && childAttachments.length > 1) return "carousel"
  return "image"
}

export function pickBestImageUrl(creative) {
  const direct = String(creative?.image_url || "").trim()
  if (direct) return direct
  const fromStory = String(
    creative?.object_story_spec?.link_data?.picture ||
      creative?.object_story_spec?.video_data?.image_url ||
      creative?.object_story_spec?.link_data?.child_attachments?.[0]?.picture ||
      ""
  ).trim()
  if (fromStory) return fromStory
  const thumb = String(creative?.thumbnail_url || "").trim()
  return thumb
}

export function parseActionCounts(actions = [], actionValues = []) {
  const purchasesTypes = new Set(["offsite_conversion.fb_pixel_purchase"])
  const addToCartTypes = new Set(["offsite_conversion.fb_pixel_add_to_cart"])
  const checkoutTypes = new Set(["offsite_conversion.fb_pixel_initiate_checkout"])
  const viewContentTypes = new Set(["offsite_conversion.fb_pixel_view_content"])
  const outboundClickTypes = new Set(["outbound_click"])
  const video3sTypes = new Set(["video_view"])
  const video15sTypes = new Set(["video_thruplay_watched_actions"])
  const videoP25Types = new Set(["video_p25_watched_actions"])
  const videoP50Types = new Set(["video_p50_watched_actions"])
  const videoP75Types = new Set(["video_p75_watched_actions"])
  const videoP100Types = new Set(["video_p100_watched_actions"])

  let purchases = 0
  let revenue = 0
  let addToCart = 0
  let initiateCheckout = 0
  let linkClicks = 0
  let landingPageViews = 0
  let viewContent = 0
  let outboundClicks = 0
  let video3sViews = 0
  let video15sViews = 0
  let videoP25 = 0
  let videoP50 = 0
  let videoP75 = 0
  let videoP100 = 0

  for (const action of actions || []) {
    const type = String(action?.action_type || "").toLowerCase()
    if (purchasesTypes.has(type)) purchases += toNum(action?.value)
    if (addToCartTypes.has(type)) addToCart += toNum(action?.value)
    if (checkoutTypes.has(type)) initiateCheckout += toNum(action?.value)
    if (viewContentTypes.has(type)) viewContent += toNum(action?.value)
    if (outboundClickTypes.has(type)) outboundClicks += toNum(action?.value)
    if (video3sTypes.has(type)) video3sViews += toNum(action?.value)
    if (video15sTypes.has(type)) video15sViews += toNum(action?.value)
    if (videoP25Types.has(type)) videoP25 += toNum(action?.value)
    if (videoP50Types.has(type)) videoP50 += toNum(action?.value)
    if (videoP75Types.has(type)) videoP75 += toNum(action?.value)
    if (videoP100Types.has(type)) videoP100 += toNum(action?.value)
    if (type === "link_click") linkClicks += toNum(action?.value)
    if (type === "landing_page_view") landingPageViews += toNum(action?.value)
  }
  for (const actionValue of actionValues || []) {
    const type = String(actionValue?.action_type || "").toLowerCase()
    if (purchasesTypes.has(type)) revenue += toNum(actionValue?.value)
  }

  return {
    purchases,
    revenue,
    addToCart,
    initiateCheckout,
    linkClicks,
    landingPageViews,
    viewContent,
    outboundClicks,
    video3sViews,
    video15sViews,
    videoP25,
    videoP50,
    videoP75,
    videoP100,
  }
}

export function budgetFor(record) {
  const daily = toNum(record?.daily_budget)
  if (daily > 0) return daily
  return toNum(record?.lifetime_budget)
}

export function targetFor(record) {
  const bidAmount = toNum(record?.bid_amount)
  if (bidAmount > 0) return String(bidAmount)
  const targetRoas = record?.target_roas
  if (targetRoas !== undefined && targetRoas !== null && String(targetRoas).trim() !== "") {
    return String(targetRoas).trim()
  }
  const targetCpa = toNum(record?.target_cpa)
  if (targetCpa > 0) return String(targetCpa)
  return ""
}

export function bidStrategyFor(record) {
  return String(record?.bid_strategy || record?.optimization_goal || "").trim()
}
