#!/usr/bin/env node

import process from "node:process"

import {
  resolveBootstrapDbConfig,
  resolveBootstrapWorkspaceId,
} from "@/lib/db/bootstrap/config"
import {
  DEDICATED_DB_COPY_GROUPS,
  DEDICATED_DB_SUPPORT_TABLE_ACTIONS,
  DEDICATED_DB_VALIDATION_STEPS,
} from "@/lib/db/bootstrap/plan"

type ParsedArgs = {
  flags: Set<string>
  values: Map<string, string>
}

type OutputFormat = "json" | "text"

function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Set<string>()
  const values = new Map<string, string>()

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue
    }

    const trimmed = arg.slice(2)

    if (!trimmed) {
      continue
    }

    const separatorIndex = trimmed.indexOf("=")

    if (separatorIndex === -1) {
      flags.add(trimmed)
      continue
    }

    const key = trimmed.slice(0, separatorIndex)
    const value = trimmed.slice(separatorIndex + 1)

    if (key) {
      values.set(key, value)
    }
  }

  return {
    flags,
    values,
  }
}

function readStringArg(args: ParsedArgs, key: string) {
  return String(args.values.get(key) ?? "").trim()
}

function resolveFormat(rawFormat: string): OutputFormat {
  return rawFormat.toLowerCase() === "json" ? "json" : "text"
}

function maskUrl(url: string) {
  if (!url) {
    return "(missing)"
  }

  return url.replace(/:\/\/([^@/]+)@/, "://***@")
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const workspaceId = resolveBootstrapWorkspaceId(readStringArg(args, "workspace"))
  const format = resolveFormat(readStringArg(args, "format") || "text")
  const source = resolveBootstrapDbConfig("source")
  const target = resolveBootstrapDbConfig("target")
  const plan = {
    source: {
      authTokenEnvName: source.authTokenEnvName,
      isConfigured: source.isConfigured,
      url: maskUrl(source.url),
      urlEnvName: source.urlEnvName,
    },
    supportTableActions: DEDICATED_DB_SUPPORT_TABLE_ACTIONS,
    target: {
      authTokenEnvName: target.authTokenEnvName,
      isConfigured: target.isConfigured,
      url: maskUrl(target.url),
      urlEnvName: target.urlEnvName,
    },
    validationSteps: DEDICATED_DB_VALIDATION_STEPS,
    workspaceId,
    groups: DEDICATED_DB_COPY_GROUPS.map((group, index) => ({
      ...group,
      countQueryTemplate: `SELECT COUNT(*) AS row_count FROM <table> WHERE workspace_id = '${workspaceId}';`,
      order: index + 1,
    })),
  }

  if (format === "json") {
    console.log(JSON.stringify(plan, null, 2))
    return
  }

  const lines = [
    `Dedicated DB copy/seed plan for workspace "${workspaceId}"`,
    "",
    "DB env resolution:",
    `- source: ${plan.source.url} (url=${plan.source.urlEnvName ?? "(missing)"}, auth=${plan.source.authTokenEnvName ?? "(missing)"}, configured=${plan.source.isConfigured ? "yes" : "no"})`,
    `- target: ${plan.target.url} (url=${plan.target.urlEnvName ?? "(missing)"}, auth=${plan.target.authTokenEnvName ?? "(missing)"}, configured=${plan.target.isConfigured ? "yes" : "no"})`,
    "",
    "Ordered copy groups:",
  ]

  for (const group of plan.groups) {
    lines.push(`${group.order}. ${group.key}`)
    lines.push(`   purpose: ${group.purpose}`)
    lines.push(`   strategy: ${group.copyStrategy}`)
    lines.push(`   tables: ${group.tables.join(", ")}`)
    lines.push(`   count query: ${group.countQueryTemplate}`)
  }

  lines.push("")
  lines.push("Currently written but not owned support tables:")

  for (const action of plan.supportTableActions) {
    lines.push(`- ${action.table}`)
    lines.push(`  current writer: ${action.currentWriter}`)
    lines.push(`  target action: ${action.targetAction}`)
    lines.push(`  before cutover: ${action.requiredBeforeCutover}`)
  }

  lines.push("")
  lines.push("Validation steps:")

  for (const [index, step] of plan.validationSteps.entries()) {
    lines.push(`${index + 1}. ${step}`)
  }

  console.log(lines.join("\n"))
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
