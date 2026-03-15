#!/usr/bin/env node

import process from "node:process"

import {
  parseCliArgs,
  printRunnerSummary,
  readCsvArg,
  readNumberArg,
  readStringArg,
  readBooleanArg,
} from "@/lib/jobs/runtime/cli"
import { createJobRuntimeContext } from "@/lib/jobs/runtime/context"
import { runBackfill } from "@/lib/jobs/runners/backfill"

function resolveSources(args: ReturnType<typeof parseCliArgs>) {
  const sources = readCsvArg(args, "sources")
  const source = readStringArg(args, "source").trim().toLowerCase()

  return source && sources.length === 0 ? [source] : sources
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2))
  const context = await createJobRuntimeContext({
    jobName: "jobs:backfill",
    workspaceId: readStringArg(args, "workspace") || undefined,
  })
  const summary = await runBackfill(context, {
    chunkDays: readNumberArg(args, "chunk-days", 30),
    from: readStringArg(args, "from") || undefined,
    resume: readBooleanArg(args, "resume"),
    scope: readStringArg(args, "scope") || undefined,
    sources: resolveSources(args),
    to: readStringArg(args, "to") || undefined,
  })

  printRunnerSummary(summary)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
