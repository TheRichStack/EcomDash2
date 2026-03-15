# Shopify Products Page Spec

Status: locked for v1

## Route

`/dashboard/shopify/products`

Sidebar group:

- `Shopify`
  - `Profit`
  - `Products`
  - `Inventory`
  - `Funnel`

## Page job

Show product-level revenue and profit performance for the selected range.

## Keep from current app

- current table-first workflow
- product-level table depth
- sortable ranking behavior
- date range filtering
- product / SKU / variant breakdown
- CSV export
- tag filtering
- search
- gross profit and refund visibility
- sales velocity metrics

## Remove from current app

- brief cards
- diagnose workflow
- investigate framing

## Proposed structure

1. KPI strip
2. Product performance table with breakdown switch, tag filter, search, and CSV export
3. No mandatory secondary chart in v1

## Candidate KPI strip

- product revenue
- units sold
- gross profit
- net profit
- refunds
- return rate

## Locked first-build table columns

- Product
- SKU
- Variant when variant breakdown is selected
- Total Sales
- Orders
- Qty Sold
- Qty Refunded
- Refund Amount
- Product Costs
- Gross Profit
- Margin %
- Price Reduction %
- Sales Velocity (7D)
- Sales Velocity (30D)

Locked defaults:

- the page stays profit-aware in v1
- keep variant-level detail in v1
- keep the page table-first in v1
- preserve the current page behavior as the functional baseline, then rebuild the UI shell in EcomDash2
- use the current product table column set as the mandatory first-build baseline
