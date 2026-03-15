# Metrics Engine

## Goal

Use the metrics library as the calculation and naming backbone of EcomDash2, not just as a surface-level settings feature.

## Existing assets to reuse

- app-owned full catalog definitions under `lib/metrics/definitions/*.json`
- app-owned runtime registry under `lib/metrics/registry.ts`
- app-owned metric types under `types/metrics.ts`
- V1 metric-definition and registry files remain reference-only when parity checks are needed
- `docs/METRICS_LIBRARY.md`

## Proposed role in EcomDash2

- page specs should name important KPIs by metric id where possible
- derived metrics should come from the registry or a thin adapter around it
- metric labels, units, and gotchas should stay centralized
- page components should not each redefine business logic for the same KPI
- top KPI-strip customization should select from allowed metric ids, not arbitrary labels or formulas

## V1 UX recommendation

Default position:

- keep metric logic central
- keep metric editing minimal
- avoid reintroducing the large metrics console as a default user workflow

Possible v1 options:

- no metrics page at launch
- read-only metrics catalog in Settings
- small admin-only override flow if truly required for business inputs
- KPI-strip configuration UI without exposing the full legacy metrics console
- pacing metric selection from `Settings > Inputs > Targets`, using canonical metric ids

Locked for v1:

- expose a read-only metrics catalog in Settings
- do not expose editable metric overrides as part of the standard v1 workflow

## Decisions to make

- Which metrics are canonical for each v1 page?
- Which current placeholder input metrics still matter in the new product?
- Do workspace-level metric overrides stay in UI, or move to a lower-priority admin path?
- Should page configs reference metric ids directly so layouts stay tied to the registry?
- KPI-strip customization is stored at workspace level in v1.
