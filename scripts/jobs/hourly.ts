#!/usr/bin/env node

import process from "node:process"

import {
  parseCliArgs,
  printRunnerSummary,
  readBooleanArg,
  readStringArg,
} from "@/lib/jobs/runtime/cli"
import { createJobRuntimeContext } from "@/lib/jobs/runtime/context"
import { runHourlySync } from "@/lib/jobs/runners/hourly"

async function main() {
  const args = parseCliArgs(process.argv.slice(2))
  const context = await createJobRuntimeContext({
    jobName: "jobs:sync:hourly",
    workspaceId: readStringArg(args, "workspace") || undefined,
  })
  const summary = await runHourlySync(context, {
    from: readStringArg(args, "from") || undefined,
    onlyContracts: readBooleanArg(args, "only-contracts"),
    to: readStringArg(args, "to") || undefined,
  })

  printRunnerSummary(summary)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
