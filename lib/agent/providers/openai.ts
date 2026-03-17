import type {
  AgentCompletionInput,
  AgentCompletionResult,
  AgentModelOption,
} from "@/lib/agent/types"

type OpenAiModelListResponse = {
  data?: Array<{
    id?: string
  }>
}

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>
    }
  }>
  usage?: {
    completion_tokens?: number
    prompt_tokens?: number
  }
}

type OpenAiErrorResponse = {
  error?: {
    code?: string
    message?: string
    param?: string
    type?: string
  }
}

function resolveOpenAiReasoningEffort(input: AgentCompletionInput) {
  if (!input.jsonMode) {
    return undefined
  }

  const model = String(input.model ?? "").toLowerCase()

  if (model.startsWith("gpt-5.1")) {
    return "none"
  }

  if (model.startsWith("gpt-5")) {
    return "minimal"
  }

  return undefined
}

function supportsCustomTemperature(modelId: string) {
  const model = String(modelId ?? "").toLowerCase()

  if (model.startsWith("gpt-5")) {
    return false
  }

  return true
}

function isUnsupportedTemperatureError(responseText: string) {
  try {
    const parsed = JSON.parse(responseText) as OpenAiErrorResponse
    const param = String(parsed.error?.param ?? "").toLowerCase()
    const code = String(parsed.error?.code ?? "").toLowerCase()
    const message = String(parsed.error?.message ?? "").toLowerCase()

    return (
      param === "temperature" &&
      (code === "unsupported_value" || message.includes("does not support"))
    )
  } catch {
    return (
      responseText.toLowerCase().includes("temperature") &&
      responseText.toLowerCase().includes("unsupported")
    )
  }
}

function normalizeOpenAiText(
  content: string | Array<{ text?: string; type?: string }> | undefined
) {
  if (typeof content === "string") {
    return content
  }

  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .map((entry) => (entry?.type === "text" ? String(entry.text ?? "") : ""))
    .join("\n")
    .trim()
}

function isUsefulModel(id: string) {
  const normalized = id.toLowerCase()

  return ![
    "audio",
    "embedding",
    "image",
    "moderation",
    "realtime",
    "search",
    "transcribe",
    "tts",
    "whisper",
  ].some((token) => normalized.includes(token))
}

function isRecommendedOpenAiModel(id: string) {
  const normalized = id.toLowerCase()

  if (!normalized.startsWith("gpt-5")) {
    return false
  }

  return ![
    "audio",
    "image",
    "mini",
    "nano",
    "realtime",
    "search",
    "transcribe",
    "tts",
  ].some((token) => normalized.includes(token))
}

function compareRecommendedOpenAiModels(left: string, right: string) {
  const priority = [
    "gpt-5.4",
    "gpt-5.4-pro",
    "gpt-5",
    "gpt-5-pro",
  ]

  const leftIndex = priority.indexOf(left.toLowerCase())
  const rightIndex = priority.indexOf(right.toLowerCase())

  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1) {
      return 1
    }

    if (rightIndex === -1) {
      return -1
    }

    return leftIndex - rightIndex
  }

  return left.localeCompare(right)
}

export async function listOpenAiModels(apiKey: string): Promise<AgentModelOption[]> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`OpenAI model lookup failed (${response.status}).`)
  }

  const payload = (await response.json()) as OpenAiModelListResponse

  const usefulModelIds = (payload.data ?? [])
    .map((model) => String(model.id ?? "").trim())
    .filter((id) => id && isUsefulModel(id))
  const recommendedModelIds = usefulModelIds.filter(isRecommendedOpenAiModel)
  const modelIds =
    recommendedModelIds.length > 0 ? recommendedModelIds : usefulModelIds

  return modelIds
    .sort(compareRecommendedOpenAiModels)
    .map((id) => ({
      id,
      label: id,
    }))
}

export async function completeWithOpenAi(
  input: AgentCompletionInput
): Promise<AgentCompletionResult> {
  const requestBodyBase = {
    model: input.model,
    max_completion_tokens: input.maxTokens ?? 1400,
    messages: [
      {
        role: "developer",
        content: input.systemPrompt,
      },
      {
        role: "user",
        content: input.userPrompt,
      },
    ],
    reasoning_effort: resolveOpenAiReasoningEffort(input),
    response_format: input.jsonMode ? { type: "json_object" } : undefined,
  }
  const defaultTemperature =
    input.temperature !== undefined ? input.temperature : 0.2
  const shouldSendTemperature = supportsCustomTemperature(input.model)
  const attempt = async (sendTemperature: boolean) =>
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        ...requestBodyBase,
        temperature: sendTemperature ? defaultTemperature : undefined,
      }),
    })

  let response = await attempt(shouldSendTemperature)

  if (!response.ok) {
    const firstErrorText = await response.text()

    if (shouldSendTemperature && isUnsupportedTemperatureError(firstErrorText)) {
      response = await attempt(false)
    } else {
      throw new Error(
        `OpenAI completion failed (${response.status}): ${firstErrorText || "Unknown error"}`
      )
    }
  }

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(
      `OpenAI completion failed (${response.status}): ${detail || "Unknown error"}`
    )
  }

  const payload = (await response.json()) as OpenAiChatResponse
  const choice = payload.choices?.[0]

  return {
    text: normalizeOpenAiText(choice?.message?.content).trim(),
    usage: {
      inputTokens: payload.usage?.prompt_tokens,
      outputTokens: payload.usage?.completion_tokens,
    },
  }
}
