# Connectors

This folder will hold app-owned connector implementations for standalone jobs.

Expected layout:

- `common/**` for shared connector runtime helpers
- one folder per connector when the port happens:
  - `shopify/`
  - `meta/`
  - `google/`
  - `tiktok/`
  - `klaviyo/`
  - `ga4/`

What does not belong here:

- dashboard UI code
- job runner entrypoints
- direct imports from V1 runtime files

Current state:

- connector common runtime is app-owned under `common/**`
- each first-wave connector has an app-owned registry entry and stub module
- source API clients and ingest transforms are still deferred to the next pass
