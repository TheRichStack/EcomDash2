# Agent Worker And Broker

## Purpose

This document describes the guarded execution path for deep analysis.

Use it when the task touches:

- worker planning
- broker token capabilities
- SQL guardrails
- guarded ops confirmation
- external executor deployment

## Current Files

Core runtime:

- `lib/agent/executor.ts`
- `lib/agent/broker.ts`
- `lib/agent/orchestrator.ts`

Entrypoints:

- `scripts/agent-executor.ts`
- `app/api/agent/broker/datasets/route.ts`
- `app/api/agent/broker/sql/route.ts`
- `app/api/agent/broker/ops/route.ts`

## Current Flow

1. The orchestrator decides a turn should use `worker` mode.
2. The app generates a constrained JavaScript plan and script.
3. The requested ops set is persisted as a worker-plan artifact.
4. The worker script is checked against allowed op rules.
5. If explicit confirmation is required, the turn pauses in `needs_confirmation`.
6. The app signs a broker token with capabilities and allowed ops.
7. The local executor or external executor runs the script.
8. Dataset, SQL, and ops access is brokered through app-owned HTTP routes.

## Current Broker Capabilities

The broker token currently carries:

- `datasets`
- `sql`
- `ops`

The token also binds:

- `workspaceId`
- `runId`
- `expiresAt`
- allowed ops list

## Current Safety Model

The worker path is intentionally not a raw shell and not a direct DB credential handoff.

Safety boundaries today:

- generated code is JavaScript, not arbitrary shell
- execution is constrained via `vm`
- worker access goes through signed broker tokens
- SQL is brokered and sanitized
- guarded ops require explicit confirmation

## Change Rules

When changing worker behavior:

- do not weaken confirmation semantics casually
- do not expose raw DB credentials to worker code
- do not add new broker capabilities without documenting them here
- keep guarded ops separate from ordinary dataset access

## Current Pain Points

The worker path is conceptually separate, but parts of it are still coupled to the main orchestrator:

- worker plan generation lives inside `lib/agent/orchestrator.ts`
- worker op guardrails live inside `lib/agent/orchestrator.ts`
- broker implementation and dataset ownership are mixed in `lib/agent/broker.ts`

This makes worker changes feel broader than they should.

## Recommended Target Structure

Move toward:

```txt
lib/agent/worker/
  plan-generator.ts
  executor.ts
  broker-token.ts
  op-guardrails.ts
  sql-guardrails.ts
  datasets.ts
  ops.ts
```

With that split:

- orchestration owns the decision to use worker mode
- worker files own worker planning and execution rules
- broker files own dataset and SQL access boundaries

## What Future Agents Should Read First

If the task is about:

- worker confirmation and resumption:
  - `lib/agent/orchestrator.ts`
- SQL sanitization or allowed joins:
  - `lib/agent/broker.ts`
- executor transport and broker calls:
  - `lib/agent/executor.ts`
- external worker service:
  - `scripts/agent-executor.ts`

Keep those changes scoped. Do not mix worker refactors with runbook or UI work in the same task unless there is a real runtime dependency.
