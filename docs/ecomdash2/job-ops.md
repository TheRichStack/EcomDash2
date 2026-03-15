# EcomDash2 Job Operations

Last updated: 2026-03-14

## Ownership model

EcomDash2 now owns its scheduler/workflow definitions as committed repo files under `.github/workflows/`.

Source of truth:

- `.github/workflows/ecomdash2-hourly-sync.yml`
- `.github/workflows/ecomdash2-daily-reconcile.yml`
- `.github/workflows/ecomdash2-backfill.yml`
- `.github/workflows/ecomdash2-contract-refresh.yml`

The legacy remote GitHub CLI workflow-generation pattern is not part of the EcomDash2 operating model. Committed workflow YAML is the intended future direction and the current source of truth.

The old generic `hourly-sync.yml` and `daily-reconcile.yml` schedules were retired to avoid duplicate runs against the shared Turso database.

If this app is extracted into its own repository, move the same `ecomdash2-*.yml` files into that repo and update `working-directory` from `EcomDash2/TRS_Starter_Core` to `.`.

## Workflow inventory

| Workflow file | Trigger | Runner entrypoint | Notes |
| --- | --- | --- | --- |
| `ecomdash2-hourly-sync.yml` | Hourly schedule at `17 * * * *` and manual dispatch | `npm run jobs:hourly` | Manual inputs: `workspace_id`, `from`, `to`, `only_contracts` |
| `ecomdash2-daily-reconcile.yml` | Daily schedule at `0 2 * * *` and manual dispatch | `npm run jobs:reconcile` | Manual inputs: `workspace_id`, `sources`, `to`, `ad_days`, `shopify_days`, `contracts_days` |
| `ecomdash2-backfill.yml` | Manual dispatch only | `npm run jobs:backfill` | Inputs: `connector`, `from`, `to`, `workspace_id`, `chunk_days`, `scope`, `resume` |
| `ecomdash2-contract-refresh.yml` | Manual dispatch only | `npm run jobs:contracts:refresh` | Inputs: `workspace_id`, `from`, `to`, `dirty_dates` |

## GitHub secrets and env contract

### Required in GitHub for every workflow

These must be set as GitHub repository secrets before any workflow can run safely:

| Key | Why it is required |
| --- | --- |
| `ECOMDASH2_DEFAULT_WORKSPACE_ID` | Default workspace for scheduled runs and manual runs that do not pass `workspace_id` |
| `ECOMDASH2_TURSO_URL` | Turso/libSQL database URL |
| `ECOMDASH2_TURSO_AUTH_TOKEN` | Turso auth token |
| `DATA_ENCRYPTION_KEY` | Required for `settings_tokens_encrypted` decryption and Shopify customer-id hashing in raw rows |

Workflow defaults applied in YAML:

- `ECOMDASH2_BACKEND_SOURCE=turso`
- `SETTINGS_ENV_HYDRATE=1`
- `SETTINGS_ENV_MODE=fallback`
- `CONNECTOR_STRICT=1`
- `CONNECTORS_ENABLED=shopify,meta,google,tiktok,klaviyo,ga4` in the hourly, reconcile, and backfill workflows
- `CONNECTOR_SUPPORT_TABLES` is intentionally left unset so shared-only support-table writes stay disabled by default

With `SETTINGS_ENV_MODE=fallback`, GitHub env values win and workspace-scoped settings only fill blanks.

### Connector credentials

Connector credentials may come from either:

- GitHub repository secrets exported by the workflow
- workspace-scoped settings loaded from `config_entries` and `settings_tokens_encrypted`

If a workflow-secret value is blank, the runtime will still attempt to hydrate that key from the database for the resolved workspace.

| Connector | Required keys | Notes |
| --- | --- | --- |
| Shopify | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ACCESS_TOKEN` | `SHOPIFY_API_VERSION`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_SYNC_INVENTORY` remain optional |
| Meta | `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` | `META_API_VERSION` and `META_SYNC_CREATIVES` remain optional |
| Google Ads | `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN` | `GOOGLE_ADS_LOGIN_CUSTOMER_ID` is optional. `GOOGLE_ADS_TRANSPORT=bridge` is compatibility-only; direct API is the default and preferred mode |
| TikTok | `TIKTOK_ACCESS_TOKEN`, `TIKTOK_ADVERTISER_ID` | `TIKTOK_API_VERSION` remains optional |
| Klaviyo | `KLAVIYO_PRIVATE_API_KEY` | `KLAVIYO_CONVERSION_METRIC_ID` is strongly recommended when the API token cannot discover the conversion metric automatically. `KLAVIYO_API_VERSION`, `KLAVIYO_REPORT_DELAY_MS`, and `KLAVIYO_SYNC_FLOWS` remain optional |
| GA4 | `GA4_PROPERTY_ID` plus one auth mode | Auth mode can be `GA4_CREDENTIALS_JSON`, `GA4_CLIENT_EMAIL` + `GA4_PRIVATE_KEY`, or `GA4_REFRESH_TOKEN` + `GA4_CLIENT_ID` + `GA4_CLIENT_SECRET` |

### Minimum safe setup

Minimum safe scheduled setup is:

1. Set the four base secrets listed above.
2. Provide credentials for every connector in the committed `CONNECTORS_ENABLED` scope, either as GitHub secrets or as DB-backed settings for the default workspace.
3. Run a manual contract refresh and one manual hourly sync before relying on the schedules.

If a workspace intentionally does not use one of the six first-wave connectors, narrow `CONNECTORS_ENABLED` in the committed workflow YAML before enabling the schedule.

Support-table compatibility mode:

- default:
  - leave `CONNECTOR_SUPPORT_TABLES` unset
  - result: dedicated-DB-safe mode with no writes to `raw_shopify_markets`, `raw_shopify_analytics_catalog`, `raw_shopify_analytics_dimensions_catalog`, or `ads_entity_snapshot`
- compatibility only:
  - set `CONNECTOR_SUPPORT_TABLES=shared`
  - use only while still depending on those shared-only support tables in the shared DB posture
  - do not use this mode when validating or cutting over to a dedicated DB

## Smoke checks

Recommended first-run checks:

1. Run `ecomdash2-contract-refresh` for a short range such as the last 3 days.
2. Run `ecomdash2-hourly-sync` manually with no overrides.
3. Run `ecomdash2-backfill` for one connector and a short bounded range.
4. Run `ecomdash2-daily-reconcile` manually once.

What to verify after each run:

- In the current parent repo: GitHub Actions logs show the package path `EcomDash2/TRS_Starter_Core`.
- After extraction: GitHub Actions logs should show `working-directory: .`.
- In both cases: logs show the `npm run jobs:*` command you expected.
- `job_runs` contains fresh rows for `jobs:sync:hourly`, `jobs:reconcile`, or `jobs:contracts:refresh`.
- `backfill_runs` contains a fresh row for manual backfills.
- `sync_state` advances `hourly_sync`, per-connector cursors, and `last_success_at` markers after successful hourly/reconcile runs.

## Recovery notes

- Use `ecomdash2-contract-refresh` for bounded reruns when contract tables are stale but raw/fact data is already present.
- Use `ecomdash2-backfill` with `resume=true` after an interrupted long-range backfill.
- Keep `GOOGLE_ADS_TRANSPORT=bridge` as an explicit fallback only. Do not treat bridge mode as the default EcomDash2 architecture.
