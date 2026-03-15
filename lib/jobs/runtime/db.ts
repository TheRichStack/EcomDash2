import { createClient } from "@libsql/client"

import { resolveDatabaseConfig, type RuntimeEnv } from "@/lib/jobs/runtime/env"

export type JobSqlArgs = ReadonlyArray<unknown> | undefined

export type JobSqlResult = {
  rows?: Array<Record<string, unknown>>
  rowsAffected?: bigint | number
}

export type JobSqlStatement =
  | string
  | {
      args?: JobSqlArgs
      sql: string
    }

export type JobDatabaseClient = {
  execute(statement: JobSqlStatement): Promise<JobSqlResult>
}

function createUncachedFetch(): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...(init ?? {}),
      cache: "no-store",
    })
}

export function createJobDatabaseClient(runtimeEnv: RuntimeEnv): JobDatabaseClient {
  const database = resolveDatabaseConfig(runtimeEnv)

  if (!database.isConfigured) {
    throw new Error(
      "Turso is not configured. Set ECOMDASH2_TURSO_URL and ECOMDASH2_TURSO_AUTH_TOKEN."
    )
  }

  return createClient({
    authToken: database.authToken,
    fetch: createUncachedFetch(),
    intMode: "number",
    url: database.url,
  })
}
