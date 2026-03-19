# EcomDash2 Runtime Setup

This doc describes the runtime contract for EcomDash2 during the shared-DB standalone phase.

## What extraction-ready means in this phase

Repo-extraction-ready currently means:

- runtime code runs from the EcomDash2 app root only
- runtime code does not import from or read files under sibling `dashboard/**`
- app-owned dependencies, including `@libsql/client`, are resolved from the EcomDash2 package itself
- the full Settings metrics catalog lives under EcomDash2-owned files
- the keep-boundary migration source now lives under `lib/db/migrations/**`

It does not yet mean full infrastructure separation.

EcomDash2 still shares the live Turso database and the keep-boundary tables documented in [backend-boundary.md](backend-boundary.md).

## Required env vars

Preferred variables:

- `ECOMDASH2_TURSO_URL`: Turso/libSQL database URL for the shared EcomDash dataset.
- `ECOMDASH2_TURSO_AUTH_TOKEN`: Turso auth token for the same database.
- `ECOMDASH2_BACKEND_SOURCE`: keep this as `turso`.
- `ECOMDASH2_DEFAULT_CURRENCY`: default currency label used in formatting fallback. Defaults to `GBP`.
- `ECOMDASH2_DB_DEFAULT_LIMIT`: fallback row limit for generic DB table reads. Defaults to `25000`.
- `ECOMDASH2_DEFAULT_WORKSPACE_ID`: default workspace when no explicit selection is present.
- `ECOMDASH2_DEFAULT_WORKSPACE_LABEL`: label for that default workspace.
- `ECOMDASH2_WORKSPACE_OPTIONS`: comma-separated `id:label` list used by the local workspace selector.
- `ECOMDASH2_SESSION_USER_ID`: local session stub user id.
- `ECOMDASH2_SESSION_EMAIL`: local session stub email.
- `NEXT_PUBLIC_APP_NAME`: browser-visible app name. Defaults to `EcomDash2`.
- `NEXT_PUBLIC_APP_URL`: local app URL. Defaults to `http://localhost:3000`.

Compatibility aliases still accepted by `lib/env.ts`:

- `TURSO_DATABASE_URL` for `ECOMDASH2_TURSO_URL`
- `TURSO_AUTH_TOKEN` for `ECOMDASH2_TURSO_AUTH_TOKEN`
- `WORKSPACE_ID_DEFAULT` for `ECOMDASH2_DEFAULT_WORKSPACE_ID`
- `NEXT_PUBLIC_CURRENCY` for `ECOMDASH2_DEFAULT_CURRENCY`

## Local setup

Run commands from the EcomDash2 app root.

In the current parent repo that means `EcomDash2/TRS_Starter_Core`.

After extraction it means the standalone repo root.

1. Install dependencies with `npm install`.
2. Create `.env.local` from `.env.example`.
3. Fill in Turso credentials and workspace defaults for the dataset you want to inspect.
4. Start the app with `npm run dev`.
5. Run `npm run lint` and `npm run typecheck` before handing work back.

## Standalone jobs

The first app-owned standalone runners now execute through `tsx` from the EcomDash2 package root.

Available commands:

- `npm run jobs:hourly`
- `npm run jobs:backfill -- --from=YYYY-MM-DD --to=YYYY-MM-DD --source=shopify`
- `npm run jobs:reconcile`
- `npm run jobs:contracts:refresh -- --from=YYYY-MM-DD --to=YYYY-MM-DD`

Reason:

- the job entrypoints live in `scripts/jobs/**` as TypeScript and stay thin over `lib/jobs/**`
- `tsx` is the minimal runtime dependency needed to execute those entrypoints without introducing a separate JS-only job tree

### Connector env keys

First-wave direct connector ports now read these app-owned env or settings-backed keys:

- Shopify:
  - required: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ACCESS_TOKEN`
  - optional: `SHOPIFY_API_VERSION`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_SYNC_INVENTORY`
  - note: `SHOPIFY_SYNC_INVENTORY` now defaults to enabled in the EcomDash2-owned port
- Meta:
  - required: `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`
  - optional: `META_API_VERSION`, `META_SYNC_CREATIVES`
- TikTok:
  - required: `TIKTOK_ACCESS_TOKEN`, `TIKTOK_ADVERTISER_ID`
  - optional: `TIKTOK_API_VERSION`
- Google:
  - default mode: direct API
  - required for direct mode:
    - `GOOGLE_ADS_CUSTOMER_ID`
    - `GOOGLE_ADS_DEVELOPER_TOKEN`
    - `GOOGLE_ADS_CLIENT_ID`
    - `GOOGLE_ADS_CLIENT_SECRET`
    - `GOOGLE_ADS_REFRESH_TOKEN`
  - optional:
    - `GOOGLE_ADS_LOGIN_CUSTOMER_ID`
    - `GOOGLE_ADS_API_VERSION`
  - explicit compatibility fallback only:
    - set `GOOGLE_ADS_TRANSPORT=bridge` to rebuild keep-boundary Google tables from existing `raw_google_ads_daily` rows instead of calling Google directly
  - note: bridge mode is secondary and does not make `raw_google_ads_entity_inventory` or `ads_entity_snapshot` part of the EcomDash2 runtime contract
- Klaviyo:
  - required: `KLAVIYO_PRIVATE_API_KEY`
  - optional: `KLAVIYO_API_VERSION`, `KLAVIYO_REPORT_DELAY_MS`, `KLAVIYO_CONVERSION_METRIC_ID`, `KLAVIYO_SYNC_FLOWS`
  - note: `KLAVIYO_SYNC_FLOWS` now defaults to enabled in the EcomDash2-owned port
- GA4:
  - required: `GA4_PROPERTY_ID`
  - auth via one of:
    - `GA4_CREDENTIALS_JSON`
    - `GA4_CLIENT_EMAIL` plus `GA4_PRIVATE_KEY`
    - `GA4_REFRESH_TOKEN` plus `GA4_CLIENT_ID` and `GA4_CLIENT_SECRET`
  - compatibility aliases still accepted for the refresh-token client pair:
    - `GOOGLE_ADS_CLIENT_ID`
    - `GOOGLE_ADS_CLIENT_SECRET`

These keys can come from deployment env or workspace-scoped settings hydration through `config_entries` and `settings_tokens_encrypted`, using the precedence rules documented in [job-runtime-layout.md](job-runtime-layout.md).

### Support-table compatibility mode

Default runtime behavior is now dedicated-DB-safe for excluded support tables.

- default:
  - leave `CONNECTOR_SUPPORT_TABLES` unset
  - or set `CONNECTOR_SUPPORT_TABLES=owned`
  - result: no writes to:
    - `raw_shopify_markets`
    - `raw_shopify_analytics_catalog`
    - `raw_shopify_analytics_dimensions_catalog`
    - `ads_entity_snapshot`
- explicit shared-db compatibility only:
  - set `CONNECTOR_SUPPORT_TABLES=shared`
  - result: re-enable those support-table writes while still targeting the shared DB

Current runtime note:

- Shopify gates `raw_shopify_markets`
- GA4 gates `raw_shopify_analytics_catalog` and `raw_shopify_analytics_dimensions_catalog`
- Meta gates `ads_entity_snapshot`
- Google direct and bridge paths already stay on keep-boundary tables and do not write `ads_entity_snapshot` in the current EcomDash2 runtime

### GitHub Actions workflows

The repo-owned scheduler/workflow files now live under `.github/workflows/` and call the same EcomDash2 package scripts:

- `ecomdash2-hourly-sync.yml`
- `ecomdash2-daily-reconcile.yml`
- `ecomdash2-backfill.yml`
- `ecomdash2-contract-refresh.yml`

Workflow defaults:

- `SETTINGS_ENV_HYDRATE=1`
- `SETTINGS_ENV_MODE=fallback`
- `CONNECTOR_STRICT=1`
- `CONNECTORS_ENABLED=shopify,meta,google,tiktok,klaviyo,ga4` for hourly, reconcile, and backfill
- `CONNECTOR_SUPPORT_TABLES` is intentionally unset in the committed workflows so the default path stays dedicated-DB-safe

Base GitHub repository secrets required for all workflows:

- `ECOMDASH2_DEFAULT_WORKSPACE_ID`
- `ECOMDASH2_TURSO_URL`
- `ECOMDASH2_TURSO_AUTH_TOKEN`
- `DATA_ENCRYPTION_KEY`

Connector credentials may be provided either as GitHub repository secrets or as workspace-backed settings rows for the resolved workspace. See [job-ops.md](job-ops.md) for the exact workflow inventory, connector-key matrix, and smoke-check guidance.

After repo extraction:

- copy the `ecomdash2-*.yml` workflow files into the new repo's `.github/workflows/`
- change each workflow `working-directory` from `EcomDash2/TRS_Starter_Core` to `.`
- keep the existing shared Turso secrets unless and until a dedicated DB is introduced

## Local data wiring

Current runtime behavior:

- `lib/db/client.ts` creates the Turso client from the EcomDash2 package's own `@libsql/client` dependency.
- EcomDash2 server loaders query the shared Turso database directly through app-owned query adapters under `lib/**`.
- Settings loads two separate metric sources:
  - the runtime registry from `lib/metrics/registry.ts`
  - the full read-only catalog from `lib/metrics/definitions/*.json` through `lib/metrics/catalog-source.ts`

The full catalog is intentionally app-owned now. It is a copied reference dataset, not a runtime read from `dashboard/lib/metrics/definitions`.

## Shared database and job assumptions

Still intentionally shared in this repo phase:

- the Turso database and its allowed EcomDash2 table subset
- connector-populated raw tables
- contract/report tables
- sync metadata tables such as `sync_state`, `job_runs`, and `backfill_runs`
- business-input tables such as costs, budgets, and targets

Not allowed anymore at runtime:

- imports from sibling `dashboard/**` runtime modules
- filesystem reads from sibling `dashboard/**`
- dependency resolution through sibling `dashboard/node_modules`

Current implication:

- EcomDash2 is runtime-isolated from the sibling app's codebase
- EcomDash2 is not yet data-isolated from the shared database and shared keep-boundary tables

That remaining shared-data relationship is intentional until a later extraction phase moves schema and database ownership fully into EcomDash2.

## Current workspace assumptions

- the implementation root is the EcomDash2 app root
- any legacy V1 code is reference-only and may be absent
- local development assumes the app is launched from its own root so `process.cwd()` resolves app-owned metric-definition files correctly

## Temporary exceptions after this cleanup

Runtime-code exceptions remaining: none.

Infrastructure/data exceptions still remaining:

- shared Turso database
- shared raw, report, contract, and status tables
- dedicated database bootstrap and cutover are not done yet
