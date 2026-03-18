import "server-only"

import path from "node:path"
import { readFileSync } from "node:fs"

import { compactText } from "@/lib/agent/utils"

type AgentSystemPromptMode =
  | "analysis"
  | "direct"
  | "date_clarification"
  | "worker_plan"

const AGENT_SYSTEM_DOC_PATH = path.resolve(
  process.cwd(),
  "docs/ecomdash2/agent-system.md"
)

const DEFAULT_AGENT_SYSTEM_DOC = `
# EcomDash2 Agent

You are an internal ecommerce analysis agent inside EcomDash2.

Core rules:
- be commercially useful, not generic
- prefer evidence from tools and data over guesswork
- ask a follow-up when time scope or business intent is unclear
- separate facts from recommendations
- be explicit about caveats, stale data, and low confidence
- do not invent unavailable metrics

Tool usage:
- overview summary: core trading KPIs and high-level performance
- paid media performance: spend, revenue, efficiency, and campaign/channel breakdowns
- product performance: product revenue, units, and matched product analysis
- inventory risk: stock and at-risk availability
- email performance: sends, opens, clicks, revenue, and lifecycle contribution
- anomaly scan: deterministic anomaly signals derived from warehouse-backed slices
`.trim()

function readAgentSystemDoc() {
  try {
    return readFileSync(AGENT_SYSTEM_DOC_PATH, "utf8").trim()
  } catch {
    return DEFAULT_AGENT_SYSTEM_DOC
  }
}

function buildModeInstructions(mode: AgentSystemPromptMode) {
  switch (mode) {
    case "direct":
      return [
        "You are EcomDash2 Agent inside an ecommerce dashboard.",
        "Reply naturally and briefly.",
        "Do not pretend you analysed data when no tools were used.",
        "If the user greets you, greet them back.",
        "If the user asks what you can do, describe the business analysis areas you cover.",
        "If the user is off-topic, steer them back to ecommerce analysis.",
      ].join("\n")
    case "date_clarification":
      return [
        "You are EcomDash2 Agent inside an ecommerce dashboard.",
        "The user asked an analysis question without a time period.",
        "Ask one concise follow-up asking what date range to use before you answer.",
        "Do not analyse data yet.",
        "Do not mention internal system details.",
      ].join("\n")
    case "worker_plan":
      return [
        "You generate constrained JavaScript analysis code for a read-only ecommerce analytics worker.",
        "Prefer approved datasets first and only fall back to SQL when needed.",
        "Return only the requested JSON shape.",
      ].join("\n")
    case "analysis":
    default:
      return [
        "You are EcomDash2 Agent, a cautious internal ecommerce analyst.",
        "Give actionable answers tied to evidence.",
        "Use concise markdown.",
        "Separate facts from recommendations.",
        "If confidence is limited, say so clearly.",
        "For simple factual queries (one metric, one date, one channel), answer in 1–2 direct sentences.",
        "Reserve structured sections for multi-metric diagnostic questions where structure aids clarity.",
        "Never add a Recommendations section unless the user explicitly asked for recommendations.",
      ].join("\n")
  }
}

export function buildAgentSystemPrompt(input: {
  mode: AgentSystemPromptMode
  businessProfile?: string | null
}) {
  const businessProfile = compactText(String(input.businessProfile ?? "").trim(), 2400)
  const includeOperatingBrief =
    input.mode === "analysis" || input.mode === "worker_plan"

  const promptSections = [
    buildModeInstructions(input.mode),
    includeOperatingBrief
      ? `Agent operating brief:\n${compactText(readAgentSystemDoc(), 3200)}`
      : "",
    businessProfile
      ? `Workspace business brief:\n${businessProfile}`
      : [
          "Workspace business brief:",
          "No custom business brief is configured for this workspace.",
          "Use only the actual tool outputs and the user's question as business context.",
        ].join("\n"),
  ]

  return promptSections.filter(Boolean).join("\n\n")
}
