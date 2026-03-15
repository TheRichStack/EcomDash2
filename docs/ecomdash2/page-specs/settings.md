# Settings Page Spec

Status: locked for v1

## Route

`/dashboard/settings`

Internal Settings routes:

- `/dashboard/settings/workspace`
- `/dashboard/settings/dashboard`
- `/dashboard/settings/inputs/costs`
- `/dashboard/settings/inputs/budgets`
- `/dashboard/settings/inputs/targets`
- `/dashboard/settings/metrics`
- `/dashboard/settings/syncs`

## Page job

Support data collection and business inputs without turning Settings into a second product.

## Keep from current app

- integrations and token management
- costs
- budgets
- targets
- sync and job status

## Remove from current app

- large power-user metrics console as default UX
- broad admin tooling that does not directly support reporting
- any controls created only to support old anomaly logic

## Locked information architecture

- `Settings` stays a single main sidebar item
- settings subsections use real internal routes, not query-param state
- `Costs`, `Budgets`, `Targets`, and `Metrics` do not become first-level app nav items
- do not carry forward the old split between a main settings route, a separate metrics route, and hidden nested input state

## Proposed sections

1. Workspace
2. Dashboard
3. Inputs
4. Metrics
5. Syncs

## Section breakdown

### Workspace

- integrations and token management
- runtime or workspace configuration that directly affects reporting

### Dashboard

- workspace-wide KPI strip configuration
- short links into related setup areas when a reporting surface depends on missing inputs

### Inputs

- costs
- budgets
- targets

#### Inputs > Costs

Locked v1 scope:

- default margin % fallback
- payment fee %
- shipping %
- returns allowance %
- monthly overhead
- SKU cost overrides

Rules:

- `default margin %` is a fallback only when SKU-level unit cost is missing
- monthly overhead remains part of the net-profit and pacing model
- preserve the current SKU override workflow, but rebuild the UI shell

#### Inputs > Budgets

Locked v1 scope:

- monthly channel budgets
- CSV import
- paste from spreadsheet
- import mapping
- annual and monthly budget generators
- effective planned-budget preview

Rules:

- preserve the current planning workflow and data shape in v1
- budgets remain channel-aware rather than collapsing to one store-level number
- rebuild the surface in the new UI system rather than carrying forward the current console layout

#### Inputs > Targets

Locked v1 scope:

- monthly revenue and profit targets
- CSV import
- paste from spreadsheet
- import mapping
- annual target generator
- monthly target table and preview
- pacing metric selection for the Overview board

Rules:

- preserve the current target-planning workflow and data shape in v1
- target values remain workspace-wide
- explicit targets override baseline fallback where pacing uses them
- pacing metric selection is configured here, not in a separate settings area
- rebuild the surface in the new UI system rather than carrying forward the current console layout

### Metrics

- slim metrics catalog in v1
- not a large general-purpose power-user console
- read-only in v1

### Syncs

- connector status
- last-sync visibility
- lightweight recent sync or job visibility to explain data freshness
- no heavy admin job console in v1

## Pacing configuration

The workspace should be able to choose which metrics appear in the Overview pacing board.

Rules:

- configuration is workspace-wide in v1
- each pacing row points to a canonical metric id
- explicit targets override baseline fallback
- if no target is configured, the dashboard still works using derived expected values
- the UI should stay small and task-specific, not become a general metrics console
- pacing metric selection lives inside `Inputs > Targets`
- the Overview pacing board should expose a clear `Configure targets` navigation affordance
- `Dashboard` settings may link to target configuration, but do not own pacing setup

## Locked defaults

- Settings uses internal routes under one sidebar item
- Inputs stay grouped under Settings rather than becoming standalone app navigation items
- pacing metric configuration lives under `Inputs > Targets`
- add an obvious navigation affordance from the Overview pacing surface to the target configuration screen
- `Metrics` is visible in v1 as a read-only catalog
- `Syncs` stays lightweight: connector freshness plus recent operational history
- `Inputs > Costs` keeps the current v1 cost model and fallback logic
- `Inputs > Budgets` keeps the current planning workflow and import/generator tooling
- `Inputs > Targets` keeps the current target-planning workflow and owns pacing metric selection
