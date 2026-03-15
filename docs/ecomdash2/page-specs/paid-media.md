# Paid Media Page Spec

Status: locked for v1

## Route

Grouped sidebar section:

- `/dashboard/paid-media`
- `/dashboard/paid-media/meta`
- `/dashboard/paid-media/google`
- `/dashboard/paid-media/tiktok`
- `/dashboard/paid-media/creative`

`/dashboard/paid-media` is the canonical all-channels page.

## Page job

Show spend, attributed revenue, efficiency, and campaign-level performance across paid channels without the old diagnosis workflow.

## Keep from current app

- campaign performance depth
- platform breakdown capability
- date range filtering
- estimated profit proxy
- target-based ROAS / CPA formatting
- customizable table columns
- richer per-platform tables for Meta, Google, and TikTok
- lower-level drilldown where already supported
- raw-payload-backed access to less-used metrics

## Remove from current app

- pacing alert language
- needs-attention ranking
- brief cards
- diagnose panels
- anomaly-first labels as the main organizing principle

## Proposed structure

1. KPI strip
2. Spend / revenue / ROAS trend
3. Channel summary table
4. Campaign performance table

## Default KPI strip

- ad spend
- platform attributed revenue
- MER
- CPA
- ROAS
- purchases

This page should ship with 6 cards by default.

## Feature parity direction

Paid Media is not a page to heavily simplify functionally.

The goal is:

- keep the current reporting power
- rebuild the UI to match EcomDash2 design principles
- remove legacy presentation layers, not the underlying capability

## Implementation direction

Recommended approach:

- reuse query logic and data-shaping logic where it is already proven
- preserve table behaviors and configuration concepts
- rebuild the actual UI in native shadcn composition
- do not copy old page JSX wholesale into the new app
- aim for near-functional parity with the current paid-media surface in v1

Priority features to preserve:

- estimated profit proxy in paid tables
- target-aware formatting for targetable metrics
- customizable visible columns
- per-platform table depth
- drilldown structure already present in the current paid tables

Current default table columns to preserve:

- spend
- budget
- ROAS
- CPA
- CPM
- CTR
- impressions
- clicks
- purchases
- revenue
- estimated profit proxy

## Data architecture note

Preserve the current pattern where:

- common metrics exist as structured fields
- less-used or future metrics can come from the stored raw JSON payload / extra metrics map
- column customization can expose additional metrics without requiring the connector to hardcode every possible field into the primary table shape

This is one of the stronger backend decisions in the current app and should carry forward.

## Locked defaults:

- ad set and ad-level drilldown stay in v1
- use the current default paid-table column set, including budget
- TikTok stays in v1 alongside Meta and Google
- use the current default paid-table columns as the mandatory first-build baseline for Meta, Google, and TikTok:
  - spend
  - budget
  - ROAS
  - CPA
  - CPM
  - CTR
  - impressions
  - clicks
  - purchases
  - revenue
  - estimated profit proxy
