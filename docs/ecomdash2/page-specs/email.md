# Email Page Spec

Status: locked for v1

## Route

`/dashboard/email`

The sidebar has one `Email` item. `Campaigns` and `Flows` are in-page tabs.

## Page job

Show email revenue contribution and the performance of campaigns and flows for the selected range.

## Keep from current app

- campaigns reporting
- flows reporting
- Klaviyo revenue visibility
- table-first campaigns workflow
- flow list plus detail workspace pattern
- click-through detail behavior

## Remove from current app

- brief cards
- diagnosis framing
- anything that hides the actual reporting tables
- anomaly-first language in controls and sorting labels

## Proposed structure

1. KPI strip
2. Shared `Campaigns` / `Flows` tabs
3. Tab-specific content area

This stays one route, but not one long combined scroll surface.

## Shared page frame

- one `Email` route in the sidebar
- one shared page header
- one shared KPI strip
- tabs for `Campaigns` and `Flows`

## Campaigns tab

Keep the current table-first structure as the main reference.

Recommended layout:

1. compact filter / search / sort row
2. campaigns table
3. clicking a campaign opens detail in a right-side panel on desktop
4. mobile uses a sheet instead of a permanent side panel

## Flows tab

Keep the current split workspace idea.

Recommended layout:

1. compact filter / search / sort row
2. left list of flows
3. right detail panel for the selected flow
4. mobile uses a sheet or stacked detail view

## Detail panel direction

Use one consistent detail interaction model across both tabs:

- select a row or card
- open details on the right on desktop
- use a sheet on smaller screens

This keeps the Email page feeling like one product surface rather than two unrelated pages.

## Flow sequence visualization

Sequence visualization should stay in scope if the underlying data supports it.

Recommended v1 behavior:

- add a dedicated sequence section inside flow detail
- if sequence data is unavailable, show a clean empty state rather than fake structure
- do not block the rest of the Email page on sequence support

## Locked KPI strip

- email revenue
- sends
- open rate
- click rate
- revenue per recipient
- placed orders

This page should ship with 6 cards by default.

Locked defaults:

- `Campaigns` is the default Email tab
- use all six locked KPI-strip metrics in v1
