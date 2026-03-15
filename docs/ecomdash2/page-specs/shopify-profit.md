# Shopify Profit Page Spec

Status: locked for v1

## Route

`/dashboard/shopify/profit`

Sidebar group:

- `Shopify`
  - `Profit`
  - `Products`
  - `Inventory`
  - `Funnel`

## Page job

Provide a clean P and L style reporting page for the selected period.

## Keep from current app

- summary cards for sales, marketing, COGS, and net profit
- profit trend chart
- breakdown table
- comparison modes where they stay simple

## Remove from current app

- profit brief
- diagnose section
- alert sensitivity toggle
- anomaly language in header copy

## Proposed structure

1. KPI strip
2. Timeframe and comparison controls
3. Profit trend chart
4. Breakdown table

## Locked KPI strip

- total sales
- marketing costs
- COGS
- contribution margin
- net profit

This page should ship with 5 cards by default.

No 6th KPI is added in v1 just to force an even grid.

Locked defaults:

- the page ships with 5 KPI cards in v1
- taxes stay in the breakdown table only
- both previous period and previous year comparisons stay in v1
- overhead remains allocated daily exactly as in the current page for v1
