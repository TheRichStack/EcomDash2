# EcomDash2 Planning

This folder is the working spec and operating reference for EcomDash2.

Legacy V1 code is reference material for data models, queries, and proven reporting logic when it is available. It is not the UI contract for the app.

Current standalone identity:

- app name: `EcomDash2 App`
- package name: `ecomdash2-app`

## Shared-DB standalone posture

EcomDash2 is now ready for repo extraction while continuing to use the shared Turso database.

Owned from this app root:

- runtime code
- standalone job runners
- connector implementations
- committed scheduler workflows under `.github/workflows/ecomdash2-*.yml`
- committed CI workflow under `.github/workflows/ecomdash2-ci.yml`
- keep-boundary migrations under `lib/db/migrations/**`
- dedicated-DB bootstrap scripts under `scripts/db/**`

Still intentionally shared or pending:

- shared Turso database
- shared raw, report, contract, and status tables
- broader live connector validation on the shared runtime

Optional later phase:

- dedicated database provisioning, validation, and final cutover execution

## Working position

- `EcomDash2` is the standalone product.
- legacy V1 behavior is reference-only, not a local runtime dependency
- reuse backend foundations, not old UI complexity
- build with shadcn primitives first and keep page-specific markup inline until reuse is obvious
- define every page before building it

## Recommended next move

If you want repo separation now:

1. extract this folder into its own repository
2. follow [post-extraction-checklist.md](post-extraction-checklist.md)
3. keep using the shared Turso database
4. defer dedicated-DB work until it is actually needed

## Docs in this folder

- `rebuild-plan.md`
- `design-philosophy.md`
- `metrics-engine.md`
- `backend-boundary.md`
- `schema-ownership.md`
- `dedicated-db-bootstrap.md`
- `post-extraction-checklist.md`
- `runtime-setup.md`
- `job-runtime-layout.md`
- `agent-operating-model.md`
- `agent/README.md`
- `ui-guardrails.md`
- `dashboard-patterns.md`
- `forbidden-abstractions.md`
- `page-specs/overview.md`
- `page-specs/paid-media.md`
- `page-specs/creative.md`
- `page-specs/shopify-profit.md`
- `page-specs/shopify-products.md`
- `page-specs/shopify-inventory.md`
- `page-specs/shopify-funnel.md`
- `page-specs/email.md`
- `page-specs/settings.md`

## Immediate decisions to lock

1. Final route map for the new dashboard.
2. Which page modules and tables are mandatory in v1.
3. Whether Settings exposes a read-only metrics catalog or editable KPI-strip customization.
4. How visible the metrics library should be in v1.

Locked so far:

- fixed grouped route structure for `Paid Media` and `Shopify`
- `Email` as one nav item with in-page tabs
- Overview KPI strip is 6 cards by default and workspace-customizable
- Overview pacing board is in scope and capped at 4 rows by default
- Overview module order stays fixed in v1
- no drag-and-drop page layout system in v1
- `Settings` stays one sidebar item with internal routes
- pacing metric configuration lives under `Settings > Inputs > Targets`
- backend boundary is defined against the shared Turso database before extraction
- agent operating rules now assume EcomDash2 may be opened without the old repo present locally
- UI drift is controlled by explicit dashboard guardrails and approved pattern docs
