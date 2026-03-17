import { createHash } from "node:crypto"
import { env } from "@/lib/env"
import {
  completeWithAnthropic,
  listAnthropicModels,
} from "@/lib/agent/providers/anthropic"
import {
  completeWithOpenAi,
  listOpenAiModels,
} from "@/lib/agent/providers/openai"
import type {
  AgentCompletionInput,
  AgentCompletionResult,
  AgentModelOption,
  AgentProvider,
  AgentProviderAdapter,
} from "@/lib/agent/types"
import { extractJsonObject } from "@/lib/agent/utils"

const PROVIDERS: Record<AgentProvider, AgentProviderAdapter> = {
  openai: {
    complete: completeWithOpenAi,
    listModels: listOpenAiModels,
  },
  anthropic: {
    complete: completeWithAnthropic,
    listModels: listAnthropicModels,
  },
}

const AUTO_MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000

type AutoModelCacheEntry = {
  model: string
  expiresAt: number
}

const autoModelResolutionCache = new Map<string, AutoModelCacheEntry>()

function toApiKeyFingerprint(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16)
}

function buildAutoModelCacheKey(input: { provider: AgentProvider; apiKey: string }) {
  return `${input.provider}:${toApiKeyFingerprint(input.apiKey)}`
}

function readAutoModelCache(cacheKey: string, now = Date.now()) {
  const cached = autoModelResolutionCache.get(cacheKey)

  if (!cached) {
    return null
  }

  if (cached.expiresAt <= now) {
    autoModelResolutionCache.delete(cacheKey)
    return null
  }

  return cached.model
}

function writeAutoModelCache(cacheKey: string, model: string, now = Date.now()) {
  for (const [key, entry] of autoModelResolutionCache.entries()) {
    if (entry.expiresAt <= now) {
      autoModelResolutionCache.delete(key)
    }
  }

  autoModelResolutionCache.set(cacheKey, {
    model,
    expiresAt: now + AUTO_MODEL_CACHE_TTL_MS,
  })
}

function pickPreferredModel(
  models: AgentModelOption[],
  preferredFragments: readonly string[],
  fallback: string
) {
  for (const fragment of preferredFragments) {
    const normalizedFragment = fragment.toLowerCase()
    const exactMatch = models.find(
      (model) => model.id.toLowerCase() === normalizedFragment
    )

    if (exactMatch) {
      return exactMatch.id
    }

    const match = models.find((model) =>
      model.id.toLowerCase().includes(normalizedFragment)
    )

    if (match) {
      return match.id
    }
  }

  return models[0]?.id || fallback
}

export function getAgentProviderAdapter(provider: AgentProvider) {
  return PROVIDERS[provider]
}

export async function listProviderModels(
  provider: AgentProvider,
  apiKey: string
) {
  return getAgentProviderAdapter(provider).listModels(apiKey)
}

export async function resolveProviderModel(input: {
  apiKey: string
  provider: AgentProvider
  selectedModel: string
}) {
  if (input.selectedModel && input.selectedModel !== "auto") {
    return input.selectedModel
  }

  const cacheKey = buildAutoModelCacheKey({
    provider: input.provider,
    apiKey: input.apiKey,
  })
  const cachedModel = readAutoModelCache(cacheKey)

  if (cachedModel) {
    return cachedModel
  }

  const models = await listProviderModels(input.provider, input.apiKey)
  const fallback =
    input.provider === "openai"
      ? env.agent.defaultModels.openai
      : env.agent.defaultModels.anthropic

  const resolvedModel =
    input.provider === "openai"
    ? pickPreferredModel(models, ["gpt-5.4", "gpt-5", "gpt-5-mini"], fallback)
    : pickPreferredModel(models, ["sonnet", "opus"], fallback)

  writeAutoModelCache(cacheKey, resolvedModel)

  return resolvedModel
}

const ROUTER_MODEL_PREFERENCES: Record<AgentProvider, readonly string[]> = {
  openai: ["gpt-5-mini", "gpt-5", "gpt-5.4"],
  anthropic: ["haiku", "sonnet", "claude-sonnet-4-5"],
}

function pickRouterModelFromAvailable(
  models: AgentModelOption[],
  provider: AgentProvider
) {
  for (const fragment of ROUTER_MODEL_PREFERENCES[provider]) {
    const normalizedFragment = fragment.toLowerCase()
    const exactMatch = models.find(
      (model) => model.id.toLowerCase() === normalizedFragment
    )

    if (exactMatch) {
      return exactMatch.id
    }

    const partialMatch = models.find((model) =>
      model.id.toLowerCase().includes(normalizedFragment)
    )

    if (partialMatch) {
      return partialMatch.id
    }
  }

  return null
}

export async function resolveProviderRouterModel(input: {
  apiKey: string
  provider: AgentProvider
  synthesisModel: string
}): Promise<{ model: string; warning?: string }> {
  const configured = env.agent.routerModels[input.provider].trim()

  try {
    const models = await listProviderModels(input.provider, input.apiKey)
    if (models.length === 0) {
      return {
        model: input.synthesisModel,
        warning: `Router model resolution failed because ${input.provider} returned no available models; using synthesis model "${input.synthesisModel}".`,
      }
    }

    if (configured) {
      const exactConfigured = models.find(
        (model) => model.id.toLowerCase() === configured.toLowerCase()
      )

      if (exactConfigured) {
        return { model: exactConfigured.id }
      }

      const includesConfigured = models.find((model) =>
        model.id.toLowerCase().includes(configured.toLowerCase())
      )

      if (includesConfigured) {
        return { model: includesConfigured.id }
      }

      const fallbackModel = pickRouterModelFromAvailable(models, input.provider)

      if (!fallbackModel) {
        return {
          model: input.synthesisModel,
          warning: `Configured router model "${configured}" is unavailable for ${input.provider}; no low-cost fallback was resolved, so using synthesis model "${input.synthesisModel}".`,
        }
      }

      return {
        model: fallbackModel,
        warning: `Configured router model "${configured}" is unavailable for ${input.provider}; using "${fallbackModel}".`,
      }
    }

    const preferredRouterModel = pickRouterModelFromAvailable(
      models,
      input.provider
    )

    if (!preferredRouterModel) {
      return {
        model: input.synthesisModel,
        warning: `Router model resolution failed to find a low-cost ${input.provider} model; using synthesis model "${input.synthesisModel}".`,
      }
    }

    return {
      model: preferredRouterModel,
    }
  } catch (error) {
    return {
      model: input.synthesisModel,
      warning:
        error instanceof Error
          ? `Router model resolution failed; using synthesis model "${input.synthesisModel}" (${error.message}).`
          : `Router model resolution failed; using synthesis model "${input.synthesisModel}".`,
    }
  }
}

export async function completeWithProvider(input: {
  apiKey: string
  provider: AgentProvider
  model: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
}) {
  const completionInput: AgentCompletionInput = {
    apiKey: input.apiKey,
    jsonMode: input.jsonMode,
    maxTokens: input.maxTokens,
    model: input.model,
    systemPrompt: input.systemPrompt,
    temperature: input.temperature,
    userPrompt: input.userPrompt,
  }

  return getAgentProviderAdapter(input.provider).complete(completionInput)
}

export async function completeJsonWithProvider<T>(input: {
  apiKey: string
  provider: AgentProvider
  model: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
}): Promise<{ data: T; raw: AgentCompletionResult }> {
  const raw = await completeWithProvider({
    ...input,
    jsonMode: input.provider === "openai",
  })
  const parsed = extractJsonObject<T>(raw.text)

  if (!parsed) {
    throw new Error("The model did not return valid JSON.")
  }

  return {
    data: parsed,
    raw,
  }
}
