# EcomDash2 UI Guardrails

## Purpose

Prevent design-system drift while multiple agents build EcomDash2.

The starter already provides a shadcn-based UI foundation.

These guardrails define how EcomDash2 must extend that foundation without inventing a second design system.

Visual reference:

- use `/preview/dashboard-patterns` as the canonical preview route for approved dashboard compositions

## Core rule

EcomDash2 is built from:

- existing shadcn primitives in `components/ui`
- approved starter assemblies in `components/shared` and `components/layout`
- page-specific inline markup when reuse is not yet proven

EcomDash2 is not a place to invent a parallel wrapper library.

## Authority order

When a worker is unsure, use this order:

1. relevant page spec in `docs/ecomdash2/page-specs/`
2. `docs/ecomdash2/dashboard-patterns.md`
3. `docs/ecomdash2/forbidden-abstractions.md`
4. `docs/ecomdash2/design-philosophy.md`
5. starter docs in `docs/`
6. V1 reference code only for behavior, not UI structure

## Build-from rule

Workers should build from:

- `Card`
- `Tabs`
- `Table`
- `Sheet`
- `Dialog`
- `Badge`
- `Button`
- `Select`
- `DropdownMenu`
- `Input`
- `Textarea`
- `Skeleton`
- `Separator`
- `Sidebar`
- approved starter shared components when they already exist

If those are enough, do not invent a new abstraction.

## Inline-first rule

Keep markup inline in the route or feature file when:

- it is specific to one page
- the behavior is still settling
- reuse is not yet proven
- the abstraction would mostly rename shadcn primitives without adding real value

Do not promote a page section into `components/shared` just because it looks tidy.

## Promotion rule

Promote something into a reusable component only if all of these are true:

- it appears in at least 2 real pages or task slices
- its composition is stable
- its props are obvious and small
- it does more than rename a shadcn primitive
- the PM or reviewer can point to the approved pattern it belongs to

If any of those are unclear, keep it inline.

## One-pattern rule

For each repeated UI job, EcomDash2 should converge on one approved pattern.

Examples:

- one KPI-card pattern
- one filter-toolbar pattern
- one chart-card pattern
- one table-shell pattern
- one detail-sheet pattern

Workers should not create alternate versions casually.

## Styling rule

- use semantic tokens from `app/globals.css`
- use existing shadcn variants first
- keep typography and spacing consistent with the starter
- do not hard-code new color systems inside page components
- do not create one-off tone systems for status, risk, or urgency

## Chart and table rule

Charts and tables are the highest-risk areas for drift.

Rules:

- chart shells should use the approved chart-card pattern
- table screens should use the approved table-shell and filter-toolbar patterns
- do not create page-specific micro-frameworks around charts or tables
- if a page needs a genuinely new interaction model, document it in the work order first

## Allowed reusable component categories

These are the only categories that should normally become reusable dashboard components:

- KPI card
- section or page header
- filter toolbar
- chart card
- table shell
- empty state
- loading state
- detail sheet

Anything else needs explicit justification.

## Review questions

Before merging UI work, ask:

- did this use approved patterns
- did this invent a new wrapper unnecessarily
- could this have stayed inline
- did this create a second style language
- did this introduce a second table or chart system

If the answer is yes, the task likely drifted.
