import type {
  AgentCompletionInput,
  AgentCompletionResult,
  AgentModelOption,
} from "@/lib/agent/types"

type AnthropicModelListResponse = {
  data?: Array<{
    display_name?: string
    id?: string
  }>
}

type AnthropicMessagesResponse = {
  content?: Array<{
    text?: string
    type?: string
  }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
}

function isRecommendedAnthropicModel(id: string) {
  const normalized = id.toLowerCase()

  return normalized.includes("sonnet") || normalized.includes("opus")
}

export async function listAnthropicModels(
  apiKey: string
): Promise<AgentModelOption[]> {
  const response = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    },
  })

  if (!response.ok) {
    throw new Error(`Anthropic model lookup failed (${response.status}).`)
  }

  const payload = (await response.json()) as AnthropicModelListResponse

  const models = (payload.data ?? [])
    .map((model) => ({
      id: String(model.id ?? "").trim(),
      label: String(model.display_name ?? model.id ?? "").trim(),
    }))
    .filter((model) => model.id)
  const recommendedModels = models.filter((model) =>
    isRecommendedAnthropicModel(model.id)
  )

  return (recommendedModels.length > 0 ? recommendedModels : models).sort(
    (left, right) => left.id.localeCompare(right.id)
  )
}

export async function completeWithAnthropic(
  input: AgentCompletionInput
): Promise<AgentCompletionResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": input.apiKey,
    },
    body: JSON.stringify({
      max_tokens: input.maxTokens ?? 1400,
      messages: [
        {
          role: "user",
          content: input.userPrompt,
        },
      ],
      model: input.model,
      system: input.systemPrompt,
      temperature: input.temperature ?? 0.2,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(
      `Anthropic completion failed (${response.status}): ${detail || "Unknown error"}`
    )
  }

  const payload = (await response.json()) as AnthropicMessagesResponse

  return {
    text: (payload.content ?? [])
      .map((entry) => (entry.type === "text" ? String(entry.text ?? "") : ""))
      .join("\n")
      .trim(),
    usage: {
      inputTokens: payload.usage?.input_tokens,
      outputTokens: payload.usage?.output_tokens,
    },
  }
}
