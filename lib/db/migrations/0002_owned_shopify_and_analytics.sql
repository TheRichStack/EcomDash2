-- EcomDash2-owned baseline schema: Shopify raw tables and funnel support.

CREATE TABLE IF NOT EXISTS raw_shopify_orders (
  workspace_id TEXT NOT NULL,
  _synced_at TEXT NOT NULL DEFAULT '',
  order_id TEXT NOT NULL,
  order_number TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  financial_status TEXT NOT NULL DEFAULT '',
  fulfillment_status TEXT NOT NULL DEFAULT '',
  total_price REAL NOT NULL DEFAULT 0,
  subtotal_price REAL NOT NULL DEFAULT 0,
  total_tax REAL NOT NULL DEFAULT 0,
  total_discounts REAL NOT NULL DEFAULT 0,
  total_refunded REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT '',
  customer_id TEXT NOT NULL DEFAULT '',
  billing_country TEXT NOT NULL DEFAULT '',
  shipping_country TEXT NOT NULL DEFAULT '',
  source_name TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  discount_codes TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  total_shipping_charged REAL NOT NULL DEFAULT 0,
  total_payment_fees REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, order_id)
);

CREATE TABLE IF NOT EXISTS raw_shopify_line_items (
  workspace_id TEXT NOT NULL,
  _synced_at TEXT NOT NULL DEFAULT '',
  line_item_id TEXT NOT NULL,
  order_id TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  variant_id TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  variant_title TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL DEFAULT 0,
  price REAL NOT NULL DEFAULT 0,
  total_discount REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  inventory_item_id TEXT NOT NULL DEFAULT '',
  unit_cost REAL NOT NULL DEFAULT 0,
  refunded_quantity REAL NOT NULL DEFAULT 0,
  refund_subtotal REAL NOT NULL DEFAULT 0,
  refund_tax REAL NOT NULL DEFAULT 0,
  refund_total REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, line_item_id)
);

CREATE TABLE IF NOT EXISTS raw_shopify_inventory_levels (
  workspace_id TEXT NOT NULL,
  _synced_at TEXT NOT NULL DEFAULT '',
  snapshot_date TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  product_title TEXT NOT NULL DEFAULT '',
  product_status TEXT NOT NULL DEFAULT '',
  product_type TEXT NOT NULL DEFAULT '',
  vendor TEXT NOT NULL DEFAULT '',
  handle TEXT NOT NULL DEFAULT '',
  variant_id TEXT NOT NULL DEFAULT '',
  variant_title TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  inventory_item_id TEXT NOT NULL DEFAULT '',
  tracked TEXT NOT NULL DEFAULT '',
  inventory_policy TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  compare_at_price REAL NOT NULL DEFAULT 0,
  available_quantity REAL NOT NULL DEFAULT 0,
  location_count REAL NOT NULL DEFAULT 0,
  locations_json TEXT NOT NULL DEFAULT '',
  product_published_at TEXT NOT NULL DEFAULT '',
  product_created_at TEXT NOT NULL DEFAULT '',
  product_updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, snapshot_date, variant_id)
);

CREATE TABLE IF NOT EXISTS raw_shopify_analytics_daily (
  workspace_id TEXT NOT NULL,
  _synced_at TEXT NOT NULL DEFAULT '',
  dataset TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL DEFAULT '',
  value_num REAL NOT NULL DEFAULT 0,
  data_type TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  query TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, dataset, date, metric)
);

CREATE TABLE IF NOT EXISTS raw_shopify_analytics_totals (
  workspace_id TEXT NOT NULL,
  _synced_at TEXT NOT NULL DEFAULT '',
  dataset TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL DEFAULT '',
  value_num REAL NOT NULL DEFAULT 0,
  data_type TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  query TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, dataset, start_date, end_date, metric)
);

CREATE TABLE IF NOT EXISTS raw_shopify_analytics_breakdowns (
  workspace_id TEXT NOT NULL,
  _synced_at TEXT NOT NULL DEFAULT '',
  dataset TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  breakdown_id TEXT NOT NULL DEFAULT '',
  dimension TEXT NOT NULL DEFAULT '',
  dimension_value TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL DEFAULT '',
  value_num REAL NOT NULL DEFAULT 0,
  data_type TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  query TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (
    workspace_id,
    dataset,
    start_date,
    end_date,
    breakdown_id,
    dimension,
    dimension_value,
    metric
  )
);

CREATE TABLE IF NOT EXISTS raw_ga4_product_funnel (
  workspace_id TEXT NOT NULL,
  _synced_at TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  item_id TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 0,
  add_to_carts INTEGER NOT NULL DEFAULT 0,
  checkouts INTEGER NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0,
  view_to_atc_rate REAL NOT NULL DEFAULT 0,
  atc_to_checkout_rate REAL NOT NULL DEFAULT 0,
  checkout_to_purchase_rate REAL NOT NULL DEFAULT 0,
  view_to_purchase_rate REAL NOT NULL DEFAULT 0,
  query TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, start_date, end_date, item_id)
);
