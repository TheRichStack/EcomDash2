import type { JobDatabaseClient } from "@/lib/jobs/runtime/db"

import {
  calculateAov,
  calculateBlendedRoas,
  calculateGrossProfit,
  calculateMer,
  calculateNetProfitAfterAds,
  executeStatements,
  toNumber,
} from "@/lib/jobs/contracts/helpers"

type OverviewBucket = {
  cogs: number
  google_revenue: number
  google_spend: number
  meta_revenue: number
  meta_spend: number
  order_revenue: number
  payment_fee_data_points: number
  payment_fees: number
  shipping_cost: number
  shipping_data_points: number
  tiktok_revenue: number
  tiktok_spend: number
  total_orders: number
  total_refunded: number
  total_revenue: number
  total_spend: number
  new_customers: number
}

function createEmptyOverviewBucket(): OverviewBucket {
  return {
    cogs: 0,
    google_revenue: 0,
    google_spend: 0,
    meta_revenue: 0,
    meta_spend: 0,
    new_customers: 0,
    order_revenue: 0,
    payment_fee_data_points: 0,
    payment_fees: 0,
    shipping_cost: 0,
    shipping_data_points: 0,
    tiktok_revenue: 0,
    tiktok_spend: 0,
    total_orders: 0,
    total_refunded: 0,
    total_revenue: 0,
    total_spend: 0,
  }
}

export async function insertOverviewRows(
  client: JobDatabaseClient,
  workspaceId: string,
  from: string,
  to: string,
  updatedAt: string
) {
  const [ordersResult, itemsResult, adsResult] = await Promise.all([
    client.execute({
      args: [workspaceId, from, to],
      sql: `
        SELECT
          order_date AS date,
          SUM(net_revenue) AS total_revenue,
          SUM(total_revenue) AS order_revenue,
          SUM(total_refunded) AS total_refunded,
          COUNT(*) AS total_orders,
          SUM(CASE WHEN is_first_order = 1 THEN 1 ELSE 0 END) AS new_customers,
          SUM(
            CASE WHEN shipping_cost IS NOT NULL AND shipping_cost != ''
              THEN CAST(shipping_cost AS REAL)
              ELSE 0
            END
          ) AS shipping_cost,
          COUNT(
            CASE WHEN shipping_cost IS NOT NULL AND shipping_cost != ''
              THEN 1
            END
          ) AS shipping_data_points,
          SUM(
            CASE WHEN payment_fees IS NOT NULL AND payment_fees != ''
              THEN CAST(payment_fees AS REAL)
              ELSE 0
            END
          ) AS payment_fees,
          COUNT(
            CASE WHEN payment_fees IS NOT NULL AND payment_fees != ''
              THEN 1
            END
          ) AS payment_fee_data_points
        FROM fact_orders
        WHERE workspace_id = ? AND order_date >= ? AND order_date <= ?
        GROUP BY order_date
      `,
    }),
    client.execute({
      args: [workspaceId, from, to],
      sql: `
        SELECT order_date AS date, SUM(line_cost) AS cogs
        FROM fact_order_items
        WHERE workspace_id = ? AND order_date >= ? AND order_date <= ?
        GROUP BY order_date
      `,
    }),
    client.execute({
      args: [workspaceId, from, to],
      sql: `
        SELECT
          date,
          SUM(spend) AS total_spend,
          SUM(
            CASE
              WHEN LOWER(platform) LIKE '%meta%'
                OR LOWER(platform) LIKE '%facebook%'
                OR LOWER(platform) LIKE '%instagram%'
              THEN spend
              ELSE 0
            END
          ) AS meta_spend,
          SUM(
            CASE
              WHEN LOWER(platform) LIKE '%meta%'
                OR LOWER(platform) LIKE '%facebook%'
                OR LOWER(platform) LIKE '%instagram%'
              THEN revenue
              ELSE 0
            END
          ) AS meta_revenue,
          SUM(
            CASE
              WHEN LOWER(platform) LIKE '%google%'
                OR LOWER(platform) LIKE '%adwords%'
                OR LOWER(platform) LIKE '%youtube%'
              THEN spend
              ELSE 0
            END
          ) AS google_spend,
          SUM(
            CASE
              WHEN LOWER(platform) LIKE '%google%'
                OR LOWER(platform) LIKE '%adwords%'
                OR LOWER(platform) LIKE '%youtube%'
              THEN revenue
              ELSE 0
            END
          ) AS google_revenue,
          SUM(CASE WHEN LOWER(platform) LIKE '%tiktok%' THEN spend ELSE 0 END) AS tiktok_spend,
          SUM(CASE WHEN LOWER(platform) LIKE '%tiktok%' THEN revenue ELSE 0 END) AS tiktok_revenue
        FROM fact_ads_daily
        WHERE workspace_id = ? AND date >= ? AND date <= ?
        GROUP BY date
      `,
    }),
  ])

  const rowsByDate = new Map<string, OverviewBucket>()

  for (const row of ordersResult.rows ?? []) {
    const date = String(row.date ?? "").trim()

    if (!date) {
      continue
    }

    rowsByDate.set(date, {
      ...(rowsByDate.get(date) ?? createEmptyOverviewBucket()),
      new_customers: toNumber(row.new_customers),
      order_revenue: toNumber(row.order_revenue),
      payment_fee_data_points: toNumber(row.payment_fee_data_points),
      payment_fees: toNumber(row.payment_fees),
      shipping_cost: toNumber(row.shipping_cost),
      shipping_data_points: toNumber(row.shipping_data_points),
      total_orders: toNumber(row.total_orders),
      total_refunded: toNumber(row.total_refunded),
      total_revenue: toNumber(row.total_revenue),
    })
  }

  for (const row of itemsResult.rows ?? []) {
    const date = String(row.date ?? "").trim()

    if (!date) {
      continue
    }

    rowsByDate.set(date, {
      ...(rowsByDate.get(date) ?? createEmptyOverviewBucket()),
      cogs: toNumber(row.cogs),
    })
  }

  for (const row of adsResult.rows ?? []) {
    const date = String(row.date ?? "").trim()

    if (!date) {
      continue
    }

    rowsByDate.set(date, {
      ...(rowsByDate.get(date) ?? createEmptyOverviewBucket()),
      google_revenue: toNumber(row.google_revenue),
      google_spend: toNumber(row.google_spend),
      meta_revenue: toNumber(row.meta_revenue),
      meta_spend: toNumber(row.meta_spend),
      tiktok_revenue: toNumber(row.tiktok_revenue),
      tiktok_spend: toNumber(row.tiktok_spend),
      total_spend: toNumber(row.total_spend),
    })
  }

  const statements = [...rowsByDate.entries()].map(([date, day]) => {
    const platformAttributedRevenue =
      day.meta_revenue + day.google_revenue + day.tiktok_revenue
    const returningCustomers = Math.max(day.total_orders - day.new_customers, 0)
    const grossProfit = calculateGrossProfit(day.total_revenue, day.cogs)

    return {
      args: [
        workspaceId,
        date,
        day.total_revenue,
        day.total_orders,
        calculateAov(day.total_revenue, day.total_orders),
        day.total_spend,
        calculateMer(day.total_revenue, day.total_spend),
        calculateBlendedRoas(platformAttributedRevenue, day.total_spend),
        day.new_customers,
        returningCustomers,
        day.cogs,
        grossProfit,
        calculateNetProfitAfterAds(grossProfit, day.total_spend),
        day.order_revenue,
        day.total_refunded,
        day.meta_spend,
        day.meta_revenue,
        day.google_spend,
        day.google_revenue,
        day.tiktok_spend,
        day.tiktok_revenue,
        day.shipping_cost,
        day.payment_fees,
        day.shipping_data_points,
        day.payment_fee_data_points,
        updatedAt,
      ],
      sql: `
        INSERT OR REPLACE INTO contract_daily_overview (
          workspace_id,
          date,
          total_revenue,
          total_orders,
          aov,
          total_spend,
          mer,
          blended_roas,
          new_customers,
          returning_customers,
          cogs,
          gross_profit,
          net_profit_after_ads,
          order_revenue,
          total_refunded,
          meta_spend,
          meta_revenue,
          google_spend,
          google_revenue,
          tiktok_spend,
          tiktok_revenue,
          shipping_cost,
          payment_fees,
          shipping_data_points,
          payment_fee_data_points,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    }
  })

  await executeStatements(client, statements)

  return statements.length
}
