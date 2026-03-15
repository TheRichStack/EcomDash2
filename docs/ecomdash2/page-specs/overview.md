# Overview Page Spec

Status: locked for v1

## Route

`/dashboard`

## Page job

Give the founder the fastest trustworthy picture of store performance for the selected date range.

## Keep from current app

- cross-domain topline thinking
- date range as the main control
- profit and revenue visibility on the first screen

## Remove from current app

- warning card
- domain strip / domain radar
- action rail / decision queue
- summary-specific exception language

## Proposed structure

1. KPI strip
2. MTD plan vs actual pacing board
3. Period snapshot
4. Daily trend chart
5. Channel summary table
6. Secondary reporting modules

This order is fixed in v1.

## Locked KPI strip

- total revenue
- ad spend
- MER
- orders
- AOV
- net profit

This page should ship with 6 cards by default.

## KPI customization direction

- the 6-slot top strip can be customized
- shipped default remains the starting preset
- the rest of the Overview page stays fixed in v1
- customization should pull from an approved metric list for Overview
- customization is saved workspace-wide in v1
- no drag-and-drop or arbitrary module reordering in v1

## Locked secondary modules

- top products
- top creatives
- email snapshot

## Pacing board

Keep a compact month-to-date pacing module on Overview.

Purpose:

- show whether selected business metrics are on pace for the month
- work out of the box using a baseline-derived expected target
- allow an explicit target to override the baseline when the workspace has one

Default behavior:

- metrics shown in this module are configurable
- if a workspace target exists, use it
- if no target exists, use baseline fallback
- avoid critical or warning chips in v1 unless the design later proves they add clarity
- include a clear `Configure targets` link or button that routes to `Settings > Inputs > Targets`

Default metrics:

- revenue
- net profit
- MER
- orders

Recommended data columns:

- metric
- actual MTD
- expected MTD
- delta
- forecast end of month
- source: target or baseline

Recommended visual treatment:

- do not use a generic progress bar that reads like calendar progress
- use a pace marker or bullet-chart style visual instead
- actual should be compared against expected-to-date, not against simple month completion
- keep it always visible in v1
- keep it compact enough that it does not consume most of the above-the-fold area
- do not rely on collapse behavior to control page density

## Period snapshot

Keep a compact period snapshot module high on the Overview page.

Purpose:

- summarize the selected period clearly
- provide a fast read on the current period before the user moves into larger charts and tables
- allow deeper detail only when requested

Recommended behavior:

- compact by default
- not collapsible in v1
- preserve the usefulness of the current V1 period snapshot without the current visual sprawl

Default rows:

- today
- yesterday
- last 7 days
- last month

Default row content:

- primary metric: revenue
- supporting metric: net profit
- supporting metric: MER
- one comparison delta

Recommended placement:

- directly below the pacing board
- above the trend chart and larger reporting tables

Recommended design direction:

- small default footprint
- quieter and easier to scan than the current V1 version
- do not rely on collapse behavior to manage space

Locked defaults:

- the page keeps all three secondary modules in v1: top products, top creatives, and email snapshot
- pacing board default metrics are revenue, net profit, MER, and orders
- pacing board maximum configurable rows is 4
- period snapshot default rows are today, yesterday, last 7 days, and last month
- period snapshot default row content is revenue, net profit, MER, and one comparison delta
- channel summary ranks by revenue
- main overview trend uses a metric toggle rather than a combined chart
- pacing configuration is workspace-wide and managed from `Settings > Inputs > Targets`
