# Contract Refresh Modules

This folder is for the standalone contract refresh pipeline used by EcomDash2-owned jobs.

First-wave scope:

- `contract_daily_overview`
- `contract_daily_channel_campaign`
- `contract_creative_performance`

Deferred from first wave:

- `contract_product_daily`

This keeps the contract rebuild scope aligned with the current EcomDash2 page boundary.

The current contract-refresh runner rebuilds these three tables only.
