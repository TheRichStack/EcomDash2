# Job Modules

This folder owns reusable standalone-job code for EcomDash2.

What belongs here:

- runner orchestration
- runtime helpers
- status-write helpers
- contract refresh modules

What does not belong here:

- dashboard route code
- UI components
- GitHub workflow files
- V1 imports from `dashboard/**`

Current runtime surface:

- `runtime/**` for CLI/env/db helpers
- `status/**` for `job_runs`, `backfill_runs`, and `sync_state`
- `contracts/**` for contract refresh modules
- `runners/**` for hourly, backfill, reconcile, and contract-refresh orchestration
