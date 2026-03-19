# EcomDash2 Dashboard Patterns

## Purpose

Define the approved UI patterns for the dashboard rebuild.

Visual reference:

- `/preview/dashboard-patterns`

Important:

An approved pattern is not automatically a shared component.

It is first a canonical composition.

Only promote it into `components/shared` or `components/layout` when reuse is proven.

## Pattern 1: App shell

Use for:

- dashboard sidebar
- app header
- route container

Built from:

- `Sidebar`
- layout wrappers in `components/layout`
- `Separator`
- `Breadcrumb` when needed

Ownership:

- `components/layout`

Rule:

- there should be one app-shell structure for the dashboard

## Pattern 2: Page header

Use for:

- page title
- short descriptive copy
- top-level actions
- period or mode controls when page-specific

Built from:

- existing `SectionHeader` if it fits
- otherwise inline composition using heading, muted text, and action area

Ownership:

- inline first
- promote only when multiple pages truly share the same structure

## Pattern 3: KPI strip

Use for:

- the top metric row on overview and major pages

Built from:

- a responsive grid
- approved KPI card composition

Ownership:

- inline strip layout
- individual KPI card may become shared

Rule:

- each page gets one KPI-strip pattern
- do not invent alternate strip layouts page by page

## Pattern 4: KPI card

Use for:

- single primary metric
- optional comparison delta
- optional supporting context

Built from:

- `Card`
- `Badge` only when justified
- semantic text tokens

Ownership:

- may become `components/shared` once reused across pages

Rule:

- keep it compact and number-first
- do not create multiple stylistic families of metric card

## Pattern 5: Filter toolbar

Use for:

- sort
- anomaly or status filter
- search
- view mode toggle
- date or scope controls that are local to the table or grid

Built from:

- `Input`
- `Select`
- `Button`
- `Tabs` or `ToggleGroup` if installed and justified
- `DropdownMenu` for overflow actions

Ownership:

- inline first
- promote only if the same structure repeats with stable props

Rule:

- one canonical toolbar rhythm across data-heavy pages

## Pattern 6: Chart card

Use for:

- trend charts
- funnel visuals
- compact comparison charts

Built from:

- `Card`
- chart header area
- inline chart body
- tabs or metric toggles where already specified
- optional contrasted bottom strip for compact secondary metrics

Ownership:

- chart shell may become shared
- chart internals stay inline unless multiple pages share the exact same contract

Rule:

- do not create a generic chart framework
- prefer one shell pattern with page-specific chart content
- use a split lower strip when quick secondary metrics improve readability without adding another full card row

## Pattern 7: Table shell

Use for:

- operational tables
- reporting tables
- campaign, product, and inventory surfaces

Built from:

- filter toolbar
- `Card` when needed
- `Table`
- empty, loading, and pagination states

Ownership:

- may become shared if repeated exactly

Rule:

- one table-shell rhythm across pages
- no alternate bespoke table layouts unless the page spec requires it

## Pattern 8: Detail sheet

Use for:

- right-side detail panels
- mobile detail drawer or sheet
- campaign, flow, and entity drilldown details

Built from:

- `Sheet`
- header, content, and footer sections
- `Separator`
- cards inside the sheet only when needed

Ownership:

- likely shared once more than one page uses it

Rule:

- use one canonical detail-sheet behavior across the app

## Pattern 9: Empty state

Use for:

- no data
- no filters matched
- not configured yet

Built from:

- existing `EmptyState` if it fits
- otherwise the approved empty-state composition

Ownership:

- shared

Rule:

- do not build page-specific empty-state styles casually

## Pattern 10: Loading state

Use for:

- initial page loading
- chart loading
- table loading

Built from:

- `Skeleton`
- layout-matching placeholders

Ownership:

- shared helper fragments allowed

Rule:

- no custom pulse div systems

## Pattern 11: Section stack

Use for:

- the vertical rhythm of dashboard sections within a page

Built from:

- `flex flex-col gap-*`
- `Separator` when a break is needed

Ownership:

- inline

Rule:

- pages should share a calm, consistent section rhythm

## Promotion map

Most likely shared first:

- KPI card
- filter toolbar
- chart card shell
- table shell
- detail sheet helpers

Keep inline longer:

- full KPI strips
- page-specific section layouts
- page-specific chart bodies
- domain-specific card internals
