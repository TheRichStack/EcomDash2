import {
  buildDateClarificationPromptForTest as buildDateClarificationPromptForTestFromOrchestrator,
  buildPromptToolEvidenceEnvelopeForTest as buildPromptToolEvidenceEnvelopeForTestFromOrchestrator,
  buildPromptToolEvidencePayloadForTest as buildPromptToolEvidencePayloadForTestFromOrchestrator,
  serializeConversationHistoryForTest as serializeConversationHistoryForTestFromOrchestrator,
} from "@/lib/agent/orchestrator"

export function serializeConversationHistoryForTest(
  input: Parameters<typeof serializeConversationHistoryForTestFromOrchestrator>[0]
) {
  return serializeConversationHistoryForTestFromOrchestrator(input)
}

export function buildPromptToolEvidencePayloadForTest(
  input: Parameters<typeof buildPromptToolEvidencePayloadForTestFromOrchestrator>[0]
) {
  return buildPromptToolEvidencePayloadForTestFromOrchestrator(input)
}

export function buildPromptToolEvidenceEnvelopeForTest(
  input: Parameters<typeof buildPromptToolEvidenceEnvelopeForTestFromOrchestrator>[0],
  options?: Parameters<typeof buildPromptToolEvidenceEnvelopeForTestFromOrchestrator>[1]
) {
  return buildPromptToolEvidenceEnvelopeForTestFromOrchestrator(input, options)
}

export function buildDateClarificationPromptForTest(
  input: Parameters<typeof buildDateClarificationPromptForTestFromOrchestrator>[0]
) {
  return buildDateClarificationPromptForTestFromOrchestrator(input)
}
