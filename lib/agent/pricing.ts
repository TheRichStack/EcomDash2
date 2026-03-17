import type {
  AgentProvider,
  AgentProviderUsage,
  AgentUsageSegment,
  AgentUsageSummary,
} from "@/lib/agent/types"

type ModelPricing = {
  inputPerMillionUsd: number
  outputPerMillionUsd: number
  sourceLabel: string
  sourceUrl: string
}

const OPENAI_PRICING: Array<{
  match: (model: string) => boolean
  pricing: ModelPricing
}> = [
  {
    match: (model) => model.startsWith("gpt-5.4-pro"),
    pricing: {
      inputPerMillionUsd: 30,
      outputPerMillionUsd: 180,
      sourceLabel: "OpenAI GPT-5.4 pro pricing",
      sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.4-pro",
    },
  },
  {
    match: (model) => model.startsWith("gpt-5.4"),
    pricing: {
      inputPerMillionUsd: 2.5,
      outputPerMillionUsd: 15,
      sourceLabel: "OpenAI GPT-5.4 pricing",
      sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.4",
    },
  },
  {
    match: (model) => model.startsWith("gpt-5-pro"),
    pricing: {
      inputPerMillionUsd: 15,
      outputPerMillionUsd: 120,
      sourceLabel: "OpenAI GPT-5 pro pricing",
      sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5-pro",
    },
  },
  {
    match: (model) => model.startsWith("gpt-5-mini"),
    pricing: {
      inputPerMillionUsd: 0.25,
      outputPerMillionUsd: 2,
      sourceLabel: "OpenAI models pricing",
      sourceUrl: "https://developers.openai.com/api/docs/models",
    },
  },
  {
    match: (model) => model.startsWith("gpt-5"),
    pricing: {
      inputPerMillionUsd: 1.25,
      outputPerMillionUsd: 10,
      sourceLabel: "OpenAI GPT-5 pricing",
      sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5",
    },
  },
]

const ANTHROPIC_PRICING: Array<{
  match: (model: string) => boolean
  pricing: ModelPricing
}> = [
  {
    match: (model) =>
      model.startsWith("claude-opus-4-6") || model.startsWith("claude-opus-4-5"),
    pricing: {
      inputPerMillionUsd: 5,
      outputPerMillionUsd: 25,
      sourceLabel: "Anthropic Opus 4.6/4.5 pricing",
      sourceUrl: "https://claude.com/pricing",
    },
  },
  {
    match: (model) =>
      model.startsWith("claude-sonnet-4-6") ||
      model.startsWith("claude-sonnet-4-5") ||
      model.startsWith("claude-sonnet-4") ||
      model.startsWith("claude-sonnet-3-7") ||
      model.startsWith("claude-sonnet-3-5"),
    pricing: {
      inputPerMillionUsd: 3,
      outputPerMillionUsd: 15,
      sourceLabel: "Anthropic Sonnet pricing",
      sourceUrl: "https://claude.com/pricing",
    },
  },
  {
    match: (model) =>
      model.startsWith("claude-opus-4-1") || model.startsWith("claude-opus-4"),
    pricing: {
      inputPerMillionUsd: 15,
      outputPerMillionUsd: 75,
      sourceLabel: "Anthropic Opus 4.1/4 pricing",
      sourceUrl: "https://claude.com/pricing",
    },
  },
  {
    match: (model) => model.includes("sonnet"),
    pricing: {
      inputPerMillionUsd: 3,
      outputPerMillionUsd: 15,
      sourceLabel: "Anthropic Sonnet pricing",
      sourceUrl: "https://claude.com/pricing",
    },
  },
  {
    match: (model) => model.includes("opus"),
    pricing: {
      inputPerMillionUsd: 5,
      outputPerMillionUsd: 25,
      sourceLabel: "Anthropic Opus pricing",
      sourceUrl: "https://claude.com/pricing",
    },
  },
]

function resolveModelPricing(
  provider: AgentProvider,
  model: string
): ModelPricing | null {
  const normalizedModel = String(model ?? "").trim().toLowerCase()

  if (!normalizedModel) {
    return null
  }

  if (provider === "openai") {
    return (
      OPENAI_PRICING.find((entry) => entry.match(normalizedModel))?.pricing ?? null
    )
  }

  if (provider === "anthropic") {
    return (
      ANTHROPIC_PRICING.find((entry) => entry.match(normalizedModel))?.pricing ??
      null
    )
  }

  return null
}

export function estimateUsageCostUsd(input: {
  inputTokens: number
  outputTokens: number
  model: string
  provider: AgentProvider
}) {
  const pricing = resolveModelPricing(input.provider, input.model)

  if (!pricing) {
    return null
  }

  const inputCost =
    (Math.max(0, input.inputTokens) / 1_000_000) * pricing.inputPerMillionUsd
  const outputCost =
    (Math.max(0, input.outputTokens) / 1_000_000) * pricing.outputPerMillionUsd

  return {
    costUsd: inputCost + outputCost,
    pricing,
  }
}

export function buildUsageSegment(input: {
  label: string
  model: string
  provider: AgentProvider
  usage?: AgentProviderUsage
}): AgentUsageSegment | null {
  const inputTokens = Math.max(0, Number(input.usage?.inputTokens ?? 0))
  const outputTokens = Math.max(0, Number(input.usage?.outputTokens ?? 0))

  if (inputTokens === 0 && outputTokens === 0) {
    return null
  }

  const estimate = estimateUsageCostUsd({
    inputTokens,
    outputTokens,
    model: input.model,
    provider: input.provider,
  })

  return {
    estimatedCostUsd: estimate?.costUsd,
    inputTokens,
    label: input.label,
    outputTokens,
  }
}

export function buildUsageSummary(input: {
  model: string
  provider: AgentProvider
  segments: AgentUsageSegment[]
}): AgentUsageSummary | null {
  if (input.segments.length === 0) {
    return null
  }

  const pricing = resolveModelPricing(input.provider, input.model)
  const inputTokens = input.segments.reduce(
    (sum, segment) => sum + segment.inputTokens,
    0
  )
  const outputTokens = input.segments.reduce(
    (sum, segment) => sum + segment.outputTokens,
    0
  )
  const estimatedCostUsd = input.segments.reduce((sum, segment) => {
    return sum + Number(segment.estimatedCostUsd ?? 0)
  }, 0)

  return {
    estimatedCostUsd: pricing ? estimatedCostUsd : undefined,
    inputTokens,
    model: input.model,
    outputTokens,
    priceSourceLabel: pricing?.sourceLabel,
    priceSourceUrl: pricing?.sourceUrl,
    provider: input.provider,
    segments: input.segments,
    totalTokens: inputTokens + outputTokens,
  }
}
