# Shopify Inventory Page Spec

Status: locked for v1

## Route

`/dashboard/shopify/inventory`

Sidebar group:

- `Shopify`
  - `Profit`
  - `Products`
  - `Inventory`
  - `Funnel`

## Page job

Show stock position and risk clearly, without turning inventory into an alert engine.

## Keep from current app

- inventory status usefulness
- stock risk visibility
- product-level detail
- current table-first workflow
- velocity-window controls
- search, sort, and stock/status filtering
- days-left and estimated stockout visibility

## Remove from current app

- diagnosis language
- warning systems beyond real stock state
- extra surface area not tied to inventory decisions

## Proposed structure

1. KPI strip
2. Inventory table with velocity controls, search, sort, and stock filters
3. No separate alert engine in v1; at-risk views come from the same table model

## Locked KPI strip

- tracked variants
- total units in stock
- at-risk variants
- out-of-stock variants

## Locked first-build table columns

- Product
- Variant
- SKU
- Stock
- Sold (selected velocity window)
- Rate / day
- Days left
- Estimated stockout
- Status

Locked defaults:

- preserve the current inventory page behavior as the functional baseline, then rebuild the UI shell in EcomDash2
- keep estimated stockout date and days-left visibility in the table
- keep the page table-first in v1
- do not add extra inventory-specific workflow or alert chrome beyond the current operational surface
- use the current inventory table column set as the mandatory first-build baseline
