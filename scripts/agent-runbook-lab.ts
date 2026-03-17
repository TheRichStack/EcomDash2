import "server-only"

import nextEnv from "@next/env"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type {
  AgentPresetId,
  AgentStorageMessage,
} from "@/lib/agent/types"

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const RUNBOOK_RELEASE_GATES_PATH = path.join(
  process.cwd(),
  "artifacts",
  "agent-lab",
  "runbook-release-gates.json"
)

async function importRuntime() {
  const [
    envModule,
    dashboardSessionModule,
    pricingModule,
    presetsModule,
    providersModule,
    settingsModule,
    storageModule,
    orchestratorModule,
  ] = await Promise.all([
    import("@/lib/env"),
    import("@/lib/dashboard-session"),
    import("@/lib/agent/pricing"),
    import("@/lib/agent/presets"),
    import("@/lib/agent/providers"),
    import("@/lib/agent/settings"),
    import("@/lib/agent/storage"),
    import("@/lib/agent/orchestrator"),
  ])

  return {
    completeJsonWithProvider: providersModule.completeJsonWithProvider,
    deleteAgentConversation: storageModule.deleteAgentConversation,
    env: envModule.env,
    estimateUsageCostUsd: pricingModule.estimateUsageCostUsd,
    getAgentPreset: presetsModule.getAgentPreset,
    getPresetReleaseScoreThreshold: presetsModule.getPresetReleaseScoreThreshold,
    listAgentPresets: presetsModule.listAgentPresets,
    resolveDashboardSession: dashboardSessionModule.resolveDashboardSession,
    resolveProviderModel: providersModule.resolveProviderModel,
    resolveWorkspaceAgentCredential: settingsModule.resolveWorkspaceAgentCredential,
    runAgentTurn: orchestratorModule.runAgentTurn,
  }
}

type FailureClass =
  | "prompt"
  | "backend_contract"
  | "orchestration"
  | "data_gap"
  | "mixed"

type EvalVerdict = "useful" | "partially_useful" | "not_useful"

type JudgeResult = {
  score: number
  verdict: EvalVerdict
  failureClass: FailureClass
  strengths: string[]
  gaps: string[]
  shouldIteratePrompt: boolean
  rewrittenPrompt?: string
  estimatedCostUsd?: number
}

type CliOptions = {
  presetId?: AgentPresetId
  workspaceId?: string
  from?: string
  to?: string
  presetAnchorDate?: string
  outputDir?: string
  compare?: "none" | "previous_period" | "previous_year"
  iterations: number
  targetScore: number
  cleanup: boolean
}

type RunbookReleaseGateRecord = {
  presetId: AgentPresetId
  lastScore: number
  threshold: number
  ready: boolean
  evaluatedAt: string
  reportPath: string
}

type RunbookReleaseGateFile = {
  generatedAt: string
  gates: RunbookReleaseGateRecord[]
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    cleanup: true,
    compare: "previous_period",
    iterations: 3,
    targetScore: 8,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    switch (arg) {
      case "--preset":
        options.presetId = next as AgentPresetId
        index += 1
        break
      case "--workspace":
        options.workspaceId = next
        index += 1
        break
      case "--from":
        options.from = next
        index += 1
        break
      case "--to":
        options.to = next
        index += 1
        break
      case "--preset-anchor":
        options.presetAnchorDate = next
        index += 1
        break
      case "--output-dir":
        options.outputDir = next
        index += 1
        break
      case "--compare":
        options.compare = next as CliOptions["compare"]
        index += 1
        break
      case "--iterations":
        options.iterations = Math.max(1, Number(next ?? "3") || 3)
        index += 1
        break
      case "--target":
        options.targetScore = Math.max(1, Math.min(10, Number(next ?? "8") || 8))
        index += 1
        break
      case "--keep-conversations":
        options.cleanup = false
        break
      default:
        break
    }
  }

  return options
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function addUtcDays(isoDate: string, days: number) {
  const value = new Date(`${isoDate}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function buildDefaultRange() {
  const to = todayIsoDate()
  const from = addUtcDays(to, -29)
  return { from, to }
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.max(1, Math.min(10, Math.round(value)))
}

function formatList(items: string[]) {
  if (items.length === 0) {
    return "- none"
  }

  return items.map((item) => `- ${item}`).join("\n")
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

async function saveLabReport(input: {
  answer: AgentStorageMessage
  compare: string
  failureClass?: FailureClass
  from: string
  gaps?: string[]
  iteration: number
  outputDir: string
  presetAnchorDate?: string
  presetId: AgentPresetId
  presetLabel: string
  prompt: string
  score?: number
  strengths?: string[]
  targetScore: number
  to: string
  verdict?: EvalVerdict
  workspaceId: string
}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const fileName = `${timestamp}-${slugify(input.presetId)}-iter-${input.iteration}.md`
  const outputPath = path.join(input.outputDir, fileName)
  const metadata = JSON.stringify(input.answer.metadata ?? {}, null, 2)

  const lines = [
    `# Agent Lab Report`,
    "",
    `- Preset: ${input.presetLabel} (\`${input.presetId}\`)`,
    `- Workspace: \`${input.workspaceId}\``,
    `- Base range: ${input.from} to ${input.to}`,
    `- Compare mode: ${input.compare}`,
    `- Iteration: ${input.iteration}`,
    `- Target score: ${input.targetScore}/10`,
    input.presetAnchorDate ? `- Preset anchor date: ${input.presetAnchorDate}` : null,
    input.score !== undefined ? `- Score: ${input.score}/10` : null,
    input.verdict ? `- Verdict: ${input.verdict}` : null,
    input.failureClass ? `- Failure class: ${input.failureClass}` : null,
    "",
    "## Prompt",
    "",
    input.prompt,
    "",
    "## Strengths",
    "",
    formatList(input.strengths ?? []),
    "",
    "## Gaps",
    "",
    formatList(input.gaps ?? []),
    "",
    "## Assistant Answer",
    "",
    input.answer.content || "(empty)",
    "",
    "## Assistant Metadata",
    "",
    "```json",
    metadata,
    "```",
    "",
  ].filter((line): line is string => line !== null)

  await mkdir(input.outputDir, { recursive: true })
  await writeFile(outputPath, lines.join("\n"), "utf8")

  return outputPath
}

function estimateAssistantCostUsd(message: AgentStorageMessage) {
  const usage = (message.metadata?.usage ?? {}) as { estimatedCostUsd?: number }
  return Number(usage.estimatedCostUsd ?? 0)
}

async function readReleaseGatesFile() {
  try {
    const raw = (await readFile(RUNBOOK_RELEASE_GATES_PATH, "utf8")).replace(
      /^\uFEFF/,
      ""
    )
    const parsed = JSON.parse(raw) as {
      generatedAt?: unknown
      gates?: unknown[]
    }

    if (!Array.isArray(parsed.gates)) {
      return null
    }

    const gates = parsed.gates.filter(
      (entry): entry is RunbookReleaseGateRecord =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as RunbookReleaseGateRecord).presetId === "string" &&
        Number.isFinite(Number((entry as RunbookReleaseGateRecord).lastScore)) &&
        Number.isFinite(Number((entry as RunbookReleaseGateRecord).threshold)) &&
        typeof (entry as RunbookReleaseGateRecord).ready === "boolean" &&
        typeof (entry as RunbookReleaseGateRecord).evaluatedAt === "string" &&
        typeof (entry as RunbookReleaseGateRecord).reportPath === "string"
    )

    return {
      generatedAt: String(parsed.generatedAt ?? "").trim(),
      gates,
    } satisfies RunbookReleaseGateFile
  } catch {
    return null
  }
}

async function writeReleaseGateRecord(entry: RunbookReleaseGateRecord) {
  const existing = await readReleaseGatesFile()
  const remaining = (existing?.gates ?? []).filter(
    (gate) => gate.presetId !== entry.presetId
  )
  const next: RunbookReleaseGateFile = {
    generatedAt: new Date().toISOString(),
    gates: [...remaining, entry].sort((a, b) =>
      a.presetId.localeCompare(b.presetId)
    ),
  }

  await mkdir(path.dirname(RUNBOOK_RELEASE_GATES_PATH), { recursive: true })
  await writeFile(
    RUNBOOK_RELEASE_GATES_PATH,
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8"
  )
}

async function estimateJudgeCostUsdFromRuntime(input: {
  provider: "openai" | "anthropic"
  model: string
  usage?: { inputTokens?: number; outputTokens?: number }
}) {
  const { estimateUsageCostUsd } = await importRuntime()
  const estimate = estimateUsageCostUsd({
    inputTokens: Number(input.usage?.inputTokens ?? 0),
    model: input.model,
    outputTokens: Number(input.usage?.outputTokens ?? 0),
    provider: input.provider,
  })

  return Number(estimate?.costUsd ?? 0)
}

async function judgeRunbookOutput(input: {
  workspaceId: string
  presetId: AgentPresetId
  prompt: string
  answer: AgentStorageMessage
  targetScore: number
}) {
  const {
    completeJsonWithProvider,
    resolveProviderModel,
    resolveWorkspaceAgentCredential,
  } = await importRuntime()
  const credential = await resolveWorkspaceAgentCredential({
    workspaceId: input.workspaceId,
  })
  const model = await resolveProviderModel({
    apiKey: credential.apiKey,
    provider: credential.provider,
    selectedModel: credential.model,
  })
  const result = await completeJsonWithProvider<JudgeResult>({
    apiKey: credential.apiKey,
    maxTokens: 1400,
    model,
    provider: credential.provider,
    systemPrompt:
      "You are a strict evaluator for ecommerce analysis runbooks. Judge whether the output would genuinely help an operator make decisions. Return JSON only.",
    userPrompt: [
      "Score this runbook result from 1 to 10.",
      "Use these standards:",
      "- 9-10: genuinely useful, decision-ready, commercially sharp",
      "- 7-8: useful but missing some depth",
      "- 4-6: partly useful but materially incomplete",
      "- 1-3: not useful for decision-making",
      "Classify the dominant failure cause as one of:",
      '- "prompt" when the wording/structure is weak',
      '- "backend_contract" when the data/tool output is too thin or missing needed structure',
      '- "orchestration" when routing/execution/formatting is broken',
      '- "data_gap" when the warehouse lacks the needed underlying data',
      '- "mixed" when more than one of those is equally true',
      "Only set shouldIteratePrompt=true when prompt rewriting alone is likely to help.",
      `Target score: ${input.targetScore}/10`,
      `Preset id: ${input.presetId}`,
      "Prompt used:",
      input.prompt,
      "Assistant answer:",
      input.answer.content,
      "Assistant metadata JSON:",
      JSON.stringify(input.answer.metadata ?? {}),
      'Return JSON with keys: {"score": number, "verdict": "useful"|"partially_useful"|"not_useful", "failureClass": "prompt"|"backend_contract"|"orchestration"|"data_gap"|"mixed", "strengths": string[], "gaps": string[], "shouldIteratePrompt": boolean, "rewrittenPrompt"?: string}',
    ].join("\n\n"),
  })

  return {
    ...result.data,
    estimatedCostUsd: await estimateJudgeCostUsdFromRuntime({
      model,
      provider: credential.provider,
      usage: result.raw.usage,
    }),
    score: clampScore(result.data.score),
  }
}

async function run() {
  const {
    deleteAgentConversation,
    env,
    getAgentPreset,
    getPresetReleaseScoreThreshold,
    listAgentPresets,
    resolveDashboardSession,
    runAgentTurn,
  } = await importRuntime()
  const options = parseArgs(process.argv.slice(2))
  const session = await resolveDashboardSession()
  const presets = listAgentPresets()

  if (!options.presetId) {
    console.log("Available presets:")
    for (const preset of presets) {
      console.log(`- ${preset.id}: ${preset.label}`)
    }
    console.log("\nRun with: npm run agent:lab -- --preset <preset-id>")
    process.exit(0)
  }

  const preset = getAgentPreset(options.presetId)
  const workspaceId = options.workspaceId || session.defaultWorkspaceId
  const defaultRange = buildDefaultRange()
  const from = options.from || defaultRange.from
  const to = options.to || defaultRange.to
  const outputDir = options.outputDir
    ? path.resolve(process.cwd(), options.outputDir)
    : path.join(process.cwd(), "artifacts", "agent-lab")
  let prompt = preset.defaultMessage
  let labEstimatedCostUsd = 0
  const labBudgetUsd = env.agent.labBudgetUsdPerRun
  const scoreThreshold = getPresetReleaseScoreThreshold(options.presetId)

  console.log(`Preset: ${preset.label} (${preset.id})`)
  console.log(`Workspace: ${workspaceId}`)
  console.log(`Base range: ${from} to ${to}`)
  if (options.presetAnchorDate) {
    console.log(`Preset anchor date: ${options.presetAnchorDate}`)
  }
  console.log(`Iterations: ${options.iterations}, target score: ${options.targetScore}`)
  console.log(`Release gate threshold: ${scoreThreshold}/10`)
  console.log(`Lab budget cap: $${labBudgetUsd.toFixed(2)} per run`)

  for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
    if (labBudgetUsd > 0 && labEstimatedCostUsd >= labBudgetUsd) {
      console.log(
        `\nStopping before iteration ${iteration}: lab budget cap reached at $${labEstimatedCostUsd.toFixed(2)}.`
      )
      break
    }

    console.log(`\n=== Iteration ${iteration} ===`)

    const result = await runAgentTurn({
      context: {
        compare: options.compare ?? "previous_period",
        from,
        session,
        to,
        workspaceId,
      },
      message: prompt,
      presetAnchorDate: options.presetAnchorDate,
      presetId: options.presetId,
      titleSeed: `${preset.titleSeed} lab ${iteration}`,
    })

    const answer = result.assistantMessage
    labEstimatedCostUsd += estimateAssistantCostUsd(answer)

    if (labBudgetUsd > 0 && labEstimatedCostUsd >= labBudgetUsd) {
      console.log(
        `Assistant run consumed the remaining lab budget. Estimated lab spend is now $${labEstimatedCostUsd.toFixed(4)}. Skipping judge step.`
      )

      const reportPath = await saveLabReport({
        answer,
        compare: options.compare ?? "previous_period",
        from,
        iteration,
        outputDir,
        presetAnchorDate: options.presetAnchorDate,
        presetId: options.presetId,
        presetLabel: preset.label,
        prompt,
        targetScore: options.targetScore,
        to,
        workspaceId,
      })
      console.log(`Saved lab report: ${reportPath}`)

      if (options.cleanup) {
        await deleteAgentConversation(result.conversationId)
      }

      break
    }

    const judge = await judgeRunbookOutput({
      answer,
      presetId: options.presetId,
      prompt,
      targetScore: options.targetScore,
      workspaceId,
    })
    labEstimatedCostUsd += Number(judge.estimatedCostUsd ?? 0)

    console.log(`Score: ${judge.score}/10`)
    console.log(`Verdict: ${judge.verdict}`)
    console.log(`Failure class: ${judge.failureClass}`)
    console.log(`Execution mode: ${result.executionMode}`)
    console.log(`Estimated lab spend so far: $${labEstimatedCostUsd.toFixed(4)}`)
    console.log("Strengths:")
    console.log(formatList(judge.strengths))
    console.log("Gaps:")
    console.log(formatList(judge.gaps))
    console.log("Assistant answer:")
    console.log(answer.content || "(empty)")

    const reportPath = await saveLabReport({
      answer,
      compare: options.compare ?? "previous_period",
      failureClass: judge.failureClass,
      from,
      gaps: judge.gaps,
      iteration,
      outputDir,
      presetAnchorDate: options.presetAnchorDate,
      presetId: options.presetId,
      presetLabel: preset.label,
      prompt,
      score: judge.score,
      strengths: judge.strengths,
      targetScore: options.targetScore,
      to,
      verdict: judge.verdict,
      workspaceId,
    })
    console.log(`Saved lab report: ${reportPath}`)
    const releaseGateReportPath = path
      .relative(process.cwd(), reportPath)
      .replace(/\\/g, "/")
    const releaseGateReady = judge.score >= scoreThreshold
    await writeReleaseGateRecord({
      evaluatedAt: new Date().toISOString(),
      lastScore: judge.score,
      presetId: options.presetId,
      ready: releaseGateReady,
      reportPath: releaseGateReportPath,
      threshold: scoreThreshold,
    })
    console.log(
      `Updated runbook release gate: ${options.presetId} score=${judge.score}/10 threshold=${scoreThreshold}/10 ready=${releaseGateReady}`
    )
    console.log(
      `Gate file: ${path.relative(process.cwd(), RUNBOOK_RELEASE_GATES_PATH).replace(/\\/g, "/")}`
    )

    if (options.cleanup) {
      await deleteAgentConversation(result.conversationId)
    }

    if (judge.score >= options.targetScore) {
      console.log("\nTarget score reached. Stopping.")
      break
    }

    if (!judge.shouldIteratePrompt || !judge.rewrittenPrompt?.trim()) {
      console.log(
        "\nStopping because the judge says prompt iteration alone is unlikely to fix this."
      )
      break
    }

    if (labBudgetUsd > 0 && labEstimatedCostUsd >= labBudgetUsd) {
      console.log(
        `\nStopping because the lab budget cap has been reached at $${labEstimatedCostUsd.toFixed(4)}.`
      )
      break
    }

    prompt = judge.rewrittenPrompt.trim()
    console.log("\nApplying rewritten prompt candidate for next iteration.")
  }
}

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
