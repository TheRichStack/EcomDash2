export type ParsedCliArgs = {
  flags: Record<string, boolean | string>
}

export type JobRunnerSummary = {
  jobName: string
  message: string
  runId: string
  status: string
  warnings: string[]
  workspaceId: string
}

export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  const flags: Record<string, boolean | string> = {}

  for (const rawArg of argv) {
    const arg = String(rawArg ?? "").trim()

    if (!arg.startsWith("--")) {
      continue
    }

    const body = arg.slice(2)
    const separatorIndex = body.indexOf("=")

    if (separatorIndex < 0) {
      flags[body] = true
      continue
    }

    const key = body.slice(0, separatorIndex).trim()
    const value = body.slice(separatorIndex + 1).trim()

    if (key) {
      flags[key] = value
    }
  }

  return { flags }
}

export function readStringArg(args: ParsedCliArgs, key: string, fallback = "") {
  const value = args.flags[key]
  return typeof value === "string" ? value : fallback
}

export function readBooleanArg(args: ParsedCliArgs, key: string) {
  return args.flags[key] === true
}

export function readNumberArg(
  args: ParsedCliArgs,
  key: string,
  fallback: number
) {
  const parsed = Number(readStringArg(args, key))

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export function readCsvArg(args: ParsedCliArgs, key: string) {
  return readStringArg(args, key)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export function printRunnerSummary(summary: JobRunnerSummary) {
  const warnings =
    summary.warnings.length > 0 ? ` warnings=${summary.warnings.length}` : ""

  console.log(
    `[${summary.jobName}] status=${summary.status} run_id=${summary.runId} workspace=${summary.workspaceId}${warnings}`
  )
  console.log(`[${summary.jobName}] ${summary.message}`)
}
