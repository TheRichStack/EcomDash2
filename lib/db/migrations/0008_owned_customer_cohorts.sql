CREATE TABLE IF NOT EXISTS contract_customer_cohorts (
  workspace_id TEXT NOT NULL,
  cohort_month TEXT NOT NULL,
  months_since_acquisition INTEGER NOT NULL,
  new_customers INTEGER NOT NULL DEFAULT 0,
  returning_orders INTEGER NOT NULL DEFAULT 0,
  returning_revenue REAL NOT NULL DEFAULT 0,
  total_revenue REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, cohort_month, months_since_acquisition)
);

CREATE INDEX IF NOT EXISTS idx_contract_customer_cohorts_workspace_cohort
  ON contract_customer_cohorts (workspace_id, cohort_month ASC);
