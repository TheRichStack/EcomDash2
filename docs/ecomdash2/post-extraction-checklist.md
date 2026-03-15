# Post-Extraction Checklist

Use this after moving `EcomDash2/TRS_Starter_Core` into its own repository.

Goal:

- run EcomDash2 as its own repo
- use a fresh Git repository and a fresh Vercel project for EcomDash2
- keep using the shared Turso database
- avoid mixing repo extraction with dedicated-db work

## 1. Create the new Git repo and move the app

- create a fresh Git repository for EcomDash2
- copy or move the full contents of `EcomDash2/TRS_Starter_Core`
- make that folder the new repo root

- keep the existing structure under that root:
  - `app/`
  - `components/`
  - `lib/`
  - `docs/`
  - `scripts/`
  - `.env.example`
  - `package.json`

## 2. Create a fresh Vercel project

- create a new Vercel project for the new EcomDash2 repository
- do not reuse the parent repo's Vercel project
- configure the new project to build from the repo root
- keep using the shared Turso environment values in that new project

Reason:

- cleaner deployment ownership
- no nested-path build assumptions
- clearer env and domain management

## 3. Move the workflow files

Copy these files into the new repo's `.github/workflows/`:

- `ecomdash2-ci.yml`
- `ecomdash2-hourly-sync.yml`
- `ecomdash2-daily-reconcile.yml`
- `ecomdash2-backfill.yml`
- `ecomdash2-contract-refresh.yml`

Then update each workflow:

- change `working-directory: EcomDash2/TRS_Starter_Core`
- to `working-directory: .`

Do not change the actual job commands in this pass.

## 4. Install dependencies

From the new repo root:

```bash
npm install
```

## 5. Set local env

Create `.env.local` from `.env.example`.

Keep using the shared Turso database for now.

Minimum required vars:

- `ECOMDASH2_TURSO_URL`
- `ECOMDASH2_TURSO_AUTH_TOKEN`
- `ECOMDASH2_DEFAULT_WORKSPACE_ID`

Recommended:

- keep `ECOMDASH2_BACKEND_SOURCE=turso`
- leave `CONNECTOR_SUPPORT_TABLES` unset so the default runtime stays dedicated-DB-safe

## 6. Set GitHub and Vercel secrets

At minimum, configure:

- `ECOMDASH2_DEFAULT_WORKSPACE_ID`
- `ECOMDASH2_TURSO_URL`
- `ECOMDASH2_TURSO_AUTH_TOKEN`
- `DATA_ENCRYPTION_KEY`

Then add connector credentials for the sources you actually intend to run.

Apply the same runtime env set to:

- the new GitHub repo secrets
- the new Vercel project env vars

Reference:

- `runtime-setup.md`
- `job-ops.md`

## 7. Verify the app

From the new repo root:

```bash
npm run lint
npm run typecheck
npm run build
```

Then start the app:

```bash
npm run dev
```

## 8. Run safe smoke checks

Start with the safest checks first:

```bash
npm run jobs:contracts:refresh -- --from=2026-03-01 --to=2026-03-02
npm run jobs:hourly -- --only-contracts
```

Then, if credentials are present and the workspace is safe, run a bounded connector check.

Suggested sequence:

1. contract refresh
2. hourly sync with `--only-contracts`
3. one bounded connector run
4. one manual reconcile

Verify:

- `job_runs` is updating
- `backfill_runs` is updating for backfills
- `sync_state` is updating
- dashboard pages still load against the shared DB

## 9. Keep the data posture simple

After extraction, the intended state is:

- standalone repo
- fresh Vercel project
- shared Turso database

Do not create a dedicated DB just because the repo moved.

Dedicated-db work is optional later.

If you decide to do it, start with:

- `schema-ownership.md`
- `dedicated-db-bootstrap.md`

## 10. What still remains after extraction

Expected remaining follow-up:

- broader live connector validation for some sources and workspaces
- optional dedicated-db work later

Extraction itself should not change:

- dashboard behavior
- reporting logic
- shared-DB usage
