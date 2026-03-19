# Agent API Contracts

## Purpose

This document is the current route-level contract for `app/api/agent/**`.

It exists to make agent work easier to scope. If a task changes request or response behavior, start here and then open the matching route file.

## Route Inventory

### `GET /api/agent/chat`

File:

- `app/api/agent/chat/route.ts`

Purpose:

- load the current conversation for a workspace
- fall back to the latest conversation
- return current setup state

Expected query params:

- `workspaceId`
- `conversationId` optional

Response shape:

- `conversation`
- `messages`
- `setup`

Notes:

- validates workspace membership through dashboard session
- does not stream

### `POST /api/agent/chat`

File:

- `app/api/agent/chat/route.ts`

Purpose:

- run one chat or runbook turn
- stream status and final assistant message as NDJSON

Expected body fields:

- `context.workspaceId`
- `context.from`
- `context.to`
- `context.compare`
- `conversationId` optional
- `forceNewConversation` optional
- `message`
- `presetId` optional
- `confirmedOps` optional

Current NDJSON event types:

- `status`
- `message`
- `complete`
- `error`

Current behavior:

- resolves preset metadata when `presetId` is supplied
- calls `runAgentTurn`
- returns the final assistant message and run metadata

### `GET /api/agent/models`

File:

- `app/api/agent/models/route.ts`

Purpose:

- list available models for the configured provider
- reflect workspace-level saved provider state

### `GET /api/agent/presets`

File:

- `app/api/agent/presets/route.ts`

Purpose:

- list available runbook presets

Source of truth:

- `lib/agent/presets.ts`

### `GET /api/agent/conversations`
### `POST /api/agent/conversations`

File:

- `app/api/agent/conversations/route.ts`

Purpose:

- list conversations for a workspace
- create a new conversation

### `PATCH /api/agent/conversations/[id]`
### `DELETE /api/agent/conversations/[id]`

File:

- `app/api/agent/conversations/[id]/route.ts`

Purpose:

- rename a conversation
- delete a conversation

## Broker Routes

These routes are for worker execution, not for browser-side direct use.

### `POST /api/agent/broker/datasets`

File:

- `app/api/agent/broker/datasets/route.ts`

Purpose:

- expose approved datasets to worker code

### `POST /api/agent/broker/sql`

File:

- `app/api/agent/broker/sql/route.ts`

Purpose:

- expose guarded SQL access to worker code

### `POST /api/agent/broker/ops`

File:

- `app/api/agent/broker/ops/route.ts`

Purpose:

- execute guarded higher-risk operations

## Ownership Rules

When changing:

- route request or response shape:
  - update this doc
  - update the route file
  - update the relevant UI caller in `components/agent/`
- orchestration behavior only:
  - update `lib/agent/orchestrator.ts`
  - do not widen route scope unless needed
- worker broker behavior:
  - also update `docs/ecomdash2/agent/worker-broker.md`

## Current Pain Points

The route layer is not the main source of sprawl. The bigger issue is that several route contracts are thin wrappers over very large runtime files:

- `POST /api/agent/chat` mostly delegates to `lib/agent/orchestrator.ts`
- `GET /api/agent/presets` depends on markdown-parsed preset definitions in `lib/agent/presets.ts`

That means route changes often feel bigger than they are. Keep route handlers thin and move complexity downward by concern.

## Recommended Next Structure

Longer term, keep the routes stable and split the runtime behind them:

- `lib/agent/orchestration/run-agent-turn.ts`
- `lib/agent/runbooks/registry.ts`
- `lib/agent/storage/*`
- `lib/agent/worker/*`

The route contract should stay boring even if the implementation becomes more modular.
