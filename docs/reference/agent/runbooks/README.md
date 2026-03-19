# Agent Runbooks

## Purpose

This folder is the documentation home for runbook structure and future runbook splitting.

## Runtime ownership (strict)

- Prompt copy source of truth: `docs/ecomdash2/agent-runbooks.md`
- Runtime config source of truth: `lib/agent/presets.ts`
- Release-gate source of truth: `artifacts/agent-lab/runbook-release-gates.json`

When changing runbooks, keep these three sources aligned in the same change.

Today, live runbook prompt copy still lives in:

- `docs/ecomdash2/agent-runbooks.md`

And live runbook runtime metadata still lives in:

- `lib/agent/presets.ts`

This document exists so future agents know how runbooks should be organized as the subsystem grows.

## Current State

Today each runbook is split across two sources:

1. markdown prompt copy in `docs/ecomdash2/agent-runbooks.md`
2. runtime scope/tool metadata in `lib/agent/presets.ts`

That works, but it has two costs:

- runbook edits require touching both docs and runtime
- all runbook prompt copy is bundled into one large markdown file parsed by regex

## Current Runbook Set

Current preset ids:

- `daily-trading-pulse`
- `anomaly-and-issue-scan`
- `last-7-days-commercial-review`
- `last-month-board-summary`
- `paid-media-diagnostics`
- `product-and-merchandising-performance`
- `inventory-risk-and-missed-revenue`
- `email-and-retention-performance`

## Recommended Future Structure

Move toward one file per runbook definition:

```txt
lib/agent/runbooks/
  registry.ts
  definitions/
    daily-trading-pulse.ts
    anomaly-and-issue-scan.ts
    last-7-days-commercial-review.ts
    last-month-board-summary.ts
    paid-media-diagnostics.ts
    product-and-merchandising-performance.ts
    inventory-risk-and-missed-revenue.ts
    email-and-retention-performance.ts
```

Each runbook definition should own:

- id
- label
- description
- default prompt
- title seed
- execution mode
- tool bundle
- scope resolver
- worker allowance

## Documentation Rule

If runbooks stay markdown-backed for now:

- keep `docs/ecomdash2/agent-runbooks.md` as the copy source of truth
- treat `lib/agent/presets.ts` as runtime wiring only

If runbooks move to typed code:

- keep this folder as the documentation map
- keep one short doc or generated index for operator-facing descriptions

## Task Routing For Future Agents

If the task is about:

- prompt wording or response structure:
  - start in `docs/ecomdash2/agent-runbooks.md`
- fixed tool bundle or execution mode:
  - start in `lib/agent/presets.ts`
- release gate visibility:
  - start in `lib/agent/presets.ts` and `artifacts/agent-lab/runbook-release-gates.json`
- runbook quality and evaluation:
  - start in `scripts/agent-runbook-lab.ts` and `artifacts/agent-lab/**`

## Recommended Next Step

The first code-level runbook refactor should be:

1. introduce typed runbook definitions in code
2. keep the existing markdown file temporarily as the operator copy reference
3. remove regex parsing only after parity is confirmed
