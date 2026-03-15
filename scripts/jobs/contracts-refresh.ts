#!/usr/bin/env node

import process from "node:process"

import {
  parseCliArgs,
  printRunnerSummary,
  readStringArg,
} from "@/lib/jobs/runtime/cli"
import { createJobRuntimeContext } from "@/lib/jobs/runtime/context"
import { parseDirtyDates } from "@/lib/jobs/runtime/date"
import { runContractsRefresh } from "@/lib/jobs/runners/contracts-refresh"

async function main() {
  const args = parseCliArgs(process.argv.slice(2))
  const dirtyDatesRaw = readStringArg(args, "dirty-dates")
  const context = await createJobRuntimeContext({
    jobName: "jobs:contracts:refresh",
    workspaceId: readStringArg(args, "workspace") || undefined,
  })
  const summary = await runContractsRefresh(context, {
    dirtyDates: dirtyDatesRaw ? parseDirtyDates(dirtyDatesRaw) : undefined,
    from: readStringArg(args, "from") || undefined,
    to: readStringArg(args, "to") || undefined,
  })

  printRunnerSummary(summary)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
