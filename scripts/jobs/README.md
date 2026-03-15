# Job Entrypoints

This folder is for thin CLI entry scripts only.

What belongs here:

- one executable file per standalone job
- argument parsing and process-exit handling
- a single call into `lib/jobs/runners/**`

What does not belong here:

- connector implementations
- job status SQL
- contract refresh logic
- GitHub workflow setup

Current entrypoints:

- `hourly.ts`
- `backfill.ts`
- `reconcile.ts`
- `contracts-refresh.ts`

Each file stays thin and delegates execution into `lib/jobs/runners/**`.
