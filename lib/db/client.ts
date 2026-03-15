import "server-only"

import { createClient } from "@libsql/client"

import { env } from "@/lib/env"

type SqlArgs = ReadonlyArray<unknown> | undefined

type RawSqlResult = {
  rows?: Array<Record<string, unknown>>
  rowsAffected?: number | bigint
}

type TursoClient = {
  execute(
    statement:
      | string
      | {
          sql: string
          args?: SqlArgs
        }
  ): Promise<RawSqlResult>
}

declare global {
  var __ecomdash2_turso_client_promise: Promise<TursoClient> | undefined
}

function createUncachedFetch(): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...(init ?? {}),
      cache: "no-store",
    })
}

async function createTursoClient(): Promise<TursoClient> {
  if (!env.backend.isConfigured) {
    throw new Error(
      "Turso is not configured. Set ECOMDASH2_TURSO_URL and ECOMDASH2_TURSO_AUTH_TOKEN."
    )
  }

  return createClient({
    url: env.backend.tursoUrl,
    authToken: env.backend.tursoAuthToken,
    intMode: "number",
    fetch: createUncachedFetch(),
  })
}

export function isTursoConfigured() {
  return env.backend.isConfigured
}

export async function getTursoClient(): Promise<TursoClient> {
  if (!global.__ecomdash2_turso_client_promise) {
    global.__ecomdash2_turso_client_promise = createTursoClient()
  }

  return global.__ecomdash2_turso_client_promise
}
