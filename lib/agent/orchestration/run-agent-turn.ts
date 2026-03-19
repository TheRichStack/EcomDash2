import {
  buildToolResultsCacheSignatureForTest as buildToolResultsCacheSignatureForTestFromOrchestrator,
  resolvePromptBudgetProfileForTest as resolvePromptBudgetProfileForTestFromOrchestrator,
  resolveToolResultsCacheTtlMsForTest as resolveToolResultsCacheTtlMsForTestFromOrchestrator,
  runAgentTurn as runAgentTurnFromOrchestrator,
} from "@/lib/agent/orchestrator"

export type RunAgentTurnInput = Parameters<typeof runAgentTurnFromOrchestrator>[0]
export type RunAgentTurnResult = Awaited<
  ReturnType<typeof runAgentTurnFromOrchestrator>
>

export async function runAgentTurn(
  input: RunAgentTurnInput
): Promise<RunAgentTurnResult> {
  return runAgentTurnFromOrchestrator(input)
}

export function buildToolResultsCacheSignatureForTest(
  input: Parameters<typeof buildToolResultsCacheSignatureForTestFromOrchestrator>[0]
) {
  return buildToolResultsCacheSignatureForTestFromOrchestrator(input)
}

export function resolveToolResultsCacheTtlMsForTest(
  input: Parameters<typeof resolveToolResultsCacheTtlMsForTestFromOrchestrator>[0]
) {
  return resolveToolResultsCacheTtlMsForTestFromOrchestrator(input)
}

export function resolvePromptBudgetProfileForTest(
  input: Parameters<typeof resolvePromptBudgetProfileForTestFromOrchestrator>[0]
) {
  return resolvePromptBudgetProfileForTestFromOrchestrator(input)
}
