# Dedicated DB Bootstrap Notes

This folder holds the bootstrap plan for the later dedicated-database pass.

What exists now:

- app-owned migrations under `lib/db/migrations/**`
- a documented ownership boundary in `docs/ecomdash2/schema-ownership.md`
- bootstrap config and copy-plan metadata under `lib/db/bootstrap/*.ts`
- app-owned bootstrap scripts under `scripts/db/**`
- a dedicated cutover plan in `docs/ecomdash2/dedicated-db-bootstrap.md`

What does not exist yet:

- a dedicated Turso/libSQL database
- final production cutover execution

Recommended future bootstrap sequence:

1. Provision an empty EcomDash2 Turso/libSQL database.
2. Apply every file in `lib/db/migrations/` in filename order through `scripts/db/apply-migrations.ts`.
3. Generate the copy manifest through `scripts/db/copy-seed-plan.ts`.
4. Copy the owned shared-now tables from the current shared database.
5. Run bounded contract refresh and freshness checks.
6. Switch `ECOMDASH2_TURSO_URL` and `ECOMDASH2_TURSO_AUTH_TOKEN` only after validation passes.

Recommended copy order:

1. Config, targets, and secrets.
2. Costs, budgets, and status rows.
3. Raw tables and `budget_history`.
4. Fact, report, dimension, and contract tables.

Cutover risks already known:

- current shared-db connector specs still mention a few out-of-scope compatibility tables
- those writes must be removed or gated before jobs point at a dedicated EcomDash2 database
