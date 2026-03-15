import {
  calculateAov,
  calculateBlendedRoas,
  calculateGrossProfit,
  calculateMer,
  calculateNetProfitAfterAds,
} from "@/lib/metrics/formulas"

import type { JobDatabaseClient } from "@/lib/jobs/runtime/db"

type SqlStatement = {
  args?: readonly unknown[]
  sql: string
}

function buildDirtyDatePlaceholders(count: number) {
  return new Array(count).fill("?").join(", ")
}

export function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function toRowsAffected(value: bigint | number | undefined) {
  if (typeof value === "bigint") {
    return Number(value)
  }

  return Number.isFinite(Number(value)) ? Number(value) : 0
}

export async function executeStatements(
  client: JobDatabaseClient,
  statements: readonly SqlStatement[]
) {
  for (const statement of statements) {
    await client.execute(statement)
  }
}

export async function deleteContractRows(
  client: JobDatabaseClient,
  workspaceId: string,
  from: string,
  to: string,
  dirtyDates?: readonly string[]
) {
  if (Array.isArray(dirtyDates)) {
    if (dirtyDates.length === 0) {
      return
    }

    const placeholders = buildDirtyDatePlaceholders(dirtyDates.length)

    await executeStatements(client, [
      {
        args: [workspaceId, ...dirtyDates],
        sql: `DELETE FROM contract_daily_overview WHERE workspace_id = ? AND date IN (${placeholders})`,
      },
      {
        args: [workspaceId, ...dirtyDates],
        sql: `DELETE FROM contract_daily_channel_campaign WHERE workspace_id = ? AND date IN (${placeholders})`,
      },
      {
        args: [workspaceId, ...dirtyDates],
        sql: `DELETE FROM contract_creative_performance WHERE workspace_id = ? AND date IN (${placeholders})`,
      },
    ])

    return
  }

  await executeStatements(client, [
    {
      args: [workspaceId, from, to],
      sql: `
        DELETE FROM contract_daily_overview
        WHERE workspace_id = ? AND date >= ? AND date <= ?
      `,
    },
    {
      args: [workspaceId, from, to],
      sql: `
        DELETE FROM contract_daily_channel_campaign
        WHERE workspace_id = ? AND date >= ? AND date <= ?
      `,
    },
    {
      args: [workspaceId, from, to],
      sql: `
        DELETE FROM contract_creative_performance
        WHERE workspace_id = ? AND date >= ? AND date <= ?
      `,
    },
  ])
}

export {
  calculateAov,
  calculateBlendedRoas,
  calculateGrossProfit,
  calculateMer,
  calculateNetProfitAfterAds,
}
