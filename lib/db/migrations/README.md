# EcomDash2-Owned Migrations

This folder is now the schema source of truth for the EcomDash2 keep-boundary subset.

Current migration set:

- `0001_owned_system_and_inputs.sql`
- `0002_owned_shopify_and_analytics.sql`
- `0003_owned_marketing_raw.sql`
- `0004_owned_facts_reports_contracts.sql`
- `0005_owned_indexes.sql`

What this set is:

- a baseline snapshot split by table family
- ported from the relevant V1 schema subset
- intentionally limited to the tables EcomDash2 plans to own in a future dedicated database

What this set is not:

- a replay of every V1 migration file
- a full-schema copy of the parent repo
- a migration runner or database provisioner

Rules for future files:

1. Apply files in lexical order.
2. Treat the current files as the fresh-database baseline.
3. Add later changes as incremental files named `0006_*`, `0007_*`, and so on.
4. Only add tables here if they remain inside the EcomDash2 keep boundary documented in `docs/ecomdash2/schema-ownership.md`.
5. Do not add Defer or Cut tables without updating the boundary docs first.
