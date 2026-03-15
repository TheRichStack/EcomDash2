# Dedicated DB Scripts

This folder holds the app-owned bootstrap tooling for the later dedicated-database move.

Current scripts:

- `apply-migrations.ts`
  - applies `lib/db/migrations/*.sql` to a target Turso/libSQL database
  - intended for a fresh dedicated DB bootstrap, not a live cutover
- `copy-seed-plan.ts`
  - prints the ordered copy/seed plan for the owned schema subset
  - can also emit the plan as JSON for operator review

Run from `EcomDash2/TRS_Starter_Core`.

Recommended commands:

```bash
npm run db:migrate:apply -- --dry-run
npm run db:migrate:apply
npm run db:copy:plan -- --workspace=default
npm run db:copy:plan -- --workspace=default --format=json
```

Script env model:

- target DB:
  - `ECOMDASH2_TARGET_TURSO_URL`
  - `ECOMDASH2_TARGET_TURSO_AUTH_TOKEN`
- source DB for copy planning:
  - `ECOMDASH2_SOURCE_TURSO_URL`
  - `ECOMDASH2_SOURCE_TURSO_AUTH_TOKEN`

Source env falls back to the current shared runtime DB env:

- `ECOMDASH2_TURSO_URL`
- `ECOMDASH2_TURSO_AUTH_TOKEN`

These scripts do not perform the final cutover. They make the apply order, copy order, and remaining manual steps explicit for the next pass.
