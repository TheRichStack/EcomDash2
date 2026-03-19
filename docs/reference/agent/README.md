# EcomDash2 Agent Docs

## Purpose

This folder is the navigation layer for the in-dashboard agent subsystem.

Use it to answer two questions quickly:

1. Which part of the agent am I changing?
2. Which files and docs are the source of truth for that change?

This folder is paired with a behavior-preserving runtime boundary pass so agents can start from narrower files.

## Read Order

When working on the agent, use this order:

1. `docs/ecomdash2/agent/README.md`
2. `docs/ecomdash2/agent-system.md`
3. `docs/ecomdash2/agentic-brain-implementation.md`
4. `docs/ecomdash2/agent/context-budget-policy.md`
5. The focused doc in this folder for the concern you are changing
6. The relevant runtime file under `lib/agent/`, `app/api/agent/`, or `components/agent/`

## Source Of Truth By Concern

### Agent behavior and answer style

- `docs/ecomdash2/agent-system.md`
- `lib/agent/context.ts`

### Runtime architecture and current implementation

- `docs/ecomdash2/agentic-brain-implementation.md`

### Token and context budgets

- `docs/ecomdash2/agent/context-budget-policy.md`

### Primitive roadmap and target architecture

- `docs/ecomdash2/agent-primitives-inventory.md`

### Runbook copy and runbook conventions

- `docs/ecomdash2/agent-runbooks.md`
- `docs/ecomdash2/agent/runbooks/README.md`
- `lib/agent/presets.ts`

### API route contracts

- `docs/ecomdash2/agent/api-contracts.md`
- `app/api/agent/**`

### Scope inference and time resolution

- `docs/ecomdash2/agent/scope-resolution.md`
- `lib/agent/orchestration/scope-resolution.ts`
- `lib/agent/orchestration/run-agent-turn.ts`

### Worker, broker, and guarded execution

- `docs/ecomdash2/agent/worker-broker.md`
- `lib/agent/broker.ts`
- `lib/agent/executor.ts`
- `scripts/agent-executor.ts`

## Fast Routing For Future Agents

If the task is about:

- chat behavior, prompt assembly, execution mode, or answer audit:
  - start in `lib/agent/orchestration/run-agent-turn.ts` and then `lib/agent/orchestrator.ts` when needed
- system prompt wording or answer style:
  - start in `docs/ecomdash2/agent-system.md` and `lib/agent/context.ts`
- tool payloads, keyword routing, or data shaping:
  - start in `lib/agent/tools.ts`
- preset scope, runbook availability, or release gates:
  - start in `lib/agent/presets.ts`
- stored conversations, runs, or artifacts:
  - start in `lib/agent/storage.ts`
- provider setup, saved model, or encrypted keys:
  - start in `lib/agent/settings.ts`
- broker permissions, SQL guardrails, or external execution:
  - start in `lib/agent/broker.ts` and `lib/agent/executor.ts`
- date inference, clarification behavior, or month/event scope handling:
  - start in `lib/agent/orchestration/scope-resolution.ts`
- chat sheet UI, runbooks tab, or agent settings UI:
  - start in `components/agent/`
- API behavior:
  - start in `app/api/agent/`

## Current Hotspots

These files currently attract too much unrelated work and are the main reason agent tasks collide:

- `lib/agent/orchestrator.ts`
- `lib/agent/tools.ts`
- `components/agent/agent-chat-sheet.tsx`
- `lib/agent/presets.ts`

Treat them as temporary aggregation points, not ideal long-term ownership boundaries.

Current extraction already started:

- time and scope inference now has a dedicated module at `lib/agent/orchestration/scope-resolution.ts`
- `lib/agent/orchestrator.ts` no longer owns duplicated scope/date resolution helpers
- orchestration boundary entrypoints now exist at:
  - `lib/agent/orchestration/run-agent-turn.ts`
  - `lib/agent/orchestration/prompt-builder.ts`
  - `lib/agent/orchestration/worker-guardrails.ts`

## Recommended Target Structure

The next code-structure pass should move toward this layout:

```txt
lib/agent/
  core/
    types.ts
    constants.ts
    utils.ts
    pricing.ts
  orchestration/
    run-agent-turn.ts
    scope-resolution.ts
    tool-selection.ts
    prompt-builder.ts
    answer-audit.ts
    deterministic-reports/
      anomaly-report.ts
      daily-report.ts
      weekly-report.ts
      monthly-report.ts
      paid-media-report.ts
      product-report.ts
      inventory-report.ts
  tools/
    catalog.ts
    datasets.ts
    routing/
      keyword-router.ts
      llm-router.ts
    builders/
      overview-summary.ts
      traffic-conversion.ts
      paid-media-summary.ts
      ad-performance.ts
      ad-segments.ts
      budget-vs-actual.ts
      order-analysis.ts
      customer-cohorts.ts
      inventory-risk.ts
      product-performance.ts
      email-performance.ts
      creative-performance.ts
      anomaly-scan.ts
  runbooks/
    registry.ts
    release-gates.ts
    definitions/
      daily-trading-pulse.ts
      ...
  worker/
    broker.ts
    executor.ts
    op-guardrails.ts
  providers/
  storage/
    conversations.ts
    messages.ts
    runs.ts
    artifacts.ts
  settings.ts
```

For UI:

```txt
components/agent/
  chat-sheet/
    sheet.tsx
    conversation-rail.tsx
    thread.tsx
    composer.tsx
    runbooks-tab.tsx
    settings-tab.tsx
  agent-inline-charts.tsx
  workspace-ai-settings-card.tsx
```

## Recommended Refactor Order

Keep the code changes small and behavior-preserving:

1. Split `lib/agent/orchestrator.ts` by concern.
2. Split `lib/agent/tools.ts` into `builders/`, `catalog.ts`, and routing files.
3. Move runbook runtime definitions out of markdown parsing and into typed code definitions.
4. Split `components/agent/agent-chat-sheet.tsx` into subcomponents.

## Documentation Gaps This Folder Now Covers

Before this pass, the subsystem had strong implementation notes but weak navigation.

This folder now provides:

- a single agent entrypoint
- an API contract doc
- a scope-resolution doc
- a worker and broker doc
- a runbook structure doc

Use these docs to point future agents at one bounded area instead of the entire subsystem.
