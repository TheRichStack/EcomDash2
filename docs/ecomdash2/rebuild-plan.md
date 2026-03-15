# EcomDash2 Rebuild Plan

## Goal

Rebuild EcomDash as a smaller, cleaner, standalone dashboard app inside `EcomDash2/TRS_Starter_Core`, using the starter shell plus native shadcn components.

The new app should be easy to move out of this workspace later without carrying legacy UI patterns or dead code.

## Product boundary

Use the current workspace for:

- proven data access patterns
- Turso schema and migrations
- connector jobs and backfill flow
- GitHub Actions scheduling
- metric definitions and formulas
- demo data from Fibre Fizz where it reduces rebuild effort

Do not copy forward:

- summary action rail
- domain radar
- decision queue
- anomaly scoring surfaces
- brief / diagnose / investigate wrappers as a product rule
- warning and severity systems that invent urgency
- large custom UI abstraction layers when shadcn composition is enough

## Proposed route map

Base assumption for v1:

- `/dashboard` - overview
- `/dashboard/paid-media`
- `/dashboard/paid-media/meta`
- `/dashboard/paid-media/google`
- `/dashboard/paid-media/tiktok`
- `/dashboard/paid-media/creative`
- `/dashboard/shopify/profit`
- `/dashboard/shopify/products`
- `/dashboard/shopify/inventory`
- `/dashboard/shopify/funnel`
- `/dashboard/email`
- `/dashboard/settings`
- `/dashboard/settings/workspace`
- `/dashboard/settings/dashboard`
- `/dashboard/settings/inputs/costs`
- `/dashboard/settings/inputs/budgets`
- `/dashboard/settings/inputs/targets`
- `/dashboard/settings/metrics`
- `/dashboard/settings/syncs`

Locked decisions:

- `Shopify` stays as a grouped sidebar section with nested pages
- `Shopify Funnel` stays in v1
- `Shopify Lifecycle` is deferred
- `Email` stays one sidebar item with in-page tabs for `Campaigns` and `Flows`
- `Paid Media` will be a grouped sidebar section
- `Creative` sits inside the `Paid Media` sidebar group
- the canonical paid overview route is `/dashboard/paid-media`
- `Settings` stays one sidebar item with internal real routes
- settings subpages do not become first-level app navigation items
- pacing metric configuration lives under `Settings > Inputs > Targets`

Pending route decisions:

- none

## Reuse rules

Safe to reuse with minimal change:

- metric registry shape from `dashboard/lib/metrics`
- reporting logic from current Shopify profit flows
- contract-table query patterns from `dashboard/lib/data/*`
- workspace-aware auth and data scoping

Backend boundary reference:

- `docs/ecomdash2/backend-boundary.md`
- `docs/ecomdash2/agent-operating-model.md`
- `docs/ecomdash2/ui-guardrails.md`
- `docs/ecomdash2/dashboard-patterns.md`
- `docs/ecomdash2/forbidden-abstractions.md`

Reference only, not direct carry-over:

- current route layouts under `dashboard/app/(dashboard-v3)/v3/*`
- feature UI under `dashboard/components/features/*`
- old settings metrics console UI

Page-level reuse direction already locked:

- `Shopify Products` should preserve current table behavior and variant-level drilldown on the first pass
- `Shopify Inventory` should preserve current operational workflow on the first pass
- both pages should be rebuilt in the EcomDash2 UI system rather than copied forward component-for-component

## Delivery sequence

### Phase 0 - Planning lock

- agree final page list
- agree page-level KPI sets
- agree which pages support KPI strip customization
- agree chart and table order per page
- agree where page order stays fixed rather than user-configurable
- agree metrics library role in v1
- agree design philosophy

## Implementation approach

Do not build the full UI first and then try to wire the backend afterward.

Do not fully rebuild the backend first either.

Use a hybrid approach:

1. lock the product surface and page contracts
2. stand up the shared backend foundation that every page depends on
3. build pages as vertical slices against stable view models
4. swap mock or demo-backed loaders for real reused queries page by page

This keeps momentum on the UI without creating a second round of rework once real data arrives.

## Backend planning required before page implementation

The backend does need planning, but it should stay focused and bounded.

Required planning items:

- auth and workspace model for EcomDash2
- Turso access pattern inside the new app
- shared date range handling
- page-level data contracts or view models
- which current queries and helpers are reused as-is, adapted, or rewritten
- settings persistence shape for KPI strips, pacing config, budgets, targets, and costs
- how demo data and real data switch in development
- extraction rule: no long-term imports from sibling app code

## Agent execution model

During the rebuild, the full V1 repo remains available in the same workspace.

This is intentional.

EcomDash2 needs access to the existing repo for:

- current live database integration
- schema and migrations
- proven data loaders and formulas
- connector jobs and backfill context
- UI and behavior reference where the new app must preserve capability

Control this with task boundaries, not by hiding V1 from agents.

Reference:

- `docs/ecomdash2/agent-operating-model.md`
- `docs/ecomdash2/work-orders/WORK_ORDER_TEMPLATE.md`

## Build order

### Phase 1 - Core foundation

- rename starter metadata and navigation
- add dashboard shell and grouped sidebar
- add auth shell
- add workspace selection and shared date range state
- add Turso client and environment contract in the new app
- define server-side data-loader boundaries for each page
- define shared metric, currency, and comparison helpers that EcomDash2 will own

### Phase 2 - Contract-first page scaffolds

- create route scaffolds for every locked page
- create typed page view models for every locked page
- use Fibre Fizz demo data or temporary adapters so UI can be built against stable contracts
- build shared empty, loading, and error states
- verify that the new routes and navigation work before deep feature work

### Phase 3 - Reporting slices

- build overview
- build settings early enough to support targets, budgets, costs, and KPI configuration
- build paid media
- build creative
- build Shopify profit
- build Shopify products
- build Shopify inventory
- build Shopify funnel
- build email

Recommended slice pattern for each page:

1. page shell and layout
2. stable view-model contract
3. demo-backed loader
4. real query adapter
5. verification against current dashboard output

### Phase 4 - Backend reuse and cleanup

- port only required queries and helpers
- port only required migrations and environment contracts
- point to demo data or shared DB where helpful
- remove any temporary scaffolding not earned by the final app

### Phase 5 - Extraction readiness

- ensure `EcomDash2` runs without depending on sibling app code
- reduce cross-folder imports to zero
- document deployment, env vars, and data jobs inside the new app

## Practical answer to UI first vs backend first

Recommended answer:

- build the shared backend foundation first
- then build UI page by page against typed contracts
- do not wait for every backend detail before starting the UI
- do not build presentation directly against raw legacy queries

In practice that means:

1. foundation first
2. settings plus overview first
3. then the rest of the reporting pages as vertical slices

## Definition of done for planning

Planning is complete when:

- every v1 page has a spec
- every top KPI row is locked
- every page has a route decision
- every page has a chart/table order decision
- every required backend dependency is named
- every deferred feature is explicitly marked out of scope

## Current reference points

- rebuild brief: `docs/SIMPLE_REBUILD_BRIEF.md`
- old dashboard philosophy to replace: `docs/DESIGN_PHILOSOPHY.md`
- metric registry: `dashboard/lib/metrics/registry.ts`
- current profit page reference: `dashboard/app/(dashboard-v3)/v3/shopify/profit/page.tsx`
- backend boundary and table map: `docs/ecomdash2/backend-boundary.md`

## Open decisions

- none
