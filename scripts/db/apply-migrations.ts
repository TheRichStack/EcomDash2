#!/usr/bin/env node

import { createClient } from "@libsql/client"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

import { resolveBootstrapDbConfig } from "@/lib/db/bootstrap/config"

type ParsedArgs = {
  flags: Set<string>
  values: Map<string, string>
}

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

function hasFlag(args: ParsedArgs, key: string) {
  return args.flags.has(key)
}

function maskUrl(url: string) {
  if (!url) {
    return "(missing)"
  }

  return url.replace(/:\/\/([^@/]+)@/, "://***@")
}

async function resolveMigrationFiles(migrationsDir: string) {
  const entries = await readdir(migrationsDir, {
    withFileTypes: true,
  })

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

async function assertTargetIsEmpty(client: ReturnType<typeof createClient>) {
  const result = await client.execute(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `)
  const tableNames = result.rows.map((row) => String(row.name ?? ""))

  if (tableNames.length > 0) {
    throw new Error(
      [
        "Target DB is not empty.",
        "The baseline migration apply script is intended for a fresh dedicated DB bootstrap.",
        `Existing tables: ${tableNames.join(", ")}`,
        "Re-run with --allow-existing only if you are intentionally applying the baseline to a partially prepared database.",
      ].join(" ")
    )
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dryRun = hasFlag(args, "dry-run")
  const allowExisting = hasFlag(args, "allow-existing")
  const migrationsDir =
    readStringArg(args, "dir") || path.join(process.cwd(), "lib", "db", "migrations")
  const migrationFiles = await resolveMigrationFiles(migrationsDir)

  if (migrationFiles.length === 0) {
    throw new Error(`No .sql migration files found in ${migrationsDir}.`)
  }

  console.log(`Migrations directory: ${migrationsDir}`)
  console.log(`Migration files: ${migrationFiles.join(", ")}`)

  if (dryRun) {
    console.log("Dry run only. No target DB connection attempted.")
    return
  }

  const targetConfig = resolveBootstrapDbConfig("target", {
    authToken: readStringArg(args, "auth-token") || undefined,
    url: readStringArg(args, "url") || undefined,
  })

  if (!targetConfig.isConfigured) {
    throw new Error(
      [
        "Target DB is not configured.",
        "Set ECOMDASH2_TARGET_TURSO_URL and ECOMDASH2_TARGET_TURSO_AUTH_TOKEN,",
        "or pass --url=... and --auth-token=... to the script.",
      ].join(" ")
    )
  }

  console.log(`Target DB: ${maskUrl(targetConfig.url)}`)
  console.log(
    `Target env sources: url=${targetConfig.urlEnvName ?? "(missing)"}, auth=${targetConfig.authTokenEnvName ?? "(missing)"}`
  )

  const client = createClient({
    authToken: targetConfig.authToken,
    intMode: "number",
    url: targetConfig.url,
  })

  if (!allowExisting) {
    await assertTargetIsEmpty(client)
  }

  for (const filename of migrationFiles) {
    const sql = await readFile(path.join(migrationsDir, filename), "utf8")

    console.log(`Applying ${filename}`)
    await client.executeMultiple(sql)
  }

  console.log(`Applied ${migrationFiles.length} migration files successfully.`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
