#!/usr/bin/env node

import process from "node:process"

import {
  parseCliArgs,
  printRunnerSummary,
  readCsvArg,
  readNumberArg,
  readStringArg,
} from "@/lib/jobs/runtime/cli"
import { createJobRuntimeContext } from "@/lib/jobs/runtime/context"
import { runDailyReconcile } from "@/lib/jobs/runners/reconcile"

function resolveSources(args: ReturnType<typeof parseCliArgs>) {
  const sources = readCsvArg(args, "sources")
  const source = readStringArg(args, "source").trim().toLowerCase()

  return source && sources.length === 0 ? [source] : sources
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2))
  const context = await createJobRuntimeContext({
    jobName: "jobs:reconcile",
    workspaceId: readStringArg(args, "workspace") || undefined,
  })
  const summary = await runDailyReconcile(context, {
    adLookbackDays: readNumberArg(args, "ad-days", 28),
    contractLookbackDays: readNumberArg(args, "contracts-days", 90),
    shopifyLookbackDays: readNumberArg(args, "shopify-days", 90),
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
