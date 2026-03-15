# Job Status Helpers

This folder will own app-owned writes to the shared job metadata tables:

- `job_runs`
- `backfill_runs`
- `sync_state`

Rule:

- runners call into this layer
- connectors return structured results instead of writing status rows directly

Current helpers include:

- job run start/finish
- backfill run create/find/update
- sync-state read/upsert
