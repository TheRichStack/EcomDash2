import type { AgentProvider } from "@/lib/agent/types"

export const AGENT_CONFIG_KEYS = {
  businessProfile: "ecomdash2.agent.business_profile",
  provider: "ecomdash2.agent.provider",
  model: "ecomdash2.agent.model",
} as const

export const AGENT_TOKEN_KEYS: Record<AgentProvider, string> = {
  openai: "ecomdash2.agent.openai_api_key",
  anthropic: "ecomdash2.agent.anthropic_api_key",
}

export const AGENT_ALLOWED_OPS = [
  "jobs:contracts:refresh",
  "jobs:hourly",
  "jobs:reconcile",
] as const

export const AGENT_DATASET_NAMES = [
  "overview_slice",
  "paid_media_slice",
  "shopify_inventory_slice",
  "shopify_products_slice",
  "email_slice",
  "settings_slice",
] as const

export const AGENT_EVENT_CONTENT_TYPE = "application/x-ndjson; charset=utf-8"

export const AGENT_MAX_MESSAGE_CHARS = 1200
export const AGENT_MAX_PRESET_MESSAGE_CHARS = 12000
export const AGENT_MAX_TOOL_COUNT = 5
export const AGENT_MAX_COMPLETION_TOKENS = 2000
export const AGENT_MAX_DIRECT_COMPLETION_TOKENS = 160
export const AGENT_MAX_PLAN_TOKENS = 700
export const AGENT_PROMPT_HISTORY_SUMMARY_CHARS = 700
export const AGENT_PROMPT_HISTORY_USER_CHARS = 360
export const AGENT_PROMPT_HISTORY_ASSISTANT_CHARS = 360
export const AGENT_PROMPT_TOOL_SUMMARY_CHARS = 320
export const AGENT_PROMPT_EVIDENCE_TOTAL_CHARS_TOOLS = 2800
export const AGENT_PROMPT_EVIDENCE_PER_TOOL_CHARS_TOOLS = 900
export const AGENT_PROMPT_EVIDENCE_TOTAL_CHARS_WORKER_PLAN = 1800
export const AGENT_PROMPT_EVIDENCE_PER_TOOL_CHARS_WORKER_PLAN = 900
