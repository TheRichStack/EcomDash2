# Shopify Funnel Page Spec

Status: locked for v1

## Route

`/dashboard/shopify/funnel`

Sidebar group:

- `Shopify`
  - `Profit`
  - `Products`
  - `Inventory`
  - `Funnel`

## Page job

Show the store funnel clearly for the selected period without reintroducing exception-first UX.

## Keep from current app

- useful funnel metrics
- trend visibility
- table and chart depth where it genuinely helps understand conversion flow

## Remove from current app

- brief blocks
- diagnose cards
- anomaly framing
- exception-only investigation flow

## Proposed structure

1. KPI strip
2. Funnel trend or stage chart
3. Breakdown table
4. Optional segment views only if they stay reporting-first

## Locked KPI strip

- sessions
- add to cart rate
- checkout rate
- purchase conversion rate
- orders
- revenue

Locked defaults:

- store-level funnel is the primary surface
- lower-page drilldown can provide deeper detail
- mandatory funnel stages are sessions, add to cart, checkout, and purchase
- include both a stage-conversion visual and a daily trend view in v1
