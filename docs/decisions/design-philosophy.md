# EcomDash2 Design Philosophy

## Core shift

The old dashboard was exception-first.

EcomDash2 is reporting-first.

The primary question is:

`What happened in this date range, and where do I see it clearly?`

## Page model

Each reporting page should usually follow this order:

1. KPI strip
2. Primary trend chart
3. Main breakdown table
4. Optional secondary modules only if they add real reporting value

This is intentionally simpler than `Brief > Diagnose > Investigate`.

## What the UI should optimize for

- fast scanning
- trustworthy numbers
- obvious comparisons
- predictable layouts
- low maintenance code

## What the UI should not try to do

- rank what needs attention
- guess causes
- generate narratives
- surface artificial warnings
- add layers just because the old app had them

## Comparisons

Default comparison behavior should be simple:

- previous period by default where useful
- previous year only where seasonality matters
- clear date labels on every chart and table

For month-to-date pacing:

- compare actual MTD against expected MTD
- if a target exists, expected MTD should derive from the target
- if no target exists, expected MTD should derive from baseline fallback
- visuals should not look like calendar-completion bars

## Metrics library role

The metrics library should power the dashboard internally:

- page specs should refer to canonical metric ids
- labels and definitions should come from the registry where practical
- calculation drift should be caught at the metric layer, not by page-specific hacks

The metrics library does not need a heavy v1 admin UX.

## KPI customization

V1 can support limited customization where it makes the biggest product difference:

- each page ships with a default top KPI strip
- the top KPI strip can be customized
- the rest of the page layout stays fixed in v1

Guardrails:

- customization should be slot-based, not freeform page building
- each page should expose an approved metric pool, not the entire registry
- metric formulas, labels, and definitions still come from the canonical registry
- default presets ship first; customization is an override layer, not the primary design method
- no drag-and-drop page layout system in v1

## Visual principles

- keep cards quiet and consistent
- use charts only when trend is the point
- use tables when ranking or detail is the point
- avoid decorative surfaces that duplicate the same number in multiple places
- keep filters close to the data they affect
- high-priority overview modules should be compact enough that they do not depend on collapse behavior in v1

## Guardrails

- if a page section cannot justify itself with a clear reporting job, cut it
- if shadcn primitives solve the UI cleanly, do not invent a wrapper
- if a pattern is used once, keep it in the page
