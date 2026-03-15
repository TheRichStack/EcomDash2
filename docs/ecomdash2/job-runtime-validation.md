# EcomDash2 Job Runtime Validation

Last updated: 2026-03-13

## Scope

This pass validated the standalone EcomDash2 job runtime from `EcomDash2/TRS_Starter_Core` against the current shared Turso workspace using the smallest safe write windows available.

This was a smoke-check pass, not a broad live backfill.

## A. Environment used

### Workspace and DB posture

- Workspace used for validated runs: `default`
- Why `default` was used:
  - the current `.env.local` resolves `WORKSPACE_ID_DEFAULT=default`
  - a workspace-wide probe against shared tables only surfaced populated rows for `default`
  - no populated demo workspace was visible in the current shared DB posture
- DB posture:
  - shared Turso/libSQL database via compatibility env keys `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
  - no dedicated EcomDash2 DB work was started

### Runtime/env posture

- Settings hydration posture:
  - `SETTINGS_ENV_HYDRATE` defaulted on
  - `SETTINGS_ENV_MODE` resolved to `fallback`
  - validated post-fix runtime context for `default` reported:
    - `loaded_config_keys=39`
    - `loaded_token_keys=5`
    - `skipped_token_keys=[]`
- Local default connector posture before overrides:
  - `CONNECTORS_ENABLED=shopify,meta,google,tiktok,klaviyo`
  - `CONNECTOR_STRICT=0`
- Important local mismatch:
  - `ga4` was fully configured but not included in the local default `CONNECTORS_ENABLED` list
  - GA4 smoke runs used explicit per-command overrides

### Commands executed

Verification:

- `npm run lint`
- `npm run typecheck`

Smoke checks:

- `npm run jobs:contracts:refresh -- --workspace=default --from=2026-03-02 --to=2026-03-02`
- `npm run jobs:hourly -- --workspace=default --from=2026-03-02 --to=2026-03-02 --only-contracts`
- Initial attempt before fix:
  - `$env:CONNECTORS_ENABLED='ga4'; $env:CONNECTOR_STRICT='1'; npm run jobs:hourly -- --from=2026-03-02 --to=2026-03-02`
- Post-fix constrained connector runs:
  - `$env:CONNECTORS_ENABLED='ga4'; $env:CONNECTOR_STRICT='1'; npm run jobs:hourly -- --from=2026-03-02 --to=2026-03-02`
  - `$env:CONNECTORS_ENABLED='ga4'; $env:CONNECTOR_STRICT='1'; npm run jobs:backfill -- --workspace=default --source=ga4 --from=2026-03-02 --to=2026-03-02 --chunk-days=1`
  - `$env:CONNECTORS_ENABLED='ga4'; $env:CONNECTOR_STRICT='1'; npm run jobs:reconcile -- --workspace=default --sources=ga4 --to=2026-03-02 --ad-days=1 --shopify-days=1 --contracts-days=1`

Supporting query checks:

- workspace inventory across shared tables
- `config_entries` / `settings_tokens_encrypted` presence for `default`
- `job_runs`, `backfill_runs`, and `sync_state` verification queries
- bounded row-count checks for GA4 and contract output tables on `2026-03-02`

## B. Execution result matrix

| Runner / connector | Attempted command | Result | Status | What it verified | What it did not verify |
| --- | --- | --- | --- | --- | --- |
| Contracts refresh runner | `npm run jobs:contracts:refresh -- --workspace=default --from=2026-03-02 --to=2026-03-02` | `run_id=9b05619d-6b8a-47dd-8fa7-2cdf9ec69a39`, success | Success | standalone runner startup, env hydration, contract rebuild path, `job_runs` write, `sync_state` `jobs:contracts:refresh:last_success_at` write | no connector execution |
| Hourly runner, contracts-only | `npm run jobs:hourly -- --workspace=default --from=2026-03-02 --to=2026-03-02 --only-contracts` | `run_id=d65c3604-b271-4590-87c4-e35d6f0dfb78`, success | Success | hourly entrypoint startup, workspace resolution, `job_runs` write through hourly path, contract refresh from hourly entrypoint | no connector execution, no hourly cursor advance |
| Hourly runner, GA4 only, pre-fix | `$env:CONNECTORS_ENABLED='ga4'; $env:CONNECTOR_STRICT='1'; npm run jobs:hourly -- --from=2026-03-02 --to=2026-03-02` | failed with `GA4_CREDENTIALS_JSON is set but could not be parsed as JSON` | Fail | exposed a real job-runtime env parsing defect | did not verify connector execution or status writes |
| Hourly runner, GA4 only, post-fix | same command as above | `run_id=973b27e5-42a6-46e6-be4c-8c475280b80e`, success | Success | connector registry resolution, explicit connector gating, env hydration from `.env.local` plus settings, GA4 execution shape, `job_runs` write, `sync_state` writes for `connector:ga4` and `hourly_sync` | no smoke of Shopify/Meta/TikTok/Klaviyo/Google |
| Backfill runner, GA4 only | `$env:CONNECTORS_ENABLED='ga4'; $env:CONNECTOR_STRICT='1'; npm run jobs:backfill -- --workspace=default --source=ga4 --from=2026-03-02 --to=2026-03-02 --chunk-days=1` | `run_id=b21ec9ec-8e6c-48d8-b166-e2a641dc3a7e`, success | Success | standalone backfill runner, bounded chunking, `backfill_runs` lifecycle write, checkpoint persistence, contract refresh after backfill | no resumable backfill validation, no non-GA4 connector backfill |
| Reconcile runner, GA4 only | `$env:CONNECTORS_ENABLED='ga4'; $env:CONNECTOR_STRICT='1'; npm run jobs:reconcile -- --workspace=default --sources=ga4 --to=2026-03-02 --ad-days=1 --shopify-days=1 --contracts-days=1` | `run_id=53d67b46-6fcd-463b-b090-490c2b7f0abd`, success | Success | reconcile runner startup, bounded lookback execution, `job_runs` write, `sync_state` `jobs:reconcile:last_success_at` write | no smoke of Shopify reconcile path, no broad stale-window recovery validation |

### Connector execution evidence captured

Post-fix GA4 hourly and reconcile details both recorded the same bounded ingest shape:

- processed rows: `49`
- table counts:
  - `raw_shopify_analytics_daily=7`
  - `raw_shopify_analytics_breakdowns=31`
  - `raw_shopify_analytics_catalog=4`
  - `raw_shopify_analytics_dimensions_catalog=7`
  - `raw_ga4_product_funnel=0`

Row-count spot checks for `workspace_id='default'` and `date='2026-03-02'` matched the run shape:

- `raw_shopify_analytics_daily=7`
- `raw_shopify_analytics_breakdowns=31`
- `raw_ga4_product_funnel=0`
- `contract_daily_overview=1`
- `contract_daily_channel_campaign=0`
- `contract_creative_performance=0`

Interpretation:

- the GA4 connector path executed cleanly
- no GA4 product-funnel rows were returned for the bounded smoke date
- the contract refresh path completed, but ad-channel / creative contract rows were naturally empty for that date/window

## C. Status metadata verification

### `job_runs`

Verified working.

Evidence from stored rows in `workspace_id='default'`:

- `jobs:contracts:refresh`
  - `run_id=9b05619d-6b8a-47dd-8fa7-2cdf9ec69a39`
  - status `success`
  - message `Contract refresh completed for 2026-03-02..2026-03-02.`
- `jobs:sync:hourly`
  - `run_id=d65c3604-b271-4590-87c4-e35d6f0dfb78`
  - status `success`
  - message `Contract refresh completed from hourly entrypoint (2026-03-02..2026-03-02).`
- `jobs:sync:hourly`
  - `run_id=973b27e5-42a6-46e6-be4c-8c475280b80e`
  - status `success`
  - message `Hourly sync completed for 2026-03-02..2026-03-02.`
- `jobs:reconcile`
  - `run_id=53d67b46-6fcd-463b-b090-490c2b7f0abd`
  - status `success`
  - message `Daily reconcile completed (2026-03-01..2026-03-02).`

Each of those rows also carried structured `details_json` with step-level metadata.

### `backfill_runs`

Verified working.

Evidence:

- `run_id=b21ec9ec-8e6c-48d8-b166-e2a641dc3a7e`
- `source_key=jobs:backfill`
- status `success`
- `cursor_date=2026-03-02`
- message `Backfill completed (2026-03-02..2026-03-02).`
- `details_json` included:
  - `chunks_completed=1`
  - checkpoint `ga4=2026-03-02`
  - `source_rows.ga4=49`

### `sync_state`

Verified working.

Observed keys after successful bounded runs:

- `connector:ga4 / cursor = 2026-03-02`
- `connector:ga4 / last_success_at = 2026-03-13T18:37:36.637Z`
- `hourly_sync / cursor = 2026-03-13`
- `hourly_sync / last_success_at = 2026-03-13T18:37:37.363Z`
- `jobs:contracts:refresh / last_success_at = 2026-03-13T18:42:46.411Z`
- `jobs:reconcile / last_success_at = 2026-03-13T18:39:57.807Z`

Conclusion:

- `job_runs` writes work
- `backfill_runs` writes work
- `sync_state` writes work for connector, hourly, contract-refresh, and reconcile markers

## D. Connector readiness summary

| Connector | Readiness | Reason |
| --- | --- | --- |
| Shopify | Partially ready | Runtime context resolves as configured through settings hydration, but live smoke execution was intentionally not run on the only populated shared workspace because the Shopify path also performs inventory snapshot writes and is higher-risk than the constrained GA4 check. |
| Meta | Partially ready | Runtime context resolves as configured through settings hydration. No live smoke was run in this pass because only the shared `default` workspace was available and the pass stayed bounded to the lowest-risk connector path. |
| Google | Blocked | Direct mode is not configured in the current workspace/runtime because `GOOGLE_ADS_DEVELOPER_TOKEN`, client credentials, and refresh token are absent. Bridge mode code exists, but the workspace has `raw_google_ads_daily` row count `0`, so the safest bridge-based smoke path was not available. |
| TikTok | Partially ready | Runtime context resolves as configured through settings hydration. No live smoke was run in this pass because the workspace posture did not justify broad multi-connector live writes. |
| Klaviyo | Partially ready | Runtime context resolves as configured through settings hydration. No live smoke was run in this pass because the validation stayed constrained to contract-only and GA4-only execution on the shared workspace. |
| GA4 | Ready | After the runtime env-parser fix, hourly, backfill, and reconcile all executed successfully on bounded `2026-03-02` windows with correct status writes and expected GA4 raw-table counts. |

## E. Follow-up defects

### Fixed in this pass

1. Multiline env parsing bug in job runtime
   - File: `lib/jobs/runtime/env.ts`
   - Problem:
     - the standalone runner env parser only handled single-line `KEY=value` entries
     - `.env.local` stores `GA4_CREDENTIALS_JSON` as a quoted multiline JSON blob
     - result: the first GA4 hourly smoke attempt failed with `GA4_CREDENTIALS_JSON is set but could not be parsed as JSON`
   - Fix:
     - added narrow multiline quoted-value handling to the job runtime env parser
   - Validation:
     - post-fix runtime env probe parsed `GA4_CREDENTIALS_JSON` successfully
     - post-fix GA4 hourly/backfill/reconcile smoke runs all succeeded

### Still open

1. Local connector default mismatch
   - Current local runtime default is `CONNECTORS_ENABLED=shopify,meta,google,tiktok,klaviyo`
   - `ga4` is configured and the workflows/docs expect GA4 in the normal first-wave scope
   - Local smoke validation required an explicit `CONNECTORS_ENABLED=ga4` override

2. Google direct credentials are incomplete for this workspace
   - current runtime context still reports Google direct mode as not configured
   - no direct Google smoke run was safe/available in this pass

3. No populated demo workspace was available in the current shared DB posture
   - this validation had to stay on `default`
   - that limited live connector smoke coverage to the lowest-risk bounded path

## Bottom line

The standalone EcomDash2 runners do execute successfully from this repo.

Validated with evidence:

- `jobs:contracts:refresh`
- `jobs:sync:hourly`
- `jobs:backfill`
- `jobs:reconcile`

Validated runtime behavior:

- env/settings hydration works after the multiline env parser fix
- `job_runs`, `backfill_runs`, and `sync_state` writes are working
- a real constrained connector path (`ga4`) can run successfully without breaking

Not yet validated in this pass:

- live Shopify / Meta / TikTok / Klaviyo execution on a safe demo workspace
- Google direct mode
- Google bridge mode against a workspace that actually has `raw_google_ads_daily` rows
