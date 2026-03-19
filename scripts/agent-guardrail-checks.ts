import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  AGENT_PROMPT_HISTORY_ASSISTANT_CHARS,
  AGENT_PROMPT_HISTORY_SUMMARY_CHARS,
  AGENT_PROMPT_HISTORY_USER_CHARS,
  AGENT_PROMPT_TOOL_SUMMARY_CHARS,
} from "@/lib/agent/constants"
import { sanitizeAgentSqlQuery } from "@/lib/agent/broker"
import { executeAgentRunLocally } from "@/lib/agent/executor"
import {
  resolveModelRequirementForTurnForTest,
} from "@/lib/agent/orchestrator"
import {
  buildDateClarificationPromptForTest,
  buildPromptToolEvidenceEnvelopeForTest,
  buildPromptToolEvidencePayloadForTest,
  serializeConversationHistoryForTest,
} from "@/lib/agent/orchestration/prompt-builder"
import {
  buildToolResultsCacheSignatureForTest,
  resolvePromptBudgetProfileForTest,
  resolveToolResultsCacheTtlMsForTest,
} from "@/lib/agent/orchestration/run-agent-turn"
import {
  evaluateWorkerOpGuardrailsForTest,
  resolveConfirmationResumeSelectionForTest,
  resolvePendingWorkerPlanForTest,
} from "@/lib/agent/orchestration/worker-guardrails"
import { resetAgentPresetCachesForTests, listAgentPresets } from "@/lib/agent/presets"
import type { AgentToolName } from "@/lib/agent/types"
import { ECOMDASH2_TABLE_BOUNDARY } from "@/lib/db/boundary"
import { env } from "@/lib/env"

function buildMinimalExecutorContext() {
  const today = "2026-03-17"
  return {
    compare: "previous_period" as const,
    from: today,
    to: today,
    workspaceId: "guardrail-check-workspace",
  }
}

async function verifyOpDispatchAllowlist() {
  const execution = await executeAgentRunLocally({
    allowedOps: ["jobs:hourly"],
    brokerBaseUrl: "http://localhost",
    brokerToken: "unused-local-executor-token",
    confirmedOps: [],
    context: buildMinimalExecutorContext(),
    question: "verify op dispatch allowlist",
    runId: "guardrail-check-op-safety",
    scriptBody: `
try {
  await broker.dispatchOp("jobs:reconcile")
  return { blocked: false, message: "unexpected success" }
} catch (error) {
  return {
    blocked: true,
    message: String(error instanceof Error ? error.message : error),
  }
}
`,
  })

  const result = execution.result as {
    blocked?: unknown
    message?: unknown
  }
  assert.equal(result.blocked, true, "Expected disallowed op dispatch to be blocked.")
  assert.equal(
    execution.opsDispatched.length,
    0,
    "Disallowed op should not be recorded as dispatched."
  )
  assert.match(
    String(result.message ?? ""),
    /not allowed/i,
    "Disallowed op should return an explicit allowlist error."
  )

  console.log(
    `[op-safety] blocked=${String(result.blocked)} opsDispatched=${execution.opsDispatched.length} message="${String(result.message ?? "")}"`
  )
}

function verifySqlRowCapEnforcement() {
  const firstTable = Object.values(ECOMDASH2_TABLE_BOUNDARY)[0]
  assert(firstTable, "Expected at least one allowed SQL boundary table.")
  const maxRows = env.agent.sqlMaxRows
  const workspaceId = "guardrail-check-workspace"

  const withoutLimit = sanitizeAgentSqlQuery(
    `SELECT workspace_id FROM ${firstTable.tableName}`,
    workspaceId
  )
  assert.match(
    withoutLimit.sql,
    new RegExp(`\\bLIMIT\\s+${maxRows}\\b`, "i"),
    "Expected SQL without LIMIT to have max-row LIMIT appended."
  )

  const oversizedLimit = sanitizeAgentSqlQuery(
    `SELECT workspace_id FROM ${firstTable.tableName} LIMIT ${maxRows + 50}`,
    workspaceId
  )
  assert.match(
    oversizedLimit.sql,
    new RegExp(`\\bLIMIT\\s+${maxRows}\\b`, "i"),
    "Expected oversized SQL LIMIT to be clamped to env.agent.sqlMaxRows."
  )

  console.log(
    `[sql-row-cap] maxRows=${maxRows} appended="${withoutLimit.sql}" clamped="${oversizedLimit.sql}"`
  )
}

function collectGateStatuses() {
  return Array.from(
    new Set(
      listAgentPresets({ enforceProductionReadiness: false }).map(
        (preset) => preset.releaseGate.status
      )
    )
  ).sort()
}

async function verifyRunbookReleaseGateFailClosed() {
  const gatePath = path.join(
    process.cwd(),
    "artifacts",
    "agent-lab",
    "runbook-release-gates.json"
  )
  const backupPath = `${gatePath}.agent-guardrail-checks.backup`
  const hadExistingGateFile = existsSync(gatePath)

  if (existsSync(backupPath)) {
    throw new Error(`Backup path already exists: ${backupPath}`)
  }

  if (hadExistingGateFile) {
    await rename(gatePath, backupPath)
  }

  try {
    resetAgentPresetCachesForTests()
    const enforcedWhenMissing = listAgentPresets({
      enforceProductionReadiness: true,
    })
    const statusesWhenMissing = collectGateStatuses()

    assert.equal(
      enforcedWhenMissing.length,
      0,
      "Missing gate file must fail closed in enforced mode."
    )
    assert.deepEqual(
      statusesWhenMissing,
      ["not_evaluated"],
      "Missing gate file should produce explicit not_evaluated status in non-enforced mode."
    )

    await mkdir(path.dirname(gatePath), { recursive: true })
    await writeFile(gatePath, `{"generatedAt":"2026-03-17T00:00:00.000Z","gates":{}}`)

    resetAgentPresetCachesForTests()
    const enforcedWhenInvalid = listAgentPresets({
      enforceProductionReadiness: true,
    })
    const statusesWhenInvalid = collectGateStatuses()

    assert.equal(
      enforcedWhenInvalid.length,
      0,
      "Invalid gate file must fail closed in enforced mode."
    )
    assert.deepEqual(
      statusesWhenInvalid,
      ["not_evaluated"],
      "Invalid gate file should produce explicit not_evaluated status in non-enforced mode."
    )

    console.log(
      `[runbook-release-gates] missing: enforced=${enforcedWhenMissing.length} statuses=${statusesWhenMissing.join(",")} | invalid: enforced=${enforcedWhenInvalid.length} statuses=${statusesWhenInvalid.join(",")}`
    )
  } finally {
    if (existsSync(gatePath)) {
      await rm(gatePath, { force: true })
    }

    if (hadExistingGateFile && existsSync(backupPath)) {
      await rename(backupPath, gatePath)
    }

    resetAgentPresetCachesForTests()
  }
}

function verifyPendingWorkerPlanParserFailClosed() {
  const workspaceId = "guardrail-check-workspace"
  const pendingRunId = "guardrail-check-pending-plan"

  const malformedCases = [
    {
      expected: "missing a saved script",
      label: "missing-script",
      payload: {
        context: {
          compare: "previous_period",
          from: "2026-01-01",
          to: "2026-01-31",
          workspaceId,
        },
        plan: {
          requestedOps: ["jobs:hourly"],
          scriptBody: "",
          why: "verify parser",
        },
        question: "What changed in January?",
      },
    },
    {
      expected: "missing the saved execution question",
      label: "missing-question",
      payload: {
        context: {
          compare: "previous_period",
          from: "2026-01-01",
          to: "2026-01-31",
          workspaceId,
        },
        plan: {
          requestedOps: ["jobs:hourly"],
          scriptBody: "return { ok: true }",
          why: "verify parser",
        },
        question: "",
      },
    },
    {
      expected: "missing saved execution context",
      label: "missing-context",
      payload: {
        context: {
          compare: "previous_period",
          from: "",
          to: "2026-01-31",
          workspaceId,
        },
        plan: {
          requestedOps: ["jobs:hourly"],
          scriptBody: "return { ok: true }",
          why: "verify parser",
        },
        question: "What changed in January?",
      },
    },
    {
      expected: "has an invalid compare mode",
      label: "invalid-compare",
      payload: {
        context: {
          compare: "rolling",
          from: "2026-01-01",
          to: "2026-01-31",
          workspaceId,
        },
        plan: {
          requestedOps: ["jobs:hourly"],
          scriptBody: "return { ok: true }",
          why: "verify parser",
        },
        question: "What changed in January?",
      },
    },
    {
      expected: "workspace does not match",
      label: "workspace-mismatch",
      payload: {
        context: {
          compare: "previous_period",
          from: "2026-01-01",
          to: "2026-01-31",
          workspaceId: "other-workspace",
        },
        plan: {
          requestedOps: ["jobs:hourly"],
          scriptBody: "return { ok: true }",
          why: "verify parser",
        },
        question: "What changed in January?",
      },
    },
  ] as const

  const blockedOutcomes = malformedCases.map((testCase) => {
    const resolution = resolvePendingWorkerPlanForTest({
      payload: testCase.payload,
      pendingRunId,
      workspaceId,
    })
    assert.equal(resolution.plan, null, `Expected ${testCase.label} payload to be blocked.`)
    assert.match(
      String(resolution.blockedReason ?? ""),
      new RegExp(testCase.expected, "i"),
      `Expected ${testCase.label} blocked reason to include "${testCase.expected}".`
    )
    return `${testCase.label}=blocked`
  })

  const validResolution = resolvePendingWorkerPlanForTest({
    payload: {
      context: {
        compare: "previous_period",
        from: "2026-02-01",
        to: "2026-02-28",
        workspaceId,
      },
      plan: {
        requestedOps: ["jobs:hourly", "jobs:reconcile", "jobs:not-allowed"],
        scriptBody: "return { ok: true }",
        why: "planned deterministic check",
      },
      question: "Review February performance.",
    },
    pendingRunId,
    workspaceId,
  })

  assert.equal(validResolution.blockedReason, null, "Expected valid payload to parse.")
  assert.notEqual(validResolution.plan, null, "Expected valid payload to produce a plan.")
  assert.deepEqual(
    validResolution.plan?.requestedOps,
    ["jobs:hourly", "jobs:reconcile"],
    "Expected parsed plan to keep only allowlisted operations."
  )
  assert.equal(validResolution.plan?.question, "Review February performance.")
  assert.equal(validResolution.plan?.context.workspaceId, workspaceId)
  assert.equal(validResolution.plan?.pendingRunId, pendingRunId)

  console.log(
    `[pending-plan-parser] ${blockedOutcomes.join(" ")} valid=parsed requestedOps=${validResolution.plan?.requestedOps.join(",")}`
  )
}

function verifyConfirmationResumeSelectionDeterminism() {
  const workspaceId = "guardrail-check-workspace"
  const pendingRunId = "guardrail-check-confirm-resume"
  const parsed = resolvePendingWorkerPlanForTest({
    payload: {
      context: {
        compare: "previous_year",
        from: "2025-11-20",
        to: "2025-12-05",
        workspaceId,
      },
      plan: {
        requestedOps: ["jobs:hourly", "jobs:reconcile"],
        scriptBody:
          "await broker.dispatchOp('jobs:hourly'); await broker.dispatchOp('jobs:reconcile'); return { ok: true }",
        why: "deterministic resume test",
      },
      question: "Run the saved BFCM reconciliation workflow.",
    },
    pendingRunId,
    workspaceId,
  })
  assert.notEqual(parsed.plan, null, "Expected valid pending worker plan to parse.")

  const selection = resolveConfirmationResumeSelectionForTest({
    analysisQuestion:
      "Ignore saved plan and heuristically reroute this to a greeting-only direct response.",
    context: {
      compare: "none",
      from: "2026-03-01",
      session: {
        defaultWorkspaceId: workspaceId,
        email: null,
        role: "admin",
        source: "env-stub",
        userId: "guardrail-check-user",
        workspaceMemberships: [
          {
            id: workspaceId,
            label: workspaceId,
          },
        ],
      },
      to: "2026-03-17",
      workspaceId,
    },
    pendingWorkerPlan: parsed.plan,
  })

  assert.equal(
    selection.executionQuestion,
    parsed.plan?.question,
    "Confirmation resume must use the pending plan question."
  )
  assert.equal(
    selection.scriptBody,
    parsed.plan?.scriptBody,
    "Confirmation resume must use the pending plan script."
  )
  assert.deepEqual(
    selection.requestedOps,
    parsed.plan?.requestedOps,
    "Confirmation resume must use pending plan requested ops."
  )
  assert.deepEqual(
    selection.scopeContext,
    parsed.plan?.context,
    "Confirmation resume must use pending plan context."
  )
  assert.equal(selection.usedPendingQuestion, true)
  assert.equal(selection.usedPendingScript, true)
  assert.equal(selection.usedPendingRequestedOps, true)
  assert.equal(selection.usedPendingScopeContext, true)
  assert.match(
    String(selection.scopeWarning ?? ""),
    new RegExp(pendingRunId),
    "Confirmation resume warning must reference the pending run id."
  )

  const malformed = resolvePendingWorkerPlanForTest({
    payload: {
      context: {
        compare: "none",
        from: "2026-01-01",
        to: "2026-01-31",
        workspaceId,
      },
      plan: {
        requestedOps: ["jobs:hourly"],
        scriptBody: "",
      },
      question: "Malformed pending plan should fail closed.",
    },
    pendingRunId: `${pendingRunId}-missing-script`,
    workspaceId,
  })
  assert.equal(
    malformed.plan,
    null,
    "Malformed pending plan must fail closed and not produce resume inputs."
  )
  assert.match(
    String(malformed.blockedReason ?? ""),
    /missing a saved script/i,
    "Malformed pending plan must emit explicit blocked reason."
  )

  console.log(
    `[confirmation-resume-determinism] sourceContext=plan sourceQuestion=plan sourceScript=plan sourceOps=plan scope=${selection.scopeContext.from}..${selection.scopeContext.to} compare=${selection.scopeContext.compare} warning="${String(selection.scopeWarning ?? "")}"`
  )
  console.log(
    `[confirmation-resume-fail-closed] malformedPendingPlanBlocked=${String(Boolean(malformed.blockedReason))} reason="${String(malformed.blockedReason ?? "")}"`
  )
}

function readSectionText(serialized: string, heading: string, nextHeading: string) {
  const startToken = `${heading}\n`
  const endToken = `\n\n${nextHeading}\n`
  const start = serialized.indexOf(startToken)

  assert.notEqual(start, -1, `Missing heading: ${heading}`)
  const from = start + startToken.length
  const end = serialized.indexOf(endToken, from)
  assert.notEqual(end, -1, `Missing next heading marker after: ${heading}`)

  return serialized.slice(from, end)
}

function verifyHistoryBounding() {
  const firstUser = "first-user-turn " + "u".repeat(240)
  const secondUser = "last-user-turn " + "u".repeat(900)
  const firstAssistant = "first-assistant-turn " + "a".repeat(240)
  const secondAssistant = "last-assistant-turn " + "a".repeat(1200)
  const longSummary = "summary " + "s".repeat(1600)

  const serialized = serializeConversationHistoryForTest({
    messages: [
      { content: firstUser, role: "user" },
      { content: firstAssistant, role: "assistant" },
      { content: secondUser, role: "user" },
      { content: secondAssistant, role: "assistant" },
    ],
    summaryText: longSummary,
  })

  assert.match(serialized, /^Conversation summary:\n/m)
  assert.match(serialized, /\n\nLast user turn:\n/m)
  assert.match(serialized, /\n\nLast assistant turn:\n/m)

  const summarySection = readSectionText(serialized, "Conversation summary:", "Last user turn:")
  const userSection = readSectionText(serialized, "Last user turn:", "Last assistant turn:")
  const assistantSection = serialized.slice(serialized.indexOf("Last assistant turn:\n") + "Last assistant turn:\n".length)

  assert(!summarySection.includes("first-user-turn"), "Summary section should not include old user turns.")
  assert(!userSection.includes("first-user-turn"), "History should not include non-last user turn.")
  assert(!assistantSection.includes("first-assistant-turn"), "History should not include non-last assistant turn.")
  assert(userSection.includes("last-user-turn"), "History should include last user turn.")
  assert(assistantSection.includes("last-assistant-turn"), "History should include last assistant turn.")

  assert(
    summarySection.length <= AGENT_PROMPT_HISTORY_SUMMARY_CHARS,
    "Summary section exceeded configured history summary cap."
  )
  assert(
    userSection.length <= AGENT_PROMPT_HISTORY_USER_CHARS,
    "User section exceeded configured history user cap."
  )
  assert(
    assistantSection.length <= AGENT_PROMPT_HISTORY_ASSISTANT_CHARS,
    "Assistant section exceeded configured history assistant cap."
  )

  console.log(
    `[history-bounding] summaryLen=${summarySection.length}/${AGENT_PROMPT_HISTORY_SUMMARY_CHARS} userLen=${userSection.length}/${AGENT_PROMPT_HISTORY_USER_CHARS} assistantLen=${assistantSection.length}/${AGENT_PROMPT_HISTORY_ASSISTANT_CHARS}`
  )
}

function verifyEvidenceOnlyPromptShaping() {
  const payload = buildPromptToolEvidencePayloadForTest([
    {
      evidence: { freshness: "stale", updatedAt: "2026-03-17T00:00:00.000Z" },
      label: "Overview summary",
      name: "overview_summary",
      summary: "Signal ".repeat(400),
    },
  ])

  assert.equal(payload.length, 1, "Expected one tool evidence payload entry.")
  const first = payload[0]
  const keys = Object.keys(first).sort()

  assert.deepEqual(
    keys,
    ["evidence", "label", "name", "summary"],
    "Tool evidence payload should only expose compact prompt-safe keys."
  )
  assert.equal(
    typeof (first as { data?: unknown }).data,
    "undefined",
    "Tool evidence payload must not include raw data."
  )
  assert(
    first.summary.length <= AGENT_PROMPT_TOOL_SUMMARY_CHARS,
    "Tool summary exceeded configured prompt summary cap."
  )

  console.log(
    `[evidence-only-shape] keys=${keys.join(",")} summaryLen=${first.summary.length}/${AGENT_PROMPT_TOOL_SUMMARY_CHARS} hasData=${String("data" in (first as Record<string, unknown>))}`
  )
}

function verifyPromptBudgetCompaction() {
  const toolsProfile = resolvePromptBudgetProfileForTest({ mode: "tools" })
  const workerProfile = resolvePromptBudgetProfileForTest({ mode: "worker_plan" })

  const oversizedInput = [
    {
      evidence: {
        kpis: { revenue: 12345.67 },
        rows: Array.from({ length: 40 }).map((_, index) => ({
          label: `row-${index + 1}`,
          value: index + 1,
        })),
      },
      label: "Overview summary",
      name: "overview_summary",
      summary: "Signal ".repeat(220),
    },
    {
      evidence: {
        rows: Array.from({ length: 40 }).map((_, index) => ({
          label: `campaign-${index + 1}`,
          spend: index * 10,
        })),
      },
      label: "Paid media summary",
      name: "paid_media_summary",
      summary: "Signal ".repeat(220),
    },
  ] as const

  const compactEnvelope = buildPromptToolEvidenceEnvelopeForTest(
    [...oversizedInput],
    {
      profile: toolsProfile,
      tier: "compact",
    }
  )

  assert(
    compactEnvelope.metrics.postChars <= toolsProfile.maxTotalChars,
    "Prompt budget compaction should cap total evidence payload chars."
  )
  for (const entry of compactEnvelope.toolEvidence) {
    const perToolChars =
      entry.summary.length + JSON.stringify(entry.evidence ?? null).length
    assert(
      perToolChars <=
        toolsProfile.maxPerToolChars + toolsProfile.maxSummaryChars,
      "Prompt budget compaction should cap per-tool payload size."
    )
  }

  const workerEnvelope = buildPromptToolEvidenceEnvelopeForTest(
    [...oversizedInput],
    {
      profile: workerProfile,
      tier: "compact",
    }
  )

  assert(
    workerEnvelope.toolEvidence.every((entry) => entry.evidence === null),
    "Worker-plan budget should enforce summary-only evidence."
  )

  console.log(
    `[prompt-budget-compaction] toolsPost=${compactEnvelope.metrics.postChars}/${toolsProfile.maxTotalChars} dropped=${compactEnvelope.metrics.droppedEvidenceCount} workerSummaryOnly=${String(workerEnvelope.toolEvidence.every((entry) => entry.evidence === null))}`
  )
}

function verifyToolCacheSignatureDeterminism() {
  const baseInput = {
    context: {
      compare: "previous_period" as const,
      from: "2026-03-01",
      to: "2026-03-07",
      workspaceId: "guardrail-check-workspace",
    },
    executionQuestion: "Show top products for last week",
    toolNames: ["product_performance"] as AgentToolName[],
  }

  const signatureA = buildToolResultsCacheSignatureForTest(baseInput)
  const signatureB = buildToolResultsCacheSignatureForTest(baseInput)
  const changedMessageSensitive = buildToolResultsCacheSignatureForTest({
    ...baseInput,
    executionQuestion: "Show top products for last month",
  })
  const nonSensitiveA = buildToolResultsCacheSignatureForTest({
    ...baseInput,
    executionQuestion: "How did we do?",
    toolNames: ["overview_summary"] as AgentToolName[],
  })
  const nonSensitiveB = buildToolResultsCacheSignatureForTest({
    ...baseInput,
    executionQuestion: "How did we do this week?",
    toolNames: ["overview_summary"] as AgentToolName[],
  })

  assert.equal(
    signatureA.signature,
    signatureB.signature,
    "Tool cache signature should be deterministic for identical input."
  )
  assert.notEqual(
    signatureA.signature,
    changedMessageSensitive.signature,
    "Message-sensitive tool cache signature should vary with question text."
  )
  assert.equal(
    nonSensitiveA.signature,
    nonSensitiveB.signature,
    "Non-sensitive tool cache signature should ignore question text changes."
  )

  console.log(
    `[tool-cache-signature] deterministic=${String(signatureA.signature === signatureB.signature)} messageSensitiveChanges=${String(signatureA.signature !== changedMessageSensitive.signature)} nonSensitiveStable=${String(nonSensitiveA.signature === nonSensitiveB.signature)}`
  )
}

function verifyToolCacheTtlPolicy() {
  const freshnessTtl = resolveToolResultsCacheTtlMsForTest({
    toolNames: ["data_freshness"],
  })
  const runbookTtl = resolveToolResultsCacheTtlMsForTest({
    presetId: "daily-trading-pulse",
    toolNames: ["overview_summary"],
  })
  const freeformTtl = resolveToolResultsCacheTtlMsForTest({
    toolNames: ["overview_summary"],
  })

  assert.equal(
    freshnessTtl,
    2 * 60_000,
    "data_freshness tool cache TTL should be 2 minutes."
  )
  assert.equal(
    runbookTtl,
    6 * 60 * 60_000,
    "Runbook cache TTL should be 6 hours."
  )
  assert.equal(
    freeformTtl,
    10 * 60_000,
    "Free-form tools cache TTL should be 10 minutes."
  )

  console.log(
    `[tool-cache-ttl] freshnessMs=${freshnessTtl} runbookMs=${runbookTtl} freeformMs=${freeformTtl}`
  )
}

function verifyDateClarificationDeterminism() {
  const question = "Was revenue up?"
  const options = [
    { label: "Yesterday", message: "Use yesterday." },
    { label: "Last 7 days", message: "Use last 7 days." },
    { label: "This month", message: "Use this month to date." },
  ]
  const promptA = buildDateClarificationPromptForTest({
    options,
    question,
  })
  const promptB = buildDateClarificationPromptForTest({
    options,
    question,
  })

  assert.equal(
    promptA,
    promptB,
    "Date clarification prompt should be deterministic for same input."
  )
  assert.match(
    promptA,
    /^To answer this well, I need the date range for: Was revenue up\?\nChoose one of these options or type your own date range: Yesterday, Last 7 days, This month\.$/
  )

  console.log(`[date-clarification-determinism] output="${promptA}"`)
}

function verifyDeterministicNoKeyModelRequirementRouting() {
  const deterministicNoKey = resolveModelRequirementForTurnForTest({
    executionMode: "tools",
    hasCredential: false,
    presetId: "last-month-board-summary",
    requiresDateClarification: false,
  })
  const analysisNoKey = resolveModelRequirementForTurnForTest({
    executionMode: "tools",
    hasCredential: false,
    requiresDateClarification: false,
  })
  const analysisWithCredential = resolveModelRequirementForTurnForTest({
    executionMode: "tools",
    hasCredential: true,
    requiresDateClarification: false,
  })

  assert.equal(
    deterministicNoKey.modelRequired,
    false,
    "Deterministic preset tools path must be marked model-not-required."
  )
  assert.equal(
    typeof deterministicNoKey.noModelWarning,
    "string",
    "Deterministic no-key path must carry explicit no-model warning metadata."
  )
  assert.equal(
    deterministicNoKey.blockedReason,
    null,
    "Deterministic preset path should run without provider credentials."
  )

  assert.equal(
    analysisNoKey.modelRequired,
    true,
    "Non-deterministic tools path must remain model-required."
  )
  assert.match(
    String(analysisNoKey.blockedReason ?? ""),
    /requires a configured OpenAI or Anthropic API key/i,
    "Non-deterministic no-key path must fail closed with explicit blocked reason."
  )
  assert.equal(
    analysisNoKey.noModelWarning,
    null,
    "Non-deterministic no-key path should not emit deterministic no-model warning."
  )

  assert.equal(
    analysisWithCredential.modelRequired,
    true,
    "Model-required path should stay model-required when credentials are present."
  )
  assert.equal(
    analysisWithCredential.blockedReason,
    null,
    "Credentialed model-required path should remain unblocked."
  )

  console.log(
    `[deterministic-no-key-routing] deterministicPreset=modelRequired:${String(deterministicNoKey.modelRequired)} blocked:${String(Boolean(deterministicNoKey.blockedReason))} noModelWarning:${String(Boolean(deterministicNoKey.noModelWarning))}`
  )
  console.log(
    `[model-required-no-key-routing] freeformAnalysis=modelRequired:${String(analysisNoKey.modelRequired)} blockedReason="${String(analysisNoKey.blockedReason ?? "")}" credentialedBlocked:${String(Boolean(analysisWithCredential.blockedReason))}`
  )
}

function verifyWorkerOpSetMismatchGuardrails() {
  const nonLiteralDispatch = evaluateWorkerOpGuardrailsForTest({
    confirmedOps: ["jobs:hourly"],
    hasExplicitConfirmedOps: true,
    requestedOps: ["jobs:hourly"],
    scriptBody: `
const op = "jobs:hourly"
await broker.dispatchOp(op)
return { ok: true }
`,
  })
  assert.match(
    String(nonLiteralDispatch.blockedReason ?? ""),
    /non-literal dispatchOp/i,
    "Non-literal dispatchOp usage must be blocked."
  )
  assert.equal(
    nonLiteralDispatch.hasDynamicDispatch,
    true,
    "Non-literal dispatchOp check should set hasDynamicDispatch=true."
  )

  const scriptRequestedMismatch = evaluateWorkerOpGuardrailsForTest({
    confirmedOps: ["jobs:hourly"],
    hasExplicitConfirmedOps: true,
    requestedOps: ["jobs:hourly"],
    scriptBody: `
await broker.dispatchOp("jobs:hourly")
await broker.dispatchOp("jobs:reconcile")
return { ok: true }
`,
  })
  assert.match(
    String(scriptRequestedMismatch.blockedReason ?? ""),
    /dispatchOp set does not match the saved requested op set/i,
    "Script/requested op-set mismatch must be blocked."
  )

  const confirmedRequestedMismatch = evaluateWorkerOpGuardrailsForTest({
    confirmedOps: ["jobs:hourly"],
    hasExplicitConfirmedOps: true,
    requestedOps: ["jobs:hourly", "jobs:reconcile"],
    scriptBody: `
await broker.dispatchOp("jobs:hourly")
await broker.dispatchOp("jobs:reconcile")
return { ok: true }
`,
  })
  assert.match(
    String(confirmedRequestedMismatch.blockedReason ?? ""),
    /Confirmed operations do not exactly match the pending plan requested ops/i,
    "Confirmed/requested op-set mismatch must be blocked."
  )

  console.log(
    `[worker-non-literal-dispatch] blocked=${String(Boolean(nonLiteralDispatch.blockedReason))} reason="${String(nonLiteralDispatch.blockedReason ?? "")}"`
  )
  console.log(
    `[worker-op-set-mismatch] scriptVsRequestedBlocked=${String(Boolean(scriptRequestedMismatch.blockedReason))} reason="${String(scriptRequestedMismatch.blockedReason ?? "")}" confirmedVsRequestedBlocked=${String(Boolean(confirmedRequestedMismatch.blockedReason))} confirmedReason="${String(confirmedRequestedMismatch.blockedReason ?? "")}"`
  )
}

async function main() {
  await verifyOpDispatchAllowlist()
  verifySqlRowCapEnforcement()
  await verifyRunbookReleaseGateFailClosed()
  verifyPendingWorkerPlanParserFailClosed()
  verifyConfirmationResumeSelectionDeterminism()
  verifyHistoryBounding()
  verifyEvidenceOnlyPromptShaping()
  verifyPromptBudgetCompaction()
  verifyToolCacheSignatureDeterminism()
  verifyToolCacheTtlPolicy()
  verifyDateClarificationDeterminism()
  verifyDeterministicNoKeyModelRequirementRouting()
  verifyWorkerOpSetMismatchGuardrails()
  console.log("agent-guardrail-checks: PASS")
}

main().catch((error) => {
  console.error("agent-guardrail-checks: FAIL")
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 1
})
