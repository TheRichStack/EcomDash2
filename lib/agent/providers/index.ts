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
