import "server-only"

import { getTursoClient } from "@/lib/db/client"
import { clearQueryRowsCache, queryRows } from "@/lib/db/query"
import type {
  CostSettingsValues,
  NormalizedSkuCostRow,
  SkuCostSeedRow,
} from "@/lib/settings/costs"

const SQLITE_PARAM_LIMIT = 900

type QueryOptions = {
  cacheBuster?: string | null
  bypassCache?: boolean
}

type TableInfoRow = {
  name: string
}

function nowIsoTimestamp() {
  return new Date().toISOString()
}

function readString(value: unknown) {
  return String(value ?? "").trim()
}

function readNullableNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

function chunkRows<T>(rows: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize))
  }

  return chunks
}

function getChunkSize(columnCount: number) {
  return Math.max(1, Math.floor(SQLITE_PARAM_LIMIT / columnCount))
}

function parseSeedRow(row: Record<string, unknown>): SkuCostSeedRow {
  return {
    rowKey: readString(row.row_key),
    shopifyVariantId: readString(row.shopify_variant_id),
    sku: readString(row.sku),
    productTitle: readString(row.product_title),
    variantTitle: readString(row.variant_title),
    price: readNullableNumber(row.price),
    shopifyCost: readNullableNumber(row.shopify_cost),
  }
}

async function hasFactOrderItemsVariantIdColumn(options: QueryOptions = {}) {
  const rows = await queryRows<TableInfoRow>(
    `PRAGMA table_info(fact_order_items)`,
    [],
    {
      cacheBuster: options.cacheBuster,
      bypassCache: options.bypassCache,
    }
  )

  return rows.some(
    (row) =>
      String(row.name ?? "")
        .trim()
        .toLowerCase() === "variant_id"
  )
}

export async function listLatestInventorySkuSeedRows(
  workspaceId: string,
  options: QueryOptions = {}
) {
  const rows = await queryRows<Record<string, unknown>>(
    `
      WITH latest_snapshot AS (
        SELECT MAX(snapshot_date) AS snapshot_date
        FROM raw_shopify_inventory_levels
        WHERE workspace_id = ?
      ),
      inventory_rows AS (
        SELECT
          COALESCE(variant_id, '') AS shopify_variant_id,
          COALESCE(sku, '') AS sku,
          COALESCE(product_title, '') AS product_title,
          COALESCE(variant_title, '') AS variant_title,
          CASE WHEN price > 0 THEN price ELSE NULL END AS price
        FROM raw_shopify_inventory_levels
        WHERE workspace_id = ?
          AND snapshot_date = (SELECT snapshot_date FROM latest_snapshot)
      ),
      variant_costs AS (
        SELECT COALESCE(variant_id, '') AS variant_id, MAX(unit_cost) AS unit_cost
        FROM raw_shopify_line_items
        WHERE workspace_id = ?
          AND COALESCE(variant_id, '') <> ''
          AND unit_cost > 0
        GROUP BY variant_id
      ),
      sku_costs AS (
        SELECT COALESCE(sku, '') AS sku, MAX(unit_cost) AS unit_cost
        FROM raw_shopify_line_items
        WHERE workspace_id = ?
          AND COALESCE(sku, '') <> ''
          AND unit_cost > 0
        GROUP BY sku
      )
      SELECT
        CASE
          WHEN TRIM(inv.shopify_variant_id) <> '' THEN 'variant:' || LOWER(TRIM(inv.shopify_variant_id))
          WHEN TRIM(inv.sku) <> '' THEN 'sku:' || LOWER(TRIM(inv.sku))
          ELSE 'title:' || LOWER(TRIM(inv.product_title)) || '::' || LOWER(TRIM(inv.variant_title))
        END AS row_key,
        inv.shopify_variant_id,
        inv.sku,
        inv.product_title,
        inv.variant_title,
        inv.price,
        CASE
          WHEN vc.unit_cost > 0 THEN vc.unit_cost
          WHEN sc.unit_cost > 0 THEN sc.unit_cost
          ELSE NULL
        END AS shopify_cost
      FROM inventory_rows inv
      LEFT JOIN variant_costs vc
        ON LOWER(TRIM(vc.variant_id)) = LOWER(TRIM(inv.shopify_variant_id))
      LEFT JOIN sku_costs sc
        ON LOWER(TRIM(sc.sku)) = LOWER(TRIM(inv.sku))
      ORDER BY inv.product_title ASC, inv.variant_title ASC, inv.sku ASC
    `,
    [workspaceId, workspaceId, workspaceId, workspaceId],
    {
      cacheBuster: options.cacheBuster,
      bypassCache: options.bypassCache,
    }
  )

  return rows.map(parseSeedRow)
}

export async function listSoldSkuFallbackRows(
  workspaceId: string,
  options: QueryOptions = {}
) {
  const hasVariantId = await hasFactOrderItemsVariantIdColumn(options)
  const sql = hasVariantId
    ? `
        WITH ranked AS (
          SELECT
            CASE
              WHEN TRIM(COALESCE(variant_id, '')) <> '' THEN 'variant:' || LOWER(TRIM(variant_id))
              WHEN TRIM(COALESCE(sku, '')) <> '' THEN 'sku:' || LOWER(TRIM(sku))
              ELSE 'line:' || LOWER(TRIM(line_item_id))
            END AS row_key,
            COALESCE(variant_id, '') AS shopify_variant_id,
            COALESCE(sku, '') AS sku,
            COALESCE(product_name, '') AS product_title,
            COALESCE(variant_name, '') AS variant_title,
            CASE WHEN unit_price > 0 THEN unit_price ELSE NULL END AS price,
            CASE WHEN unit_cost > 0 THEN unit_cost ELSE NULL END AS shopify_cost,
            ROW_NUMBER() OVER (
              PARTITION BY
                CASE
                  WHEN TRIM(COALESCE(variant_id, '')) <> '' THEN 'variant:' || LOWER(TRIM(variant_id))
                  WHEN TRIM(COALESCE(sku, '')) <> '' THEN 'sku:' || LOWER(TRIM(sku))
                  ELSE 'line:' || LOWER(TRIM(line_item_id))
                END
              ORDER BY order_date DESC, line_item_id DESC
            ) AS rn
          FROM fact_order_items
          WHERE workspace_id = ?
            AND (
              TRIM(COALESCE(variant_id, '')) <> '' OR
              TRIM(COALESCE(sku, '')) <> ''
            )
        )
        SELECT row_key, shopify_variant_id, sku, product_title, variant_title, price, shopify_cost
        FROM ranked
        WHERE rn = 1
        ORDER BY product_title ASC, variant_title ASC, sku ASC
      `
    : `
        WITH ranked AS (
          SELECT
            CASE
              WHEN TRIM(COALESCE(sku, '')) <> '' THEN 'sku:' || LOWER(TRIM(sku))
              ELSE 'line:' || LOWER(TRIM(line_item_id))
            END AS row_key,
            '' AS shopify_variant_id,
            COALESCE(sku, '') AS sku,
            COALESCE(product_name, '') AS product_title,
            COALESCE(variant_name, '') AS variant_title,
            CASE WHEN unit_price > 0 THEN unit_price ELSE NULL END AS price,
            CASE WHEN unit_cost > 0 THEN unit_cost ELSE NULL END AS shopify_cost,
            ROW_NUMBER() OVER (
              PARTITION BY
                CASE
                  WHEN TRIM(COALESCE(sku, '')) <> '' THEN 'sku:' || LOWER(TRIM(sku))
                  ELSE 'line:' || LOWER(TRIM(line_item_id))
                END
              ORDER BY order_date DESC, line_item_id DESC
            ) AS rn
          FROM fact_order_items
          WHERE workspace_id = ?
            AND TRIM(COALESCE(sku, '')) <> ''
        )
        SELECT row_key, shopify_variant_id, sku, product_title, variant_title, price, shopify_cost
        FROM ranked
        WHERE rn = 1
        ORDER BY product_title ASC, variant_title ASC, sku ASC
      `
  const rows = await queryRows<Record<string, unknown>>(sql, [workspaceId], {
    cacheBuster: options.cacheBuster,
    bypassCache: options.bypassCache,
  })

  return rows.map(parseSeedRow)
}

export async function saveCostSettingsAndSkuCosts(input: {
  workspaceId: string
  settings: CostSettingsValues
  rows: NormalizedSkuCostRow[]
  updatedAt?: string
}) {
  const client = await getTursoClient()
  const updatedAt = input.updatedAt || nowIsoTimestamp()
  const rowColumns = [
    "workspace_id",
    "row_key",
    "shopify_variant_id",
    "sku",
    "product_title",
    "variant_title",
    "price",
    "shopify_cost",
    "override_unit_cost",
    "updated_at",
  ] as const
  const rowValues = input.rows.map((row) => [
    input.workspaceId,
    row.rowKey,
    row.shopifyVariantId,
    row.sku,
    row.productTitle,
    row.variantTitle,
    row.price,
    row.shopifyCost,
    row.overrideUnitCost,
    updatedAt,
  ])

  await client.execute({
    sql: "BEGIN",
    args: [],
  })

  try {
    await client.execute({
      sql: `
        INSERT INTO cost_settings (
          workspace_id,
          default_margin_pct,
          payment_fee_pct,
          shipping_pct,
          returns_allowance_pct,
          monthly_overhead,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id)
        DO UPDATE SET
          default_margin_pct = excluded.default_margin_pct,
          payment_fee_pct = excluded.payment_fee_pct,
          shipping_pct = excluded.shipping_pct,
          returns_allowance_pct = excluded.returns_allowance_pct,
          monthly_overhead = excluded.monthly_overhead,
          updated_at = excluded.updated_at
      `,
      args: [
        input.workspaceId,
        input.settings.defaultMarginPct,
        input.settings.paymentFeePct,
        input.settings.shippingPct,
        input.settings.returnsAllowancePct,
        input.settings.monthlyOverhead,
        updatedAt,
      ],
    })

    await client.execute({
      sql: `DELETE FROM sku_costs WHERE workspace_id = ?`,
      args: [input.workspaceId],
    })

    if (rowValues.length > 0) {
      const chunkSize = getChunkSize(rowColumns.length)

      for (const chunk of chunkRows(rowValues, chunkSize)) {
        const placeholders = chunk
          .map(() => `(${rowColumns.map(() => "?").join(", ")})`)
          .join(", ")

        await client.execute({
          sql: `
            INSERT INTO sku_costs (${rowColumns.join(", ")})
            VALUES ${placeholders}
          `,
          args: chunk.flat(),
        })
      }
    }

    await client.execute({
      sql: "COMMIT",
      args: [],
    })
  } catch (error) {
    await client
      .execute({
        sql: "ROLLBACK",
        args: [],
      })
      .catch(() => undefined)

    throw error
  } finally {
    clearQueryRowsCache()
  }

  return updatedAt
}
