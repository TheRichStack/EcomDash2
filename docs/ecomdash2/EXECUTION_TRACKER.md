# EcomDash2 Execution Tracker

Last updated: 2026-03-14
Owner: PM agent
Current progress estimate: 100%

## Purpose

This doc is the working execution tracker for the EcomDash2 rebuild.

Use it to keep one current record of:
- the sequence we are following
- what has been accepted
- what is still pending
- outstanding risks, notes, and temporary exceptions

Rule:
- update this file only after a worker output has been reviewed and accepted, or when the execution sequence itself changes

## Current Build Sequence

1. Foundation shell and grouped nav
2. Auth, workspace, date-range, compare foundation
3. EcomDash2-owned env, db, metrics, and loader boundary
4. Settings shell and read surfaces
5. Settings editable config for Dashboard and Targets
6. Overview
7. Shopify Profit
8. Paid Media all-channels
9. Paid Media platform routes
10. Creative
11. Shopify Products
12. Shopify Inventory
13. Shopify Funnel
14. Email
15. Extraction-readiness cleanup

## Post-Build Sequence

Now that the locked route set is complete, execution moves to validation and cutover readiness.

1. Pre-validation UX cleanup
2. Side-by-side numeric validation against V1
3. Discrepancy fix loop
4. Shared infrastructure hardening and observability
5. Cutover-readiness review

## Accepted Work

### 1. Foundation shell and route scaffolds

Status: accepted

Delivered:
- locked grouped sidebar IA
- addressable route scaffolds for all locked pages
- Settings kept as one top-level sidebar item
- shell/header structure reserved for later shared controls

Notes:
- route bodies were intentionally placeholders at this stage

### 2. Shared dashboard request-state foundation

Status: accepted

Delivered:
- app-owned `DashboardRequestContext`
- shared `workspaceId`, `from`, `to`, and `compare` resolution
- shell-scoped dashboard state provider/hooks
- header controls wired for workspace, date range, and compare
- state preserved across dashboard navigation

Notes:
- session is still an app-owned env-stub contract, not a full auth system

### 3. EcomDash2-owned backend foundation

Status: accepted

Delivered:
- app-owned env contract
- app-owned Turso/db boundary
- app-owned metrics runtime registry
- app-owned server loaders for Settings, Overview, and Shopify Profit
- keep/defer/cut boundary enforced in EcomDash2 code

Accepted correction pass included:
- scoped queries no longer silently truncate by default
- sibling `@libsql/client` bootstrap is opt-in only
- Settings metrics contract split into:
  - runtime registry
  - full catalog source

Temporary exceptions still accepted:
- opt-in sibling libsql fallback in `lib/db/client.ts`
- filesystem bootstrap of full metric catalog from V1 metric definitions in `lib/metrics/catalog-source.ts`

### 4. Settings shell and read surfaces

Status: accepted

Delivered:
- real `/dashboard/settings` landing route
- internal Settings IA with real internal routes
- read-only Workspace, Dashboard, Inputs, Metrics, and Syncs surfaces
- route-local Settings helpers only
- metrics page correctly separates runtime subset vs full catalog source

Accepted correction pass included:
- Next page prop typing fixed for Settings routes

### 5. Settings editable config slice

Status: accepted

Delivered:
- editable Overview KPI strip config on `/dashboard/settings/dashboard`
- editable Shopify Profit KPI strip config on `/dashboard/settings/dashboard`
- editable Overview pacing metric selection on `/dashboard/settings/inputs/targets`
- persistence under:
  - `ecomdash2.dashboard.overview.kpi_strip`
  - `ecomdash2.dashboard.shopify_profit.kpi_strip`
  - `ecomdash2.targets.overview.pacing_metrics`
- loader-side fallback enforcement for invalid stored config

Accepted correction pass included:
- server actions now validate writable `workspaceId` against `session.workspaceMemberships`

### 6. Overview vertical slice

Status: accepted

Delivered:
- real `/dashboard` page
- locked primary order:
  - KPI strip
  - pacing board
  - period business snapshot
  - daily trend
  - channel summary
- locked secondary modules:
  - top products
  - top creatives
  - email snapshot
- pacing board uses saved Settings selection and target/baseline fallback logic
- daily trend uses shadcn chart layer plus Recharts only

Accepted correction pass included:
- replaced incorrect `Top campaigns` secondary module with spec-aligned `Top creatives`

### 7. Shopify Profit vertical slice

Status: accepted

Delivered:
- real `/dashboard/shopify/profit` page
- locked 5-card KPI strip from saved Settings config
- compact timeframe/comparison context surface
- profit trend chart
- P&L-style breakdown table
- taxes kept in the breakdown table only
- daily overhead allocation preserved through the existing loader logic

Notes:
- current tax row is zero, which matches current V1 behavior

### 8. Paid Media all-channels slice

Status: accepted

Delivered:
- real `/dashboard/paid-media` page
- locked all-channels module order:
  - KPI strip
  - spend / revenue / ROAS trend
  - channel summary table
  - campaign performance table
- app-owned `loadPaidMediaSlice()` loader and paid-media slice types
- estimated profit proxy surfaced as a first-class table value with confidence metadata
- target-aware formatting for ROAS and CPA
- client-local visible-column customization under:
  - `ecomdash2.dashboard.paid_media.all.campaign_table.visible_columns.v1`
- extra/raw metric support through app-owned `extraMetrics` parsing without a second table system

Notes:
- loader reads `contract_daily_overview` as well as paid contract rows so MER and the profit-proxy baseline stay canonical
- worker did not run browser QA or a live Turso-to-V1 numeric comparison in this pass

Accepted correction pass included:
- shared paid-media trend comparison now aligns by relative day position instead of raw array index, so missing comparison days no longer shift onto the wrong current-range dates

### 9. Paid Media platform routes

Status: accepted

Delivered:
- real `/dashboard/paid-media/meta`, `/dashboard/paid-media/google`, and `/dashboard/paid-media/tiktok` routes
- one shared app-owned `loadPaidMediaPlatformSlice()` path extending the existing paid-media foundation instead of three separate loader copies
- one shared route-local platform page composition with thin route bindings per platform
- locked route structure per platform:
  - KPI strip
  - spend / attributed revenue / ROAS trend
  - platform performance surface
- richer platform table behavior on the shared table shell:
  - status filtering
  - platform-specific sort options
  - URL-state drill-in for campaign -> ad set -> ad where fact-level rows exist
- namespaced visible-column persistence under:
  - `ecomdash2.dashboard.paid_media.meta.campaign_table.visible_columns.v1`
  - `ecomdash2.dashboard.paid_media.google.campaign_table.visible_columns.v1`
  - `ecomdash2.dashboard.paid_media.tiktok.campaign_table.visible_columns.v1`

Notes:
- when fact-level rows are unavailable for a selected range, the route falls back cleanly to a richer campaign-level table and reports that lower-level drill-in is unavailable for that selection
- worker did not run browser QA or a live Turso-to-V1 numeric comparison in this pass

### 10. Creative

Status: accepted

Delivered:
- real `/dashboard/paid-media/creative` page
- locked Creative structure:
  - KPI strip
  - filter bar
  - grid / table view switch
  - creative metrics customizer
  - creative performance surface
- combined cross-platform creative dataset and filtering
- grid-only cards-per-row control
- namespaced client-local persistence under:
  - `ecomdash2.dashboard.paid_media.creative.view_mode.v1`
  - `ecomdash2.dashboard.paid_media.creative.cards_per_row.v1`
  - `ecomdash2.dashboard.paid_media.creative.card_metrics.v1`
- inline video playback when `video_url` is present, with fallback to thumbnail/image/placeholder when playback or media loading fails
- app-owned `loadCreativeSlice()` loader path added to the shared paid-media loader boundary

Notes:
- current seed workspace verified the fallback media path, but did not confirm successful inline playback against a present local demo video asset

### 11. Shopify Products

Status: accepted

Delivered:
- real `/dashboard/shopify/products` page
- locked Products structure:
  - KPI strip
  - product performance table with breakdown switch, tag filter, search, and CSV export
- app-owned `loadShopifyProductsSlice()` loader path
- app-owned extension of the table boundary to include `raw_shopify_orders` for tag filtering
- product / SKU / variant breakdown with variant column shown only in variant view
- profit-aware KPI strip including the documented refund-adjusted product net-profit proxy
- 7D and 30D sales velocity derived from trailing `fact_order_items` history ending on the selected `to` date
- route-owned CSV export of the currently filtered rows

Notes:
- worker did not run browser manual checks for `/dashboard/shopify/products` in this pass
- current KPI-level `net profit` is intentionally documented as a refund-adjusted product proxy because the slice does not allocate ad spend or overhead by product in v1

### 12. Shopify Inventory

Status: accepted

Delivered:
- real `/dashboard/shopify/inventory` page
- locked Inventory structure:
  - KPI strip
  - inventory table with velocity controls, search, sort, and stock/status filters
- app-owned `loadShopifyInventorySlice()` loader path
- app-owned extension of the table boundary to include `raw_shopify_inventory_levels`
- latest-snapshot selection using:
  - latest snapshot inside the selected range when available
  - latest available snapshot fallback otherwise
- server-derived velocity windows for `7 / 14 / 30 / 60 / 90` days
- table visibility for:
  - stock
  - sold
  - rate / day
  - days left
  - estimated stockout
  - status
- real stock-state status model:
  - healthy
  - at risk
  - out of stock
  - untracked

Notes:
- worker did not run manual browser checks for `/dashboard/shopify/inventory` in this pass
- worker did not run a live Turso-to-V1 comparison for inventory counts or days-left behavior in this pass
- stock filter taxonomy is currently:
  - all
  - tracked only
  - in stock
  - out of stock
- this matches the accepted implementation even though the spec did not lock the exact stock-filter labels

### 13. Shopify Funnel

Status: accepted

Delivered:
- real `/dashboard/shopify/funnel` page
- locked Funnel structure:
  - KPI strip
  - stage-conversion visual
  - daily trend view
  - breakdown table
- app-owned `loadShopifyFunnelSlice()` loader path
- app-owned boundary extensions for:
  - `raw_shopify_analytics_daily`
  - `raw_shopify_analytics_totals`
  - `raw_shopify_analytics_breakdowns`
  - `fact_orders`
- canonical funnel KPI ids for:
  - sessions
  - add to cart rate
  - checkout rate
  - purchase conversion rate
- orders and revenue derived from `fact_orders`
- inline segment-view behavior through the same breakdown table shell with dimension switching across:
  - channel
  - device
  - customer type
  - country

Notes:
- current workspace has no `raw_shopify_analytics_totals` rows, so the loader currently resolves stage counts from `raw_shopify_analytics_daily` and will automatically use exact-range totals if they begin landing later
- purchases in the funnel stages intentionally remain separate from `fact_orders` order count in this dataset; the accepted implementation keeps Purchase stage and Orders KPI on different sources by design
- worker validated live source-table counts for a sample period but did not run a direct rendered V1 comparison
- follow-up note: the page-level freshness label should eventually be tightened so analytics-surface freshness is not overstated by newer `fact_orders` dates when the sources diverge

### 14. Email

Status: accepted

Delivered:
- real `/dashboard/email` page
- locked Email structure:
  - KPI strip
  - shared `Campaigns` / `Flows` tabs
  - tab-specific content area
- app-owned `loadEmailSlice()` loader path
- explicit Email slice dependency mapping in the EcomDash2 table boundary for:
  - `report_klaviyo_campaigns`
  - `report_klaviyo_flows`
- combined KPI-strip rollup across campaigns and flows for:
  - revenue
  - sends
  - weighted open rate
  - weighted click rate
  - revenue per recipient
  - placed orders when exposed by the underlying report-table schema
- Campaigns tab implemented as:
  - compact toolbar
  - table-first workspace
  - row-select detail on the right on desktop
  - mobile sheet detail
- Flows tab implemented as:
  - compact toolbar
  - left list / right detail workspace
  - same desktop-panel / mobile-sheet interaction model as Campaigns
- flow sequence section included in flow detail with a clean empty state when the current dataset does not expose sequence fields

Notes:
- current dataset does not expose `placed orders` on the allowed Klaviyo report tables, so that KPI currently renders as unavailable rather than widening the read boundary
- current dataset also does not expose the flow sequence fields needed for step-level reconstruction, so the accepted implementation shows an explicit clean empty state instead of fake sequence structure
- worker ran browser checks for route structure, default-tab behavior, desktop right-side detail, mobile sheet detail, and the sequence empty state

### 15. Extraction-readiness cleanup

Status: accepted

Delivered:
- removed the sibling `dashboard/node_modules/@libsql/client` runtime fallback from `lib/db/client.ts`
- removed the obsolete `ECOMDASH2_ALLOW_SIBLING_LIBSQL_BOOTSTRAP` toggle from runtime env parsing and `.env.example`
- moved the full Settings metrics catalog to app-owned files under:
  - `lib/metrics/definitions/*.json`
- updated `lib/metrics/catalog-source.ts` to load the full catalog from EcomDash2-owned definitions only
- preserved the split Settings metrics contract:
  - runtime registry
  - full catalog source
- added app-owned runtime/setup documentation covering:
  - env vars
  - local setup
  - shared database and job assumptions
  - current extraction boundary

Docs added or updated:
- `README.md`
- `docs/ecomdash2/README.md`
- `docs/ecomdash2/runtime-setup.md`
- `docs/ecomdash2/metrics-engine.md`

Notes:
- EcomDash2 runtime code no longer depends on sibling app code or sibling install paths
- shared data/job coupling still remains intentionally at the infrastructure level:
  - shared Turso database
  - shared reporting/business tables during the rebuild phase
- local metric catalog now includes 98 app-owned definition JSON files

### 16. Route-navigation speed polish

Status: accepted

Delivered:
- added a short-lived app-owned read cache for repeated Turso read queries in `lib/db/query.ts`
- cache clears automatically after write statements, so settings saves do not leave stale read results behind
- cached the full metrics catalog load in `lib/metrics/catalog-source.ts`
- cached per-definition metrics-library detail reads in `app/(app)/dashboard/settings/metrics/metrics-library-data.ts`

Notes:
- this is a small speed pass aimed at route hopping and repeated settings/metrics opens, not a full loader-architecture rewrite
- first loads in dev can still feel slow because route navigation still triggers full server renders and Next dev/HMR overhead
- the next major performance step, if still needed, is splitting large route loaders such as the Settings slice into route-specific loaders

### 17. Funnel product and SKU breakdown

Status: accepted

Delivered:
- kept the existing Shopify segment breakdown table intact
- added a second lower `Product / SKU funnel breakdown` section to `/dashboard/shopify/funnel`
- used app-owned `raw_ga4_product_funnel` loading through the existing funnel loader path
- exposed two grouped views from one transformed item-level dataset:
  - product
  - sku
- added route-local search and sortable headers to the new lower breakdown table

Notes:
- this lower table is intentionally separate from the current `channel / device / customer type / country` breakdown switch because it is a different analytical layer with a different source table
- GA4 item rows do not expose a first-class product / sku pair, so the implementation treats `item_id` as SKU and enriches product grouping via Shopify order-item lookup where possible
- when no exact selected-range GA4 item snapshot exists, the loader falls back to the closest overlapping synced range and the UI states that explicitly
- worker did not run browser verification in this pass

### 18. Costs workflow and downstream cost-model integration

Status: accepted

Delivered:
- replaced the read-only `/dashboard/settings/inputs/costs` surface with a real editable workflow
- added editable workspace defaults for:
  - default margin %
  - payment fee %
  - shipping %
  - returns allowance %
  - monthly overhead
- restored the SKU override workflow as a unit-cost override model, not a margin override model
- added route-local SKU override controls for:
  - search
  - all / missing / overrides filters
  - row selection
  - bulk override apply
  - clear selected overrides
  - clear all overrides back to Shopify costs where available
- added app-owned cost helpers and persistence path:
  - `lib/settings/costs.ts`
  - `lib/db/settings-costs.ts`
  - `lib/server/settings-costs.ts`
- saved defaults to `cost_settings` and saved overrides to `sku_costs` through EcomDash2-owned server code
- connected saved `sku_costs` back into downstream cost/profit logic for:
  - Overview
  - Shopify Profit
  - Paid Media profit-proxy baseline
- preserved active cost priority as:
  1. `override_unit_cost`
  2. Shopify/imported unit cost
  3. default margin fallback only when exact cost is missing

Notes:
- the SKU override model intentionally remains a cost override workflow; derived margin stays read-only from `price` and active unit cost
- monthly overhead behavior remains unchanged and continues to flow through the existing daily overhead allocation logic
- Shopify Products and Inventory still do not consume `sku_costs` directly; this pass was accepted as a downstream cost/profit correction rather than a row-level product-surface rewrite
- worker did not run browser/manual save verification in this pass

### 19. Overview secondary reporting cleanup

Status: accepted

Delivered:
- removed the cramped mini-table treatment from the Overview secondary reporting cards
- kept the three locked secondary modules:
  - `Top products`
  - `Top creatives`
  - `Email snapshot`
- converted each module into a lighter ranked-summary presentation instead of narrow multi-column tables
- removed the interim share/progress bars from the secondary cards after review
- removed prompt/spec language that had leaked into the visible UI during the first redesign pass
- finalized the visible subtitles as:
  - `Revenue leaders by item`
  - `Revenue leaders by creative`
  - `Campaign and flow mix`

Final representation:
- Top products:
  - ranked list of up to 5 rows
  - product name
  - variant/SKU subtitle when present
  - revenue as the primary right-aligned metric
  - compact metadata line for units sold and gross profit
- Top creatives:
  - ranked list of up to 5 rows
  - creative label
  - platform chip
  - revenue as the primary right-aligned metric
  - compact metadata line for spend and purchases
- Email snapshot:
  - total email revenue summary retained at the top
  - 2 simple rows for Campaigns and Flows
  - revenue as the primary metric
  - compact metadata line for sends, open rate, and click rate

Notes:
- no mini tables were reintroduced
- no horizontal scrollbars remain in these Overview secondary modules
- no new reusable dashboard abstraction was introduced; the helper logic stayed route-local in `app/(app)/dashboard/page.tsx`

### 20. Standalone-job runtime layout

Status: accepted

Delivered:
- locked the EcomDash2-owned standalone job layout under:
  - `scripts/jobs/**`
  - `lib/jobs/**`
  - `lib/connectors/**`
- chose the thin-runner modular layout instead of keeping the whole runtime in `scripts/**`
- documented the first-wave runner, connector, env-hydration, contract-refresh, and status-write boundaries in:
  - `docs/ecomdash2/job-runtime-layout.md`
- added app-owned scaffolding READMEs for the new runtime folders
- locked Google to a direct-first strategy with bridge as an explicit fallback only
- confirmed the first standalone milestone still targets the shared Turso database and shared status tables

Notes:
- this pass is architecture and scaffolding only; no runner or connector logic was ported
- the next extraction worker should port the core runners into the chosen structure before adding scheduler ownership

### 21. Standalone core-runner backbone

Status: accepted

Delivered:
- added thin EcomDash2-owned job entrypoints under:
  - `scripts/jobs/hourly.ts`
  - `scripts/jobs/backfill.ts`
  - `scripts/jobs/reconcile.ts`
  - `scripts/jobs/contracts-refresh.ts`
- added reusable runtime modules under:
  - `lib/jobs/runtime/**`
  - `lib/jobs/runners/**`
  - `lib/jobs/status/**`
  - `lib/jobs/contracts/**`
- added the app-owned connector registry/contracts under:
  - `lib/connectors/index.ts`
  - `lib/connectors/types.ts`
  - `lib/connectors/common/**`
- added `tsx` as the minimal runner runtime for TypeScript job entrypoints
- wired hourly, backfill, reconcile, and contract-refresh orchestration into the accepted standalone structure

Notes:
- connector implementations were still stubbed at this stage
- scheduler/workflow ownership was intentionally deferred to a later pass

### 22. Standalone connector port batch 1

Status: accepted

Delivered:
- replaced connector stubs with app-owned implementations for:
  - Shopify
  - Meta
  - TikTok
  - Klaviyo
  - GA4
- kept Google intentionally stubbed for the dedicated Google strategy pass
- connected the new connector implementations to the existing runner/runtime backbone
- added shared connector helpers for:
  - row normalization/upsert
  - privacy sanitization
  - budget history rows
  - snapshot rows
  - table specs
- documented first-wave connector env requirements in:
  - `docs/ecomdash2/runtime-setup.md`

Delivered write coverage:
- Shopify:
  - `raw_shopify_orders`
  - `raw_shopify_line_items`
  - `raw_shopify_inventory_levels`
  - `raw_shopify_markets`
  - `fact_orders`
  - `fact_order_items`
- Meta:
  - `raw_meta_ads_daily`
  - `raw_meta_ads_segments_daily`
  - `raw_meta_creatives`
  - `ads_entity_snapshot`
  - `budget_history`
  - `fact_ads_daily`
  - `fact_ads_segments_daily`
  - `dim_creative`
- TikTok:
  - `raw_tiktok_ads_daily`
  - `raw_tiktok_ads_segments_daily`
  - `budget_history`
  - `fact_ads_daily`
  - `fact_ads_segments_daily`
- Klaviyo:
  - `raw_klaviyo_campaigns`
  - `raw_klaviyo_flows`
  - `report_klaviyo_campaigns`
  - `report_klaviyo_flows`
- GA4:
  - `raw_shopify_analytics_daily`
  - `raw_shopify_analytics_breakdowns`
  - `raw_shopify_analytics_catalog`
  - `raw_shopify_analytics_dimensions_catalog`
  - `raw_ga4_product_funnel`

Notes:
- diagnostics/change-event systems remain intentionally excluded
- the connector batch was accepted based on structure, lint/typecheck, and runtime integration shape; live write execution against a safe workspace is still an open validation task
- the next extraction worker should handle Google separately, then scheduler ownership

### 23. Standalone Google connector

Status: accepted

Delivered:
- replaced the Google connector stub with an app-owned implementation under:
  - `lib/connectors/google/index.ts`
  - `lib/connectors/google/direct.ts`
  - `lib/connectors/google/transform.ts`
  - `lib/connectors/google/bridge.ts`
- kept the accepted strategy:
  - direct API first
  - bridge fallback second
- made direct mode the default path for Google Ads ingestion
- kept bridge mode isolated behind:
  - `GOOGLE_ADS_TRANSPORT=bridge`
- extended connector table specs so the shared ingestion scaffold can upsert:
  - `raw_google_ads_daily`
  - `raw_google_ads_segments_daily`
  - `budget_history`
  - `fact_ads_daily`
  - `fact_ads_segments_daily`
- documented Google runtime/env requirements in:
  - `docs/ecomdash2/runtime-setup.md`

Notes:
- bridge fallback is compatibility-only and rebuilds keep-boundary Google tables from existing Google raw rows; it is not the primary architecture
- segment rows remain intentionally coarse in this pass (`country/device = "unknown"`)
- live execution against a safe workspace is still an open validation task

### 24. Standalone scheduler and workflow ownership

Status: accepted

Delivered:
- added committed EcomDash2-owned workflow files under the repo root:
  - `.github/workflows/ecomdash2-hourly-sync.yml`
  - `.github/workflows/ecomdash2-daily-reconcile.yml`
  - `.github/workflows/ecomdash2-backfill.yml`
  - `.github/workflows/ecomdash2-contract-refresh.yml`
- retired the old generic `hourly-sync.yml` and `daily-reconcile.yml` schedules so the new EcomDash2-owned schedules do not double-run alongside legacy generic ones
- documented standalone job operations in:
  - `docs/ecomdash2/job-ops.md`
- updated runtime and extraction docs so committed workflows are now the intended ownership model instead of remote-only setup scripts
- wired workflows to the EcomDash2-owned job runners:
  - `npm run jobs:hourly`
  - `npm run jobs:reconcile`
  - `npm run jobs:backfill`
  - `npm run jobs:contracts:refresh`

Workflow behavior:
- hourly sync:
  - hourly schedule
  - manual dispatch
  - optional workspace, date-range, and contracts-only overrides
- daily reconcile:
  - daily schedule
  - manual dispatch
  - optional workspace, source, and lookback overrides
- backfill:
  - manual dispatch only
  - connector/date-range/chunk/scope/resume inputs
- contract refresh:
  - manual dispatch
  - optional workspace, range, and dirty-date overrides

Notes:
- workflow jobs run from `EcomDash2/TRS_Starter_Core` and call the app-owned runners from the accepted standalone runtime tree
- manual setup still remains:
  - GitHub secrets must be added
  - connector credentials must exist either in GitHub secrets or workspace-backed settings
  - smoke-checks from `docs/ecomdash2/job-ops.md` still need to be run before relying on schedules in production
- live connector execution against a safe write workspace remains the next validation step

### 25. Standalone job runtime validation

Status: accepted

Delivered:
- added a standalone job-runtime smoke-check report in:
  - `docs/ecomdash2/job-runtime-validation.md`
- validated that all four EcomDash2-owned runners execute from this repo:
  - `jobs:contracts:refresh`
  - `jobs:sync:hourly`
  - `jobs:backfill`
  - `jobs:reconcile`
- validated app-owned status metadata writes for:
  - `job_runs`
  - `backfill_runs`
  - `sync_state`
- validated the constrained GA4 connector path end-to-end across:
  - hourly
  - backfill
  - reconcile
- fixed a narrow standalone-runtime env parsing defect so quoted multiline values in `.env.local` are now handled correctly by the job runtime

Validation posture:
- workspace used:
  - `default`
- DB posture:
  - shared Turso database
- bounded date windows:
  - mostly `2026-03-02`
  - reconcile window `2026-03-01..2026-03-02`

Connector readiness summary from this pass:
- `ga4`:
  - ready
- `shopify`:
  - partially ready
- `meta`:
  - partially ready
- `tiktok`:
  - partially ready
- `klaviyo`:
  - partially ready
- `google`:
  - blocked in the validated workspace because direct credentials are incomplete and bridge data was absent

Notes:
- no populated safe demo workspace was visible in the current shared DB posture, so the smoke checks stayed narrowly bounded to the safest available workspace
- `CONNECTORS_ENABLED` local defaults still exclude `ga4`, so GA4 smoke validation required explicit per-command override even though GA4 is otherwise configured
- remaining work is not runner-backbone risk; it is:
  - broader connector validation
  - shared infrastructure hardening
  - later dedicated-DB / full cutover work

### 26. Repo isolation and CI ownership

Status: accepted

Delivered:
- renamed the root package identity away from starter defaults:
  - app name: `EcomDash2 App`
  - package name: `ecomdash2-app`
- updated root documentation to treat `EcomDash2/TRS_Starter_Core` as the standalone repo-root candidate during extraction
- added an app-owned CI workflow:
  - `.github/workflows/ecomdash2-ci.yml`
- committed CI quality gates now run from the EcomDash2 app root with its own `package-lock.json`:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
- updated standalone-root docs in:
  - `README.md`
  - `docs/ecomdash2/README.md`
  - `docs/ecomdash2/EXECUTION_TRACKER.md`

Notes:
- no product routes, UI files, connector logic, or job-runner behavior changed in this pass
- the in-repo folder path still remains `EcomDash2/TRS_Starter_Core` until extraction into its own repository
- remaining full-standalone blockers are still:
  - shared Turso database
  - shared raw, report, contract, and status tables
  - dedicated database bootstrap and cutover
  - broader connector validation on the shared runtime

### 27. Schema and migration ownership

Status: accepted

Delivered:
- added an app-owned migration tree under:
  - `lib/db/migrations/**`
- added dedicated-DB bootstrap notes under:
  - `lib/db/bootstrap/README.md`
- added an owned/shared/excluded schema inventory in:
  - `docs/ecomdash2/schema-ownership.md`
- documented the initial owned migration set as a baseline snapshot split by table family
- updated root and extraction docs so schema ownership now lives in EcomDash2 even though the live DB is still shared

Notes:
- no product routes, UI files, connector logic, or job-runner behavior changed in this pass
- the live Turso database is still shared in this repo phase
- the next standalone-data step is dedicated database bootstrap and cutover planning

### 28. Dedicated DB bootstrap and cutover planning

Status: accepted

Delivered:
- added a dedicated bootstrap and cutover-planning doc in:
  - `docs/ecomdash2/dedicated-db-bootstrap.md`
- added app-owned bootstrap scaffolding under:
  - `scripts/db/apply-migrations.ts`
  - `scripts/db/copy-seed-plan.ts`
  - `scripts/db/README.md`
- added shared bootstrap config and table-group metadata under:
  - `lib/db/bootstrap/config.ts`
  - `lib/db/bootstrap/plan.ts`
- documented the dedicated target env contract, migration order, copy order, validation steps, rollback path, and secret-update sequence
- documented the current shared-but-not-owned write paths that must be gated before any real dedicated-DB cutover:
  - `raw_shopify_markets`
  - `raw_shopify_analytics_catalog`
  - `raw_shopify_analytics_dimensions_catalog`
  - `ads_entity_snapshot`
- updated root and extraction docs so the remaining standalone-data milestone is execution rather than planning

Notes:
- no product routes, UI files, connector logic, or job-runner behavior changed in this pass
- the live Turso database is still shared in this repo phase
- the next standalone-data step is actual dedicated database provisioning, data copy, validation, and final cutover execution

### 29. Dedicated DB support-table gating

Status: accepted

Delivered:
- added one explicit runtime compatibility mode for shared-only support-table writes:
  - `CONNECTOR_SUPPORT_TABLES=shared`
- made the default job-runtime path dedicated-DB-safe by leaving support-table writes disabled unless that explicit compatibility mode is enabled
- gated these excluded-table writes in connector code:
  - Shopify: `raw_shopify_markets`
  - GA4: `raw_shopify_analytics_catalog`
  - GA4: `raw_shopify_analytics_dimensions_catalog`
  - Meta: `ads_entity_snapshot`
- kept the main keep-boundary writes unchanged for raw, fact, report, contract, and budget-history tables
- updated runtime and cutover docs so the support-table blocker is now resolved by default behavior rather than a future undocumented cleanup

Notes:
- no product routes or UI files changed in this pass
- no V1 runtime imports were introduced
- Google direct and bridge paths already stay on keep-boundary tables in the current runtime and do not write `ads_entity_snapshot`

## Current State

Accepted and complete in current sequence:
- foundation shell
- shared dashboard state
- backend boundary
- Settings read surfaces
- Settings editable config
- Overview
- Shopify Profit
- Paid Media all-channels
- Paid Media platform routes
- Creative
- Shopify Products
- Shopify Inventory
- Shopify Funnel
- Email
- Extraction-readiness cleanup
- route-navigation speed polish
- standalone job runtime layout
- standalone core-runner backbone
- standalone connector port batch 1
- standalone Google connector
- standalone scheduler/workflow ownership
- standalone job runtime validation
- repo isolation and CI ownership
- schema and migration ownership
- dedicated DB bootstrap and cutover planning
- dedicated DB support-table gating

Next recommended worker:
- pre-validation UX cleanup pass

Next recommended stage:
- pre-validation UX cleanup, then side-by-side numeric validation against V1

Next standalone extraction worker:
- actual dedicated database provisioning and cutover execution

## Pending Work

### Next up

- pre-validation UX cleanup, then validation and polish

Current cleanup priority before the validation pass:
- chart axis and chart-polish pass
- date-range preset parity pass
- global refresh-status bar parity pass

Current standalone extraction priority:
- actual dedicated database provisioning, data copy, validation, and cutover execution from the new owned migration set

## Next Stages

### A. Side-by-Side Numeric Validation

Status: pending

Goal:
- verify that EcomDash2 materially matches V1 output on live data for the highest-value reporting surfaces

Validation priority:
1. Overview
2. Shopify Profit
3. Paid Media all-channels
4. Paid Media Meta / Google / TikTok
5. Shopify Products
6. Shopify Inventory
7. Shopify Funnel
8. Email
9. Creative

Recommended baseline ranges:
- trailing 30 days
- previous period for the same 30-day span
- month to date

Expected deliverable:
- one discrepancy matrix with:
  - page
  - metric or surface
  - V1 value
  - V2 value
  - delta
  - explanation
  - severity

### B. Discrepancy Fix Loop

Status: pending

Goal:
- fix only real parity defects or source-of-truth violations discovered during validation

Rules:
- prioritize loader/formula/data-shape bugs before visual polish
- preserve EcomDash2 product decisions where docs intentionally differ from V1
- do not reintroduce V1 wrapper systems while chasing parity

Expected deliverable:
- a short accepted-fixes log linked back to the discrepancy matrix

### C. Shared Infrastructure Hardening

Status: pending

Goal:
- make the intentionally shared infra relationship explicit, observable, and lower-risk while EcomDash2 still piggybacks the shared Turso database and jobs

Focus areas:
- env parity and local runtime setup
- workspace-default correctness
- table freshness visibility
- connector/backfill/job dependency inventory
- smoke checks for the key shared tables each page depends on

Expected deliverables:
- a small runtime/data smoke-check workflow
- a documented inventory of:
  - shared raw tables
  - shared contract/report tables
  - shared sync/job tables
  - which EcomDash2 pages depend on which tables

### D. Cutover-Readiness Review

Status: pending

Goal:
- decide what remains before EcomDash2 can be treated as the primary dashboard surface, even if infra is still shared

Checklist focus:
- page coverage complete
- validation pass complete
- no runtime sibling-code dependencies
- known intentional differences documented
- remaining shared-infra dependencies documented
- operator setup documented

Expected deliverable:
- one cutover-readiness note with:
  - ready now
  - ready after fixes
  - deferred to later extraction

### E. Full Standalone Extraction

Status: active handoff phase

Goal:
- move EcomDash2 from runtime-isolated but infra-shared to a standalone repo that can keep using the shared database first, then optionally take on dedicated-db ownership later

Current reality:
- EcomDash2 can run as its own Next app from `EcomDash2/TRS_Starter_Core`
- the root package identity is now `ecomdash2-app`
- EcomDash2 no longer depends on sibling `dashboard/**` at runtime
- app-owned workflow files now include scheduler ownership plus `ecomdash2-ci.yml` for lint, typecheck, and build
- app-owned migrations now exist under `lib/db/migrations/**` for the keep-boundary subset
- EcomDash2 still intentionally depends on shared infrastructure:
  - shared Turso database
  - shared raw, report, contract, and status tables
  - broader live connector validation on the shared runtime

Standalone milestones:

#### Milestone 1. Repo-standalone

Goal:
- move `EcomDash2/TRS_Starter_Core` into its own repo and run it independently while it still points at the shared Turso database and shared jobs

Required outcomes:
- package and app identity no longer use starter defaults
- app-owned CI workflows exist for lint, typecheck, and build
- local setup, deploy assumptions, and secrets are documented from the EcomDash2 root
- no runtime assumptions remain about the parent repo layout

Current status:
- runtime and ops ownership are accepted
- extraction handoff docs are now the active cleanup step
- the next practical move is to extract the folder into its own repo and update workflow `working-directory` to `.`

#### Milestone 2. Data-standalone

Goal:
- give EcomDash2 its own schema ownership and dedicated database while still allowing controlled shared-data bootstrap during migration

Required outcomes:
- app-owned migrations exist for the `Keep` table set
- a fresh EcomDash2 database can be created from app-owned schema
- required shared business-truth, raw, report, and contract data can be copied or bootstrapped into the dedicated DB
- EcomDash2 can run against the dedicated DB without code changes

Current status:
- schema and migration ownership is accepted
- dedicated bootstrap tooling and cutover planning are accepted
- actual dedicated database provisioning and cutover execution remain optional and pending

#### Milestone 3. Fully standalone app

Goal:
- EcomDash2 owns its own connector/backfill jobs, API triggers, deployment, and operational workflows without depending on any shared infra

Required outcomes:
- app-owned job/connector inventory is complete
- app-owned schedules or triggers exist for data freshness
- deployment and rollback ownership are documented and wired
- shared infrastructure is no longer required for runtime or operations

Recommended next sequence from here:
1. Extract `EcomDash2/TRS_Starter_Core` into its own repo
2. Move the `ecomdash2-*.yml` workflow files and update `working-directory` to `.`
3. Validate the shared-DB runtime from the new repo
4. Decide later whether dedicated-db work is worth doing

Immediate standalone-data next steps:

1. Provision a dedicated Turso database and apply the owned migration set
2. Copy the owned shared-now tables into that database in bounded, verifiable batches
3. Run dedicated-DB smoke checks for contracts, freshness, and status writes
4. Update runtime and workflow secrets only after the dedicated target passes validation

Expected deliverable:
- one standalone-extraction plan with:
  - minimum repo-isolation milestone
  - minimum standalone-data milestone
  - full standalone-app milestone

Supporting audit:
- `docs/ecomdash2/job-extraction-audit.md`

Current extraction recommendation:
- do not rewrite the ingestion/database model from scratch first
- keep the current database(s) during the first standalone phase
- extract job ownership by porting the proven V1 runners/connectors into EcomDash2-owned code
- leave diagnostics/change-event systems out of the first extraction wave
- move scheduler ownership into committed EcomDash2 workflow files rather than remote-only setup scripts

## Outstanding Risks and Notes

### Live data verification still pending in multiple slices

Accepted slices often passed lint/typecheck but did not always get a full live Turso-to-V1 numeric comparison.

Most important remaining validation areas:
- Overview numbers against V1 for a sample date range
- Shopify Profit numbers against V1 for a sample date range
- Paid Media all-channels numbers against V1 for a sample date range
- Paid Media platform-route numbers against V1 for a sample date range
- Creative inline playback against a present real or demo video asset
- Settings save/read-back in a real Turso-configured environment
- Shopify Products browser validation and sample-number comparison against V1 for a selected range
- Shopify Inventory browser validation and sample-number comparison against V1 for a selected range
- Shopify Funnel rendered comparison against V1 for a selected range, especially where Shopify analytics freshness may diverge from `fact_orders`
- Email rendered comparison against V1 for a selected range once a canonical placed-orders source decision is finalized

### Temporary backend bootstrap exceptions still exist

- none at runtime-code level

Remaining intentional shared infrastructure:
- shared Turso database
- shared reporting and business-truth tables during the rebuild phase

### UI governance remains mandatory

For every frontend slice:
- use `/preview/dashboard-patterns` as the visual source of truth
- stay within approved pattern families
- keep page-specific markup inline unless reuse is proven
- do not introduce alternate chart/table/wrapper systems

## Worker Review Notes

When reviewing worker returns, keep checking:
- product docs beat V1 when they conflict
- no V1 UI imports
- no accidental cross-app runtime coupling
- no unapproved reusable wrappers
- no drift from `/preview/dashboard-patterns`
- no non-namespaced EcomDash2-specific state keys

## Update Rule

After each accepted worker output:
- update progress estimate
- append or revise the relevant accepted-work section
- move the sequence forward if needed
- record any new temporary exception or important testing gap
