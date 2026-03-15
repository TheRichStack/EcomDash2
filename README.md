# EcomDash2 App

EcomDash2 is a standalone Next.js reporting app for ecommerce performance, profit, pacing, and operating inputs.

Package identity:

- app name: `EcomDash2 App`
- package name: `ecomdash2-app`

Current standalone posture:

- the app runtime is self-contained
- the job runners and connectors are app-owned
- CI and scheduler workflows are app-owned
- the app still points at the shared Turso database and shared keep-boundary tables by design

If this folder is moved into its own repository, this `README.md` should remain the root project guide.

## What is already standalone

- EcomDash2 resolves runtime dependencies from its own package install
- runtime code does not import sibling app code
- the Settings full metrics catalog lives under `lib/metrics/definitions`
- keep-boundary migrations live under `lib/db/migrations`
- jobs, connectors, workflows, and CI are owned from this app

Still intentionally shared for now:

- the Turso database
- shared raw, report, contract, and status tables
- shared reporting and business-input tables
- broader connector validation on the shared runtime

Optional later phase:

- dedicated database provisioning and cutover

See [runtime-setup.md](docs/ecomdash2/runtime-setup.md), [backend-boundary.md](docs/ecomdash2/backend-boundary.md), [job-runtime-layout.md](docs/ecomdash2/job-runtime-layout.md), and [post-extraction-checklist.md](docs/ecomdash2/post-extraction-checklist.md).

## Running the app

If this folder still lives inside the parent `EcomDash` repo, run commands from `EcomDash2/TRS_Starter_Core`.

If this folder has already been extracted into its own repo, run commands from the repo root.

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example`.

3. Set at least these variables for real data:

- `ECOMDASH2_TURSO_URL`
- `ECOMDASH2_TURSO_AUTH_TOKEN`
- `ECOMDASH2_DEFAULT_WORKSPACE_ID`

4. Start the app:

```bash
npm run dev
```

5. Verify before handoff:

```bash
npm run lint
npm run typecheck
npm run build
```

## Standalone job runners

Run these from the app root:

```bash
npm run jobs:hourly
npm run jobs:backfill -- --from=2025-01-01 --to=2025-01-31 --source=shopify
npm run jobs:reconcile
npm run jobs:contracts:refresh -- --from=2025-01-01 --to=2025-01-31
```

These entrypoints are app-owned and execute TypeScript runner modules under `lib/jobs/**` through `tsx`.

Owned workflow inventory:

- `ecomdash2-ci.yml` for lint, typecheck, and build
- `ecomdash2-hourly-sync.yml`
- `ecomdash2-daily-reconcile.yml`
- `ecomdash2-backfill.yml`
- `ecomdash2-contract-refresh.yml`

If you extract the app into its own repo, copy those workflow files into the new repo's `.github/workflows/` folder and change `working-directory` from `EcomDash2/TRS_Starter_Core` to `.`. See [docs/ecomdash2/post-extraction-checklist.md](docs/ecomdash2/post-extraction-checklist.md) and [docs/ecomdash2/job-ops.md](docs/ecomdash2/job-ops.md).

Recommended extraction target:

- create a fresh Git repository for EcomDash2
- create a fresh Vercel project for that new repository
- keep the shared Turso database for now

## Environment contract

Preferred env names are the `ECOMDASH2_*` variables listed in `.env.example`.

Compatibility aliases are still accepted for shared local setups:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `WORKSPACE_ID_DEFAULT`
- `NEXT_PUBLIC_CURRENCY`

`ECOMDASH2_BACKEND_SOURCE` is currently locked to `turso`.

Current recommended data posture:

- keep using the shared Turso database after extraction
- do not create a dedicated DB unless you choose to start the optional data-isolation phase later

## Main routes

- `/dashboard`
- `/dashboard/paid-media`
- `/dashboard/shopify/profit`
- `/dashboard/shopify/products`
- `/dashboard/shopify/inventory`
- `/dashboard/shopify/funnel`
- `/dashboard/email`
- `/dashboard/settings`
- `/preview/dashboard-patterns`

## Docs

- [docs/ecomdash2/README.md](docs/ecomdash2/README.md)
- [docs/ecomdash2/rebuild-plan.md](docs/ecomdash2/rebuild-plan.md)
- [docs/ecomdash2/backend-boundary.md](docs/ecomdash2/backend-boundary.md)
- [docs/ecomdash2/schema-ownership.md](docs/ecomdash2/schema-ownership.md)
- [docs/ecomdash2/dedicated-db-bootstrap.md](docs/ecomdash2/dedicated-db-bootstrap.md)
- [docs/ecomdash2/post-extraction-checklist.md](docs/ecomdash2/post-extraction-checklist.md)
- [docs/ecomdash2/runtime-setup.md](docs/ecomdash2/runtime-setup.md)
- [docs/ecomdash2/job-runtime-layout.md](docs/ecomdash2/job-runtime-layout.md)
- [docs/ecomdash2/job-ops.md](docs/ecomdash2/job-ops.md)
- [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)

## What is left

- immediate next step:
  - extract the app into its own repo if you want repo separation now
- after extraction:
  - keep the shared Turso database
  - use a fresh Git repo and a fresh Vercel project for EcomDash2
  - move the EcomDash2 workflow files
  - update workflow `working-directory`
  - run lint, typecheck, build, and safe smoke jobs
- optional later work:
  - dedicated database provisioning, data copy, validation, and cutover
- still recommended:
  - broader live connector validation for some sources and workspaces
