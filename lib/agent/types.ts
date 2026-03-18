import type { DashboardCompareMode } from "@/types/dashboard"

export type AgentProvider = "openai" | "anthropic"

export type AgentExecutionMode = "direct" | "tools" | "worker"

export type AgentRunStatus =
  | "success"
  | "failed"
  | "needs_confirmation"
  | "blocked"

export type AgentPresetId =
  | "daily-trading-pulse"
  | "anomaly-and-issue-scan"
  | "last-7-days-commercial-review"
  | "last-month-board-summary"
  | "paid-media-diagnostics"
  | "product-and-merchandising-performance"
  | "inventory-risk-and-missed-revenue"
  | "email-and-retention-performance"

export type AgentDashboardContext = {
  workspaceId: string
  from: string
  to: string
  compare: DashboardCompareMode
}

export type AgentModelOption = {
  id: string
  label: string
}

export type AgentPresetListItem = {
  id: AgentPresetId
  label: string
  description: string
  defaultMessage: string
  titleSeed: string
}

export type AgentProviderUsage = {
  inputTokens?: number
  outputTokens?: number
}

export type AgentUsageSegment = {
  estimatedCostUsd?: number
  inputTokens: number
  label: string
  model?: string
  outputTokens: number
  provider?: AgentProvider
}

export type AgentUsageSummary = {
  estimatedCostUsd?: number
  inputTokens: number
  model: string
  outputTokens: number
  priceSourceLabel?: string
  priceSourceUrl?: string
  provider: AgentProvider
  segments: AgentUsageSegment[]
  totalTokens: number
}

export type AgentCompletionInput = {
  apiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
}

export type AgentCompletionResult = {
  text: string
  usage?: AgentProviderUsage
}

export type AgentProviderAdapter = {
  listModels: (apiKey: string) => Promise<AgentModelOption[]>
  complete: (input: AgentCompletionInput) => Promise<AgentCompletionResult>
}

export type AgentWorkspaceSettings = {
  workspaceId: string
  provider: AgentProvider | null
  model: string
  businessProfile: string
  hasKeyByProvider: Record<AgentProvider, boolean>
  apiKeyByProvider: Partial<Record<AgentProvider, string>>
  updatedAt: string | null
}

export type AgentStorageMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type AgentStorageConversation = {
  id: string
  workspaceId: string
  title: string
  summaryText: string | null
  summaryUpdatedAt: string | null
  provider: string
  model: string
  createdAt: string
  updatedAt: string
  lastMessageAt: string
}

export type AgentToolName =
  | "ad_performance"
  | "ad_segments"
  | "anomaly_scan"
  | "creative_performance"
  | "data_freshness"
  | "email_performance"
  | "inventory_risk"
  | "overview_summary"
  | "paid_media_summary"
  | "product_performance"
  | "traffic_conversion"

export type AgentToolResult = {
  name: string
  label: string
  summary: string
  data: Record<string, unknown>
  evidence?: Record<string, unknown>
}

export type AgentChartKind = "bar" | "line"

export type AgentChartValueFormat = "currency" | "number" | "percent"

export type AgentChartSeries = {
  key: string
  label: string
  color: string
  format?: AgentChartValueFormat
}

export type AgentChartSpec = {
  id: string
  title: string
  description?: string
  kind: AgentChartKind
  xKey: string
  rows: Array<Record<string, number | string | null>>
  series: AgentChartSeries[]
}

export type AgentRunResult = {
  conversationId: string
  runId: string
  executionMode: AgentExecutionMode
  assistantMessage: AgentStorageMessage
  usedTools: string[]
  warnings: string[]
  requestedOps: string[]
}

export type AgentBrokerTokenPayload = {
  capabilities: Array<"datasets" | "sql" | "ops">
  allowedOps: string[]
  expiresAt: number
  runId: string
  workspaceId: string
}

export type AgentExecutorRequest = {
  runId: string
  question: string
  context: AgentDashboardContext
  scriptBody: string
  brokerToken: string
  brokerBaseUrl: string
  confirmedOps: string[]
  allowedOps: string[]
}

export type AgentExecutorResult = {
  logs: string[]
  opsDispatched: string[]
  result: Record<string, unknown>
  sqlQueries: string[]
  warnings: string[]
}
