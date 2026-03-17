import "server-only"

import { getComparisonRange } from "@/lib/server/date-ranges"
import { loadEmailSlice } from "@/lib/server/loaders/email"
import { loadOverviewSlice } from "@/lib/server/loaders/overview"
import { loadPaidMediaSlice } from "@/lib/server/loaders/paid-media"
import { loadSettingsSlice } from "@/lib/server/loaders/settings"
import { loadShopifyFunnelSlice } from "@/lib/server/loaders/shopify-funnel"
import { loadShopifyInventorySlice } from "@/lib/server/loaders/shopify-inventory"
import { loadShopifyProductsSlice } from "@/lib/server/loaders/shopify-products"
import type { DashboardRequestContext } from "@/types/dashboard"
import type { DailyOverviewRow } from "@/types/backend"

type AgentAnomalySeverity = "high" | "medium"
type AgentAnomalyKind = "commercial" | "tracking"

export type AgentAnomalySignal = {
  category: "overview" | "paid_media" | "inventory" | "email" | "freshness"
  comparisonValue: number | null
  currentValue: number | null
  deltaPct: number | null
  id: string
  kind: AgentAnomalyKind
  likelyCauseHints: string[]
  severity: AgentAnomalySeverity
  summary: string
  timingHint: string
  title: string
}

export type AgentAnomalyCoverage = {
  category: string
  label: string
  note: string
  status: "clear" | "flagged" | "limited"
}

type NumericSignalInput = {
  absoluteThreshold: number
  category: AgentAnomalySignal["category"]
  comparisonValue: number | null
  currentValue: number | null
  deltaThresholdPct: number
  id: string
  kind?: AgentAnomalyKind
  likelyCauseHints?: string[]
  negativeIsPositive?: boolean
  negativeTitle: string
  positiveTitle?: string
  timingHint?: string
  summaryFormatter: (deltaPct: number, currentValue: number, comparisonValue: number) => string
}

function percentDelta(currentValue: number, comparisonValue: number) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(comparisonValue)) {
    return null
  }

  if (comparisonValue === 0) {
    return null
  }

  return ((currentValue - comparisonValue) / Math.abs(comparisonValue)) * 100
}

function pushNumericSignal(
  target: AgentAnomalySignal[],
  input: NumericSignalInput
) {
  if (
    input.currentValue === null ||
    input.comparisonValue === null ||
    !Number.isFinite(input.currentValue) ||
    !Number.isFinite(input.comparisonValue)
  ) {
    return
  }

  const deltaPct = percentDelta(input.currentValue, input.comparisonValue)

  if (deltaPct === null || Math.abs(deltaPct) < input.deltaThresholdPct) {
    return
  }

  if (
    Math.abs(input.currentValue - input.comparisonValue) < input.absoluteThreshold
  ) {
    return
  }

  const negative = deltaPct < 0
  const positiveOutcome = input.negativeIsPositive ? negative : !negative

  target.push({
    category: input.category,
    comparisonValue: input.comparisonValue,
    currentValue: input.currentValue,
    deltaPct,
    id: input.id,
    kind: input.kind ?? (input.category === "freshness" ? "tracking" : "commercial"),
    likelyCauseHints:
      input.likelyCauseHints ??
      input.category === "paid_media"
        ? [
            "Channel or campaign efficiency shifted materially versus the comparison period.",
            "Spend quality, creative performance, or attribution quality may have changed.",
          ]
        : input.category === "email"
          ? [
              "Lifecycle campaign performance changed versus the comparison period.",
              "Send volume, audience quality, or deliverability may have shifted.",
            ]
          : [
              "Core trading performance changed materially versus the comparison period.",
              "Traffic quality, conversion, AOV, product mix, or availability may have changed.",
            ],
    severity: Math.abs(deltaPct) >= input.deltaThresholdPct * 1.5 ? "high" : "medium",
    summary: input.summaryFormatter(
      deltaPct,
      input.currentValue,
      input.comparisonValue
    ),
    timingHint:
      input.timingHint ??
      "Detected from the selected period versus the immediately preceding equivalent comparison period.",
    title: positiveOutcome
      ? input.positiveTitle ?? input.negativeTitle
      : input.negativeTitle,
  })
}

function describeWorstDay(
  rows: DailyOverviewRow[],
  selector: (row: DailyOverviewRow) => number
) {
  if (rows.length === 0) {
    return null
  }

  const worstRow = rows.reduce((current, row) =>
    selector(row) < selector(current) ? row : current
  )

  return worstRow.date
}

function describeHighestDay(
  rows: DailyOverviewRow[],
  selector: (row: DailyOverviewRow) => number
) {
  if (rows.length === 0) {
    return null
  }

  const bestRow = rows.reduce((current, row) =>
    selector(row) > selector(current) ? row : current
  )

  return bestRow.date
}

function hoursSince(isoDate: string) {
  if (!isoDate) {
    return null
  }

  const parsed = new Date(isoDate)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return (Date.now() - parsed.getTime()) / 3_600_000
}

function describeFreshnessImpact(sourceKey: string, stateKey: string) {
  const normalized = `${sourceKey}:${stateKey}`.toLowerCase()

  if (normalized.includes("ga4")) {
    return "This most directly affects traffic, funnel, and conversion reads for the most recent period."
  }

  if (normalized.includes("klaviyo") || normalized.includes("email")) {
    return "This most directly affects email and lifecycle reporting for the most recent period."
  }

  if (normalized.includes("meta") || normalized.includes("google") || normalized.includes("tiktok")) {
    return "This most directly affects paid media delivery and attribution reads for the most recent period."
  }

  return "This may affect warehouse-backed reporting across the most recent period."
}

export async function buildAnomalyScan(context: DashboardRequestContext) {
  const comparisonRange = getComparisonRange(
    context.from,
    context.to,
    context.compare
  )
  const [overview, paidMedia, inventory, email, settings, funnel] = await Promise.all([
    loadOverviewSlice(context),
    loadPaidMediaSlice(context),
    loadShopifyInventorySlice(context),
    loadEmailSlice(context),
    loadSettingsSlice(context),
    loadShopifyFunnelSlice(context),
  ])
  const [productsCurrent, productsComparison] = await Promise.all([
    loadShopifyProductsSlice(context),
    comparisonRange
      ? loadShopifyProductsSlice({
          ...context,
          from: comparisonRange.from,
          to: comparisonRange.to,
        })
      : Promise.resolve(null),
  ])
  const signals: AgentAnomalySignal[] = []
  const sessionDeltaPct = percentDelta(
    funnel.currentRange.kpis.sessions,
    funnel.comparison?.kpis.sessions ?? 0
  )
  const orderDeltaPct = percentDelta(
    overview.selectedRange.totals.orders,
    overview.selectedRange.comparisonTotals?.orders ?? 0
  )
  const revenueDeltaPct = percentDelta(
    overview.selectedRange.totals.revenue,
    overview.selectedRange.comparisonTotals?.revenue ?? 0
  )
  const conversionDeltaPct = percentDelta(
    funnel.currentRange.kpis.purchaseConversionRate,
    funnel.comparison?.kpis.purchaseConversionRate ?? 0
  )

  pushNumericSignal(signals, {
    absoluteThreshold: 100,
    category: "overview",
    comparisonValue: funnel.comparison?.kpis.sessions ?? null,
    currentValue: funnel.currentRange.kpis.sessions,
    deltaThresholdPct: 20,
    id: "traffic_sessions",
    likelyCauseHints: [
      "Traffic volume shifted materially versus the comparison period.",
      "Channel mix, paid delivery, seasonality, or tracking coverage may be contributing.",
    ],
    negativeTitle: "Sessions are materially down",
    positiveTitle: "Sessions are materially up",
    timingHint: describeWorstDay(
      overview.selectedRange.overviewRows,
      (row) => row.totalRevenue
    )
      ? `Most visible around ${describeWorstDay(
          overview.selectedRange.overviewRows,
          (row) => row.totalRevenue
        )} within the selected period.`
      : undefined,
    summaryFormatter(deltaPct, currentValue, comparisonValue) {
      return `Sessions moved ${deltaPct.toFixed(1)}% (${comparisonValue.toFixed(0)} to ${currentValue.toFixed(0)}) versus the comparison period.`
    },
  })

  pushNumericSignal(signals, {
    absoluteThreshold: 0.3,
    category: "overview",
    comparisonValue: funnel.comparison?.kpis.purchaseConversionRate ?? null,
    currentValue: funnel.currentRange.kpis.purchaseConversionRate,
    deltaThresholdPct: 15,
    id: "conversion_rate",
    likelyCauseHints: [
      "Site conversion shifted materially versus the comparison period.",
      "Intent quality, landing-page performance, merchandising, pricing, or checkout friction may have changed.",
    ],
    negativeTitle: "Conversion rate is materially down",
    positiveTitle: "Conversion rate is materially up",
    timingHint: funnel.currentRange.daily.length
      ? `Most visible around ${funnel.currentRange.daily.reduce((current, point) =>
          point.purchaseRate < current.purchaseRate ? point : current
        ).date} within the selected period.`
      : undefined,
    summaryFormatter(deltaPct, currentValue, comparisonValue) {
      return `Purchase conversion rate moved ${deltaPct.toFixed(1)}% (${comparisonValue.toFixed(2)}% to ${currentValue.toFixed(2)}%) versus the comparison period.`
    },
  })

  pushNumericSignal(signals, {
    absoluteThreshold: 100,
    category: "overview",
    comparisonValue: overview.selectedRange.comparisonTotals?.revenue ?? null,
    currentValue: overview.selectedRange.totals.revenue,
    deltaThresholdPct: 20,
    id: "overview_revenue",
    likelyCauseHints: [
      "Top-line trading shifted materially versus the comparison period.",
      "Traffic, conversion, AOV, product mix, or stock availability may be contributing.",
    ],
    negativeTitle: "Revenue is materially down",
    positiveTitle: "Revenue is materially up",
    timingHint: describeWorstDay(
      overview.selectedRange.overviewRows,
      (row) => row.totalRevenue
    )
      ? `Most visible around ${describeWorstDay(
          overview.selectedRange.overviewRows,
          (row) => row.totalRevenue
        )} within the selected period.`
      : undefined,
    summaryFormatter(deltaPct, currentValue, comparisonValue) {
      return `Revenue moved ${deltaPct.toFixed(1)}% (${comparisonValue.toFixed(2)} to ${currentValue.toFixed(2)}) versus the comparison period.`
    },
  })

  pushNumericSignal(signals, {
    absoluteThreshold: 2,
    category: "overview",
    comparisonValue: overview.selectedRange.comparisonTotals?.orders ?? null,
    currentValue: overview.selectedRange.totals.orders,
    deltaThresholdPct: 20,
    id: "overview_orders",
    likelyCauseHints: [
      "Order volume changed materially versus the comparison period.",
      "Traffic quality, conversion rate, or stock availability may be contributing.",
    ],
    negativeTitle: "Orders are materially down",
    positiveTitle: "Orders are materially up",
    timingHint: describeWorstDay(
      overview.selectedRange.overviewRows,
      (row) => row.totalOrders
    )
      ? `Most visible around ${describeWorstDay(
          overview.selectedRange.overviewRows,
          (row) => row.totalOrders
        )} within the selected period.`
      : undefined,
    summaryFormatter(deltaPct, currentValue, comparisonValue) {
      return `Orders moved ${deltaPct.toFixed(1)}% (${comparisonValue.toFixed(0)} to ${currentValue.toFixed(0)}) versus the comparison period.`
    },
  })

  pushNumericSignal(signals, {
    absoluteThreshold: 5,
    category: "overview",
    comparisonValue: overview.selectedRange.comparisonTotals?.aov ?? null,
    currentValue: overview.selectedRange.totals.aov,
    deltaThresholdPct: 15,
    id: "overview_aov",
    likelyCauseHints: [
      "Average order value shifted materially versus the comparison period.",
      "Product mix, discounting, bundling, or customer intent may have changed.",
    ],
    negativeTitle: "AOV is materially down",
    positiveTitle: "AOV is materially up",
    timingHint: describeWorstDay(
      overview.selectedRange.overviewRows,
      (row) => row.aov
    )
      ? `Most visible around ${describeWorstDay(
          overview.selectedRange.overviewRows,
          (row) => row.aov
        )} within the selected period.`
      : undefined,
    summaryFormatter(deltaPct, currentValue, comparisonValue) {
      return `AOV moved ${deltaPct.toFixed(1)}% (${comparisonValue.toFixed(2)} to ${currentValue.toFixed(2)}) versus the comparison period.`
    },
  })

  pushNumericSignal(signals, {
    absoluteThreshold: 100,
    category: "overview",
    comparisonValue: overview.selectedRange.comparisonTotals?.netProfit ?? null,
    currentValue: overview.selectedRange.totals.netProfit,
    deltaThresholdPct: 20,
    id: "overview_profit",
    likelyCauseHints: [
      "Profit deterioration is likely being driven by one or more of revenue weakness, cost pressure, product mix, or efficiency deterioration.",
      "Check whether tracking issues reduce confidence before treating this as purely commercial.",
    ],
    negativeTitle: "Net profit is materially down",
    positiveTitle: "Net profit is materially up",
    timingHint: describeWorstDay(
      overview.selectedRange.overviewRows,
      (row) => row.netProfit
    )
      ? `Worst daily net profit appears around ${describeWorstDay(
          overview.selectedRange.overviewRows,
          (row) => row.netProfit
        )} within the selected period.`
      : undefined,
    summaryFormatter(deltaPct, currentValue, comparisonValue) {
      return `Net profit moved ${deltaPct.toFixed(1)}% (${comparisonValue.toFixed(2)} to ${currentValue.toFixed(2)}) versus the comparison period.`
    },
  })

  if (
    overview.selectedRange.totals.adSpend > 50 ||
    (overview.selectedRange.comparisonTotals?.adSpend ?? 0) > 50
  ) {
    pushNumericSignal(signals, {
      absoluteThreshold: 25,
      category: "paid_media",
      comparisonValue: overview.selectedRange.comparisonTotals?.mer ?? null,
      currentValue: overview.selectedRange.totals.mer,
      deltaThresholdPct: 15,
      id: "overview_mer",
      likelyCauseHints: [
        "Blended efficiency changed materially versus the comparison period.",
        "This may reflect spend quality, conversion changes, AOV shifts, or attribution changes.",
      ],
      negativeTitle: "MER is materially down",
      positiveTitle: "MER is materially up",
      timingHint: describeWorstDay(
        overview.selectedRange.overviewRows,
        (row) => row.mer
      )
        ? `Most visible around ${describeWorstDay(
            overview.selectedRange.overviewRows,
            (row) => row.mer
          )} within the selected period.`
        : undefined,
      summaryFormatter(deltaPct, currentValue, comparisonValue) {
        return `MER moved ${deltaPct.toFixed(1)}% (${comparisonValue.toFixed(2)} to ${currentValue.toFixed(2)}) versus the comparison period.`
      },
    })
  }

  pushNumericSignal(signals, {
    absoluteThreshold: 0.3,
    category: "paid_media",
    comparisonValue: paidMedia.comparison?.totals.roas ?? null,
    currentValue: paidMedia.currentRange.totals.roas,
    deltaThresholdPct: 15,
    id: "paid_roas",
    negativeTitle: "Paid ROAS is down",
    positiveTitle: "Paid ROAS is up",
    timingHint: paidMedia.currentRange.trend.length
      ? `Most visible around ${paidMedia.currentRange.trend.reduce((current, point) =>
          point.roas < current.roas ? point : current
        ).date} within the selected period.`
      : undefined,
    summaryFormatter(deltaPct, currentValue, comparisonValue) {
      return `ROAS moved ${deltaPct.toFixed(1)}% (${comparisonValue.toFixed(2)} to ${currentValue.toFixed(2)}) on meaningful spend.`
    },
  })

  pushNumericSignal(signals, {
    absoluteThreshold: 5,
    category: "paid_media",
    comparisonValue: paidMedia.comparison?.totals.cpa ?? null,
    currentValue: paidMedia.currentRange.totals.cpa,
    deltaThresholdPct: 15,
    id: "paid_cpa",
    negativeIsPositive: true,
    negativeTitle: "Paid CPA is elevated",
    positiveTitle: "Paid CPA is improving",
    timingHint: paidMedia.currentRange.campaignRows.length
      ? `Most visible around ${paidMedia.currentRange.campaignRows.reduce((current, row) =>
          row.cpa > current.cpa ? row : current
        ).latestDate} within the selected period.`
      : undefined,
    summaryFormatter(deltaPct, currentValue, comparisonValue) {
      return `CPA moved ${deltaPct.toFixed(1)}% (${comparisonValue.toFixed(2)} to ${currentValue.toFixed(2)}).`
    },
  })

  if (
    sessionDeltaPct !== null &&
    conversionDeltaPct !== null &&
    (orderDeltaPct !== null || revenueDeltaPct !== null) &&
    sessionDeltaPct <= -60 &&
    conversionDeltaPct >= 250 &&
    ((orderDeltaPct ?? 0) >= 40 || (revenueDeltaPct ?? 0) >= 40)
  ) {
    signals.push({
      category: "freshness",
      comparisonValue: sessionDeltaPct,
      currentValue: conversionDeltaPct,
      deltaPct: conversionDeltaPct,
      id: "tracking_funnel_trade_mismatch",
      kind: "tracking",
      likelyCauseHints: [
        "The funnel and trading signals are moving in opposite directions strongly enough that tracking, attribution, or session capture quality is a more likely explanation than pure commercial improvement.",
        "Confirm analytics freshness and attribution integrity before treating the conversion jump as a real demand gain.",
      ],
      severity: "high",
      summary: `Sessions fell ${sessionDeltaPct.toFixed(1)}% while conversion rose ${conversionDeltaPct.toFixed(1)}% and trading output still increased materially.`,
      timingHint:
        describeHighestDay(overview.selectedRange.overviewRows, (row) => row.totalOrders)
          ? `The mismatch is most visible around ${describeHighestDay(
              overview.selectedRange.overviewRows,
              (row) => row.totalOrders
            )} within the selected period.`
          : "Detected from selected-period trading totals versus funnel totals.",
      title: "Traffic and trading signals are internally inconsistent",
    })
  }

  const emailChannelRows = funnel.currentRange.breakdowns.channel ?? []
  const emailChannelRow = emailChannelRows.find((row) =>
    String(row.label ?? "")
      .toLowerCase()
      .includes("email")
  )
  if (
    emailChannelRow &&
    (Number(emailChannelRow.sessions ?? 0) > 0 || Number(emailChannelRow.purchase ?? 0) > 0) &&
    Number(email.currentRange.kpis.sends ?? 0) === 0 &&
    Number(email.currentRange.kpis.revenue ?? 0) === 0
  ) {
    signals.push({
      category: "freshness",
      comparisonValue: Number(emailChannelRow.sessions ?? 0),
      currentValue: Number(emailChannelRow.purchase ?? 0),
      deltaPct: null,
      id: "tracking_email_mismatch",
      kind: "tracking",
      likelyCauseHints: [
        "Funnel data shows email-attributed activity, but lifecycle reporting shows zero sends and zero email revenue for the same scope.",
        "This points to attribution or source-label inconsistency rather than a clean commercial read.",
      ],
      severity:
        Number(emailChannelRow.purchase ?? 0) >= 3 || Number(emailChannelRow.sessions ?? 0) >= 50
          ? "high"
          : "medium",
      summary: `Funnel data attributes ${Number(emailChannelRow.sessions ?? 0).toFixed(0)} sessions and ${Number(emailChannelRow.purchase ?? 0).toFixed(0)} purchases to email while lifecycle reporting shows zero sends and zero revenue.`,
      timingHint: "Detected from channel funnel evidence versus lifecycle reporting within the selected period.",
      title: "Email attribution conflicts with lifecycle reporting",
    })
  }

  if (inventory.kpis.outOfStockVariants > 0) {
    signals.push({
      category: "inventory",
      comparisonValue: null,
      currentValue: inventory.kpis.outOfStockVariants,
      deltaPct: null,
      id: "inventory_out_of_stock",
      kind: "commercial",
      likelyCauseHints: [
        "Demand is exceeding current available inventory for affected variants.",
        "Replenishment timing or inventory planning may be lagging current sales velocity.",
      ],
      severity: "high",
      summary: `${inventory.kpis.outOfStockVariants} variants are already out of stock in the latest snapshot.`,
      timingHint: "Visible in the latest inventory snapshot for the selected scope.",
      title: "Variants are out of stock",
    })
  }

  if (inventory.kpis.atRiskVariants > 0) {
    signals.push({
      category: "inventory",
      comparisonValue: null,
      currentValue: inventory.kpis.atRiskVariants,
      deltaPct: null,
      id: "inventory_at_risk",
      kind: "commercial",
      likelyCauseHints: [
        "Current stock cover is low relative to recent sales velocity.",
        "If demand holds, stockouts or missed revenue may follow soon.",
      ],
      severity: inventory.kpis.atRiskVariants >= 5 ? "high" : "medium",
      summary: `${inventory.kpis.atRiskVariants} variants are flagged at risk based on current stock and sales velocity.`,
      timingHint: "Visible in the latest inventory snapshot using recent sales velocity within the selected scope.",
      title: "Inventory risk is elevated",
    })
  }

  pushNumericSignal(signals, {
    absoluteThreshold: 100,
    category: "email",
    comparisonValue: email.comparison?.kpis.revenue ?? null,
    currentValue: email.currentRange.kpis.revenue,
    deltaThresholdPct: 20,
    id: "email_revenue",
    negativeTitle: "Email revenue is down",
    positiveTitle: "Email revenue is up",
    likelyCauseHints: [
      "Lifecycle or campaign contribution changed materially versus the comparison period.",
      "Send volume, audience quality, or deliverability may have shifted.",
    ],
    summaryFormatter(deltaPct, currentValue, comparisonValue) {
      return `Email revenue moved ${deltaPct.toFixed(1)}% (${comparisonValue.toFixed(2)} to ${currentValue.toFixed(2)}) versus the comparison period.`
    },
  })

  pushNumericSignal(signals, {
    absoluteThreshold: 5,
    category: "email",
    comparisonValue: email.comparison?.kpis.openRate ?? null,
    currentValue: email.currentRange.kpis.openRate,
    deltaThresholdPct: 15,
    id: "email_open_rate",
    negativeTitle: "Email open rate is down",
    positiveTitle: "Email open rate is up",
    likelyCauseHints: [
      "Deliverability, audience quality, or subject-line relevance may have changed.",
      "If send volume is low, treat this as directional rather than definitive.",
    ],
    summaryFormatter(deltaPct, currentValue, comparisonValue) {
      return `Email open rate moved ${deltaPct.toFixed(1)}% (${comparisonValue.toFixed(1)}% to ${currentValue.toFixed(1)}%) versus the comparison period.`
    },
  })

  const topProduct = productsCurrent.currentRange.breakdowns.product[0]
  const comparisonTopProduct = productsComparison?.currentRange.breakdowns.product[0] ?? null
  const visibleTopProductRevenue = productsCurrent.currentRange.breakdowns.product.reduce(
    (sum, row) => sum + row.totalSales,
    0
  )
  const previousVisibleTopRevenue = productsComparison?.currentRange.breakdowns.product.reduce(
    (sum, row) => sum + row.totalSales,
    0
  ) ?? 0
  const previousTopSharePct =
    comparisonTopProduct && previousVisibleTopRevenue > 0
      ? (comparisonTopProduct.totalSales / previousVisibleTopRevenue) * 100
      : null
  const concentrationDenominator = Math.max(
    overview.selectedRange.totals.revenue,
    visibleTopProductRevenue
  )
  if (
    topProduct &&
    concentrationDenominator > 0 &&
    topProduct.totalSales / concentrationDenominator >= 0.6
  ) {
    const sharePct = (topProduct.totalSales / concentrationDenominator) * 100
    signals.push({
      category: "overview",
      comparisonValue: previousTopSharePct,
      currentValue: sharePct,
      deltaPct: percentDelta(sharePct, previousTopSharePct ?? sharePct),
      id: "overview_product_concentration",
      kind: "commercial",
      likelyCauseHints: [
        "A single product is carrying a large share of revenue in the selected period.",
        "That concentration increases exposure to stock, demand, or conversion changes on one item.",
      ],
      severity: sharePct >= 75 ? "high" : "medium",
      summary: `${topProduct.product} accounts for ${sharePct.toFixed(1)}% of visible top-product revenue in the selected period${previousTopSharePct !== null ? ` versus ${previousTopSharePct.toFixed(1)}% in the comparison period` : ""}.`,
      timingHint: "Observed across the full selected period from top product contribution.",
      title: "Revenue is concentrated in one product",
    })
  }

  const failedJobs = settings.syncs.recentJobRuns.filter(
    (job) => String(job.status).toLowerCase() === "failed"
  )

  if (failedJobs.length > 0) {
    signals.push({
      category: "freshness",
      comparisonValue: null,
      currentValue: failedJobs.length,
      deltaPct: null,
      id: "freshness_failed_jobs",
      kind: "tracking",
      likelyCauseHints: [
        "Recent data jobs failed and some dashboards or warehouse slices may be incomplete.",
        "This may be a data freshness or pipeline reliability issue rather than a true commercial shift.",
      ],
      severity: "high",
      summary: `${failedJobs.length} recent job runs failed, including ${failedJobs[0]?.jobName ?? "a recent job"}.`,
      timingHint: "Detected from recent operational history within the selected workspace.",
      title: "Recent job failures detected",
    })
  }

  const stalestSync = settings.syncs.syncState.reduce<{
    hours: number | null
    row: (typeof settings.syncs.syncState)[number] | null
  }>(
    (current, row) => {
      const hours = hoursSince(row.updatedAt)

      if (hours === null) {
        return current
      }

      if (current.hours === null || hours > current.hours) {
        return {
          hours,
          row,
        }
      }

      return current
    },
    {
      hours: null,
      row: null,
    }
  )

  if (stalestSync.hours !== null && stalestSync.hours >= 48) {
    signals.push({
      category: "freshness",
      comparisonValue: null,
      currentValue: stalestSync.hours,
      deltaPct: null,
      id: "freshness_stale_sync",
      kind: "tracking",
      likelyCauseHints: [
        "A source has not refreshed recently, so warehouse-backed reporting may be stale.",
        "Apparent changes may reflect delayed ingestion rather than real commercial movement.",
        describeFreshnessImpact(
          stalestSync.row?.sourceKey ?? "",
          stalestSync.row?.stateKey ?? ""
        ),
      ],
      severity: stalestSync.hours >= 72 ? "high" : "medium",
      summary: `${stalestSync.row?.sourceKey ?? "A source"}:${stalestSync.row?.stateKey ?? "state"} has not updated for ${stalestSync.hours.toFixed(1)} hours.`,
      timingHint: "Detected from connector and sync-state freshness timestamps.",
      title: "Data freshness is stale",
    })
  }

  signals.sort((left, right) => {
    const severityWeight = left.severity === right.severity
      ? 0
      : left.severity === "high"
        ? -1
        : 1

    if (severityWeight !== 0) {
      return severityWeight
    }

    const leftMagnitude = Math.abs(left.deltaPct ?? left.currentValue ?? 0)
    const rightMagnitude = Math.abs(right.deltaPct ?? right.currentValue ?? 0)

    return rightMagnitude - leftMagnitude
  })

  const flaggedCategories = new Set(
    signals.map((signal) => {
      if (signal.id === "traffic_sessions" || signal.id === "conversion_rate") {
        return "traffic_conversion"
      }

      if (
        signal.id === "tracking_funnel_trade_mismatch" ||
        signal.id === "tracking_email_mismatch"
      ) {
        return "freshness"
      }

      return signal.category
    })
  )

  const coverage: AgentAnomalyCoverage[] = [
    {
      category: "overview",
      label: "Revenue, orders, AOV, profit",
      note: `Checked revenue ${overview.selectedRange.totals.revenue.toFixed(2)} vs ${(overview.selectedRange.comparisonTotals?.revenue ?? 0).toFixed(2)}, orders ${overview.selectedRange.totals.orders.toFixed(0)} vs ${(overview.selectedRange.comparisonTotals?.orders ?? 0).toFixed(0)}, AOV ${overview.selectedRange.totals.aov.toFixed(2)} vs ${(overview.selectedRange.comparisonTotals?.aov ?? 0).toFixed(2)}, and net profit ${overview.selectedRange.totals.netProfit.toFixed(2)} vs ${(overview.selectedRange.comparisonTotals?.netProfit ?? 0).toFixed(2)}.`,
      status: flaggedCategories.has("overview") ? "flagged" : "clear",
    },
    {
      category: "traffic_conversion",
      label: "Traffic and conversion",
      note:
        funnel.comparison && funnel.currentRange.kpis.sessions > 0
          ? `Checked sessions ${funnel.currentRange.kpis.sessions.toFixed(0)} vs ${funnel.comparison.kpis.sessions.toFixed(0)} and conversion ${funnel.currentRange.kpis.purchaseConversionRate.toFixed(2)}% vs ${funnel.comparison.kpis.purchaseConversionRate.toFixed(2)}% from the Shopify funnel slice.`
          : "Traffic and conversion comparison was limited because funnel comparison data was unavailable or too sparse.",
      status:
        flaggedCategories.has("traffic_conversion")
          ? "flagged"
          : funnel.comparison && funnel.currentRange.kpis.sessions > 0
            ? "clear"
            : "limited",
    },
    {
      category: "paid_media",
      label: "Paid media efficiency",
      note: `Checked spend ${paidMedia.currentRange.totals.spend.toFixed(2)} vs ${(paidMedia.comparison?.totals.spend ?? 0).toFixed(2)}, ROAS ${paidMedia.currentRange.totals.roas.toFixed(2)} vs ${(paidMedia.comparison?.totals.roas ?? 0).toFixed(2)}, and CPA ${paidMedia.currentRange.totals.cpa.toFixed(2)} vs ${(paidMedia.comparison?.totals.cpa ?? 0).toFixed(2)} where spend was meaningful.`,
      status: flaggedCategories.has("paid_media") ? "flagged" : "clear",
    },
    {
      category: "inventory",
      label: "Inventory position",
      note: `Checked ${inventory.kpis.outOfStockVariants.toFixed(0)} out-of-stock and ${inventory.kpis.atRiskVariants.toFixed(0)} at-risk variants from ${inventory.kpis.trackedVariants.toFixed(0)} tracked variants in the latest snapshot.`,
      status: flaggedCategories.has("inventory") ? "flagged" : "clear",
    },
    {
      category: "email",
      label: "Email and lifecycle contribution",
      note: `Checked email revenue ${email.currentRange.kpis.revenue.toFixed(2)} vs ${(email.comparison?.kpis.revenue ?? 0).toFixed(2)}, open rate ${email.currentRange.kpis.openRate.toFixed(1)}% vs ${(email.comparison?.kpis.openRate ?? 0).toFixed(1)}%, and sends ${email.currentRange.kpis.sends.toFixed(0)} vs ${(email.comparison?.kpis.sends ?? 0).toFixed(0)}.`,
      status: flaggedCategories.has("email") ? "flagged" : "clear",
    },
    {
      category: "freshness",
      label: "Data freshness and recent jobs",
      note: "Recent job failures and stale syncs were checked before trusting commercial conclusions.",
      status: flaggedCategories.has("freshness") ? "flagged" : "clear",
    },
  ]

  return {
    coverage,
    generatedAt: new Date().toISOString(),
    signalCount: signals.length,
    signals,
    summary:
      signals.length > 0
        ? `${signals.length} anomaly signals found across revenue, ads, inventory, email, and freshness.`
        : "No material anomaly signals crossed the default thresholds for this scope.",
  }
}
