# EcomDash2 Forbidden Abstractions

## Purpose

List the abstraction patterns that most often create UI drift in multi-agent dashboard builds.

These are disallowed unless the PM explicitly approves an exception.

## Rule

Do not create a new abstraction just to avoid writing markup.

If a wrapper mostly renames shadcn primitives, it should not exist.

## Forbidden category 1: Parallel design-system components

Disallowed examples:

- `metric-panel`
- `insight-card`
- `analytics-tile`
- `performance-widget`
- `data-surface`

Why:

- they usually duplicate `Card`
- they create alternate styling rules
- they spread quickly across pages without real justification

## Forbidden category 2: Alternate shell systems

Disallowed examples:

- a second sidebar abstraction
- page-frame wrappers that hide layout decisions
- route shells that duplicate `components/layout`

Why:

- shell drift becomes expensive fast
- the starter already has layout boundaries

## Forbidden category 3: Generic chart frameworks

Disallowed examples:

- `universal-chart-panel`
- `chart-surface`
- `analytics-chart-wrapper`
- page-specific chart micro-frameworks

Why:

- chart requirements vary by page
- over-generalizing too early makes simple pages harder to build

Use the approved chart-card shell instead.

## Forbidden category 4: Competing table systems

Disallowed examples:

- separate table wrappers per domain
- page-specific row rendering frameworks
- alternate toolbar systems for each table page

Why:

- tables are core product surfaces
- inconsistency here is one of the fastest ways to create drift

## Forbidden category 5: Severity and urgency systems

Disallowed examples:

- custom chip systems for critical or warning states
- new anomaly surfaces
- invented urgency taxonomies
- action queues or recommendation rails

Why:

- these are explicitly out of scope for EcomDash2
- they recreate V1 product baggage

## Forbidden category 6: Wrapper-only forms

Disallowed examples:

- custom field stacks that hide shadcn form primitives
- new input groups that duplicate installed primitives
- custom settings layout systems without reuse proof

Why:

- they make forms harder to inspect
- they hide structure without adding real value

## Forbidden category 7: Page-local design languages

Disallowed examples:

- a unique card family for Paid Media only
- a separate badge language for Creative only
- a custom typography system on one page
- ad hoc background treatments per route

Why:

- EcomDash2 should feel like one product
- page distinction should come from content, not disconnected UI systems

## Forbidden category 8: Premature shared components

Disallowed examples:

- promoting a page section after one use
- extracting wrappers because the JSX feels long
- moving unstable compositions into `components/shared`

Why:

- early extraction locks in weak abstractions
- inline markup is often the cleaner choice during the first pass

## PM exception standard

An exception needs all of these:

- a named use case
- at least 2 real consuming pages or a clear near-term need
- a small prop surface
- evidence that inline composition is becoming harder to maintain
- confirmation that the new abstraction fits `dashboard-patterns.md`

If those are not true, the abstraction should not be created.
