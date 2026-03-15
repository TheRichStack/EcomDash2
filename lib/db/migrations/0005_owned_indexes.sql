-- EcomDash2-owned baseline indexes for the keep-boundary subset.

CREATE INDEX IF NOT EXISTS idx_job_runs_workspace_started
  ON job_runs (workspace_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_backfill_runs_workspace_started
  ON backfill_runs (workspace_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sku_costs_ws_variant
  ON sku_costs (workspace_id, shopify_variant_id);

CREATE INDEX IF NOT EXISTS idx_sku_costs_ws_sku
  ON sku_costs (workspace_id, sku);

CREATE INDEX IF NOT EXISTS idx_budget_history_lookup
  ON budget_history (workspace_id, platform, campaign_id, effective_date);

CREATE INDEX IF NOT EXISTS idx_fact_ads_daily_ws_date
  ON fact_ads_daily (workspace_id, date);

CREATE INDEX IF NOT EXISTS idx_fact_ads_daily_ws_date_platform
  ON fact_ads_daily (workspace_id, date, platform);

CREATE INDEX IF NOT EXISTS idx_fact_ads_segments_ws_date
  ON fact_ads_segments_daily (workspace_id, date);

CREATE INDEX IF NOT EXISTS idx_fact_orders_ws_order_date
  ON fact_orders (workspace_id, order_date);

CREATE INDEX IF NOT EXISTS idx_fact_order_items_ws_order_date
  ON fact_order_items (workspace_id, order_date);

CREATE INDEX IF NOT EXISTS idx_raw_inventory_ws_snapshot
  ON raw_shopify_inventory_levels (workspace_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_raw_shopify_analytics_breakdowns_ws_date_dim_metric
  ON raw_shopify_analytics_breakdowns (workspace_id, end_date, dimension, metric);

CREATE INDEX IF NOT EXISTS raw_ga4_product_funnel_ws_date
  ON raw_ga4_product_funnel (workspace_id, start_date);

CREATE INDEX IF NOT EXISTS idx_contract_overview_ws_date
  ON contract_daily_overview (workspace_id, date);

CREATE INDEX IF NOT EXISTS idx_contract_channel_ws_date
  ON contract_daily_channel_campaign (workspace_id, date);

CREATE INDEX IF NOT EXISTS idx_contract_creative_ws_date
  ON contract_creative_performance (workspace_id, date);
