-- EcomDash2-owned baseline schema: system, settings, and editable inputs.
-- Ported from the V1 keep-boundary subset, not copied as a full repo schema dump.

CREATE TABLE IF NOT EXISTS config_entries (
  workspace_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, setting_key)
);

CREATE TABLE IF NOT EXISTS targets_entries (
  workspace_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, setting_key)
);

CREATE TABLE IF NOT EXISTS budget_targets_meta (
  workspace_id TEXT NOT NULL PRIMARY KEY,
  validation_status TEXT NOT NULL DEFAULT '',
  last_applied_at TEXT NOT NULL DEFAULT '',
  last_run_at TEXT NOT NULL DEFAULT '',
  last_run_result TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS targets_canonical_ranges (
  workspace_id TEXT NOT NULL,
  range_id TEXT NOT NULL,
  range_type TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  revenue_target REAL NOT NULL DEFAULT 0,
  ad_budget REAL NOT NULL DEFAULT 0,
  profit_target REAL NOT NULL DEFAULT 0,
  target_mer REAL NOT NULL DEFAULT 0,
  target_ad_cost_pct REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  source_sheet TEXT NOT NULL DEFAULT '',
  source_row INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, range_id)
);

CREATE TABLE IF NOT EXISTS targets_effective_daily (
  workspace_id TEXT NOT NULL,
  date TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  revenue_target REAL NOT NULL DEFAULT 0,
  ad_budget REAL NOT NULL DEFAULT 0,
  profit_target REAL NOT NULL DEFAULT 0,
  target_mer REAL NOT NULL DEFAULT 0,
  target_ad_cost_pct REAL NOT NULL DEFAULT 0,
  applied_range_ids TEXT NOT NULL DEFAULT '',
  mode_revenue TEXT NOT NULL DEFAULT '',
  mode_ad_budget TEXT NOT NULL DEFAULT '',
  mode_profit TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, date)
);

CREATE TABLE IF NOT EXISTS targets_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL DEFAULT '',
  source_row INTEGER NOT NULL DEFAULT 0,
  field TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings_tokens_encrypted (
  workspace_id TEXT NOT NULL,
  token_key TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, token_key)
);

CREATE TABLE IF NOT EXISTS sync_state (
  workspace_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  state_key TEXT NOT NULL,
  state_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, source_key, state_key)
);

CREATE TABLE IF NOT EXISTS job_runs (
  run_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS backfill_runs (
  run_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT '',
  cursor_date TEXT NOT NULL DEFAULT '',
  source_key TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS cost_settings (
  workspace_id TEXT NOT NULL PRIMARY KEY,
  default_margin_pct REAL NOT NULL DEFAULT 0,
  payment_fee_pct REAL NOT NULL DEFAULT 0,
  shipping_pct REAL NOT NULL DEFAULT 0,
  returns_allowance_pct REAL NOT NULL DEFAULT 0,
  monthly_overhead REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sku_costs (
  workspace_id TEXT NOT NULL,
  row_key TEXT NOT NULL,
  shopify_variant_id TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  product_title TEXT NOT NULL DEFAULT '',
  variant_title TEXT NOT NULL DEFAULT '',
  price REAL,
  shopify_cost REAL,
  override_unit_cost REAL,
  updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, row_key)
);

CREATE TABLE IF NOT EXISTS budget_plan_monthly (
  workspace_id TEXT NOT NULL,
  month TEXT NOT NULL,
  channel TEXT NOT NULL,
  budget REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, month, channel)
);
