import {
  evaluateWorkerOpGuardrailsForTest as evaluateWorkerOpGuardrailsForTestFromOrchestrator,
  resolveConfirmationResumeSelectionForTest as resolveConfirmationResumeSelectionForTestFromOrchestrator,
  resolvePendingWorkerPlanForTest as resolvePendingWorkerPlanForTestFromOrchestrator,
} from "@/lib/agent/orchestrator"

export function resolveConfirmationResumeSelectionForTest(
  input: Parameters<
    typeof resolveConfirmationResumeSelectionForTestFromOrchestrator
  >[0]
) {
  return resolveConfirmationResumeSelectionForTestFromOrchestrator(input)
}

export function evaluateWorkerOpGuardrailsForTest(
  input: Parameters<typeof evaluateWorkerOpGuardrailsForTestFromOrchestrator>[0]
) {
  return evaluateWorkerOpGuardrailsForTestFromOrchestrator(input)
}

export function resolvePendingWorkerPlanForTest(
  input: Parameters<typeof resolvePendingWorkerPlanForTestFromOrchestrator>[0]
) {
  return resolvePendingWorkerPlanForTestFromOrchestrator(input)
}
