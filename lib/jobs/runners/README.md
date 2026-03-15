# Job Runners

This folder will hold the reusable orchestration modules behind the CLI entrypoints in `scripts/jobs/**`.

Current first-wave runner modules:

- `hourly.ts`
- `backfill.ts`
- `reconcile.ts`
- `contracts-refresh.ts`

These modules coordinate runtime helpers, status writes, connectors, and contract refresh without embedding CLI-only concerns.
