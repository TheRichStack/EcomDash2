import { z } from "zod"
import { runAgentTools } from "@/lib/agent/tools"
import { buildMcpContext } from "./context"
import type { AgentToolName } from "@/lib/agent/types"
import type { DashboardCompareMode } from "@/types/dashboard"

const dateRangeSchema = {
  from: z.string().describe("Start date in YYYY-MM-DD format. Example: 2026-02-01"),
  to: z.string().describe("End date in YYYY-MM-DD format. Example: 2026-02-28"),
  compare: z
    .enum(["none", "previous_period", "previous_year"])
    .optional()
    .default("none")
    .describe("Period comparison mode. Default: none"),
}

type DateRangeParams = {
  from: string
  to: string
  compare: DashboardCompareMode
}

type McpToolContent = Array<{ type: "text"; text: string }>

type McpToolDefinition = {
  name: AgentToolName
  description: string
  schema: typeof dateRangeSchema
  handler: (params: DateRangeParams, workspaceId: string) => Promise<{ content: McpToolContent }>
}

function makeHandler(toolName: AgentToolName) {
  return async (params: DateRangeParams, workspaceId: string) => {
    const results = await runAgentTools({
      context: buildMcpContext(workspaceId, params.from, params.to, params.compare),
      message: "",
      toolNames: [toolName],
    })
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(results[0]?.data ?? {}, null, 2),
        },
      ],
    }
  }
}

const TOOL_DEFS: Array<{ name: AgentToolName; description: string }> = [
  {
    name: "overview_summary",
    description:
      "Revenue, orders, AOV, blended ROAS, and spend for a date range. Use for top-level trading performance, daily/weekly/monthly summaries, and period-over-period comparisons.",
  },
  {
    name: "traffic_conversion",
    description:
      "Sessions, purchase conversion rate, and order funnel breakdown. Use for questions about site traffic, conversion rate drops, or funnel performance.",
  },
  {
    name: "paid_media_summary",
    description:
      "Spend, impressions, ROAS, and CPA by channel and campaign. Use for paid media performance, channel efficiency, or budget questions.",
  },
  {
    name: "ad_performance",
    description:
      "Ad-level and adset-level metrics including hook rate and view-through rate. Use for creative diagnostics, ad fatigue, or specific campaign deep-dives.",
  },
  {
    name: "ad_segments",
    description:
      "Performance broken down by country, device, and audience segment. Use for geographic, device-type, or audience targeting questions.",
  },
  {
    name: "creative_performance",
    description:
      "Creative-level spend, ROAS, and hook rate. Use when comparing individual creatives or diagnosing why creative performance has changed.",
  },
  {
    name: "budget_vs_actual",
    description:
      "Monthly budget targets vs actual spend pacing. Use for budget pacing questions, underspend, or overspend analysis.",
  },
  {
    name: "order_analysis",
    description:
      "Orders by UTM source, channel, country, and new vs returning customer split. Use for channel attribution, geographic breakdown, or customer-type questions.",
  },
  {
    name: "customer_cohorts",
    description:
      "LTV curves, retention rates, and acquisition volume by monthly cohort. Use for retention, repeat purchase rate, or customer quality questions.",
  },
  {
    name: "inventory_risk",
    description:
      "Stock levels, days of inventory remaining, and stockout risk by product. Use for inventory health, replenishment planning, or stockout risk questions.",
  },
  {
    name: "product_performance",
    description:
      "Product and variant-level sales, units, revenue, and gross margin. Use for product mix, bestseller, or margin analysis questions.",
  },
  {
    name: "email_performance",
    description:
      "Campaign and flow metrics including open rate, click rate, and attributed revenue. Use for email channel performance, Klaviyo flow health, or email ROI questions.",
  },
  {
    name: "anomaly_scan",
    description:
      "Scans all key metrics for unusual movements relative to the recent baseline. Use when something seems off, for anomaly detection, or to identify what changed and when.",
  },
  {
    name: "data_freshness",
    description:
      "Last sync timestamps for each data connector (Shopify, Meta, Google, TikTok, Klaviyo). Use when the user asks about data recency or connector health.",
  },
]

export function getMcpToolDefinitions(): McpToolDefinition[] {
  return TOOL_DEFS.map(({ name, description }) => ({
    name,
    description,
    schema: dateRangeSchema,
    handler: makeHandler(name),
  }))
}
