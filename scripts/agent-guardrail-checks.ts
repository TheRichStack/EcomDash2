import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { sanitizeAgentSqlQuery } from "@/lib/agent/broker"
import { executeAgentRunLocally } from "@/lib/agent/executor"
import { resetAgentPresetCachesForTests, listAgentPresets } from "@/lib/agent/presets"
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

async function main() {
  await verifyOpDispatchAllowlist()
  verifySqlRowCapEnforcement()
  await verifyRunbookReleaseGateFailClosed()
  console.log("agent-guardrail-checks: PASS")
}

main().catch((error) => {
  console.error("agent-guardrail-checks: FAIL")
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 1
})
