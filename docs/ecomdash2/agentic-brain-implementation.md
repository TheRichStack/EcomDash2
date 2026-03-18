# Agentic Brain Implementation

## Summary

This document describes the current EcomDash2 agent subsystem as it exists in the repo today.

It covers:

- what has been built
- how the request flow works
- the current file structure
- storage and settings
- the optional worker path
- the runbook system
- lab tooling used to evaluate runbook quality
- important current limitations

This is the implementation note for the live EcomDash2 agent, not the archived V1 reference work.

## What Exists Today

The current agent is a workspace-scoped chat and runbook subsystem embedded inside the dashboard.

Current capabilities:

- in-dashboard chat sheet
- workspace-shared conversations
- new chat, rename, delete, and recent chat list
- `Chat`, `Runbooks`, and `Settings` tabs
- BYOK provider setup for OpenAI and Anthropic
- provider model verification and curated model picker
- encrypted API key storage
- tool-based answers over warehouse-backed loaders
- optional worker execution path for generated JavaScript analysis
- server-side broker endpoints for datasets, limited SQL, and guarded ops
- inline charts for selected tool outputs
- usage and estimated cost tracking
- runbook presets loaded from markdown
- runbook evaluation harness that scores outputs and saves reports

## High-Level Architecture

The agent is split into 5 layers:

1. UI layer
2. API route layer
3. Orchestration layer
4. Tool and storage layer
5. Optional worker execution layer

In plain terms:

- the browser hosts the chat UI
- the Next app owns routing, settings, orchestration, persistence, and tool calls
- the data warehouse is queried only from the server
- an optional external worker can run generated JS analysis code through brokered access

## Current Request Flow

For a normal chat turn:

1. User sends a message from the chat sheet.
2. `POST /api/agent/chat` resolves workspace/session context.
3. The orchestrator loads workspace agent settings and resolves provider/model.
4. The orchestrator decides the turn mode:
   - `direct`
   - `tools`
   - `worker`
5. If tools are needed, it runs app-owned tools against server-side loaders.
6. If worker mode is needed, it generates a constrained plan/script and executes it through the local executor or external executor.
7. The assistant message, metadata, usage, warnings, charts, and tool references are persisted.
8. The API streams NDJSON events back to the UI.

For runbooks:

1. User clicks a runbook in the `Runbooks` tab.
2. The UI creates a new conversation.
3. The preset id and prompt from `docs/ecomdash2/agent-runbooks.md` are submitted to `/api/agent/chat`.
4. The preset runtime in code resolves the fixed scope and tool bundle.
5. The orchestrator runs that preset through the same core pipeline.

## Execution Modes

The agent currently supports 3 execution modes:

- `direct`
  - LLM-only response
  - used for greetings, simple guidance, or clarifications
- `tools`
  - deterministic server tools run first
  - the assistant responds from those tool results
- `worker`
  - the agent generates constrained JavaScript analysis code
  - code runs through the executor and broker interfaces

Current note:

- many important runbooks have been deliberately pushed toward deterministic `tools` execution rather than relying on generic LLM synthesis
- this was done to improve reliability and reduce bad business answers

## Providers, Models, and Settings

Current provider support:

- OpenAI
- Anthropic

Current settings behavior:

- provider is saved per workspace
- model is saved per workspace
- API keys are encrypted and stored server-side
- an optional workspace `businessProfile` is also saved and included in prompt assembly

Settings are loaded and saved through:

- `lib/agent/settings.ts`

Relevant config keys:

- `ecomdash2.agent.provider`
- `ecomdash2.agent.model`
- `ecomdash2.agent.business_profile`

Encrypted token keys are workspace-scoped and provider-specific.

## Conversations and Persistence

Chats are currently workspace-shared.

That means:

- there is no true per-user chat isolation yet
- another machine on the same workspace can load the same saved conversations
- the browser only stores the last-opened conversation id as a convenience
- the source of truth is the database

Current persisted entities:

- conversations
- messages
- runs
- artifacts

Current migrations:

- `lib/db/migrations/0006_owned_agent.sql`
- `lib/db/migrations/0007_agent_conversation_summary.sql`

Current persistence behavior includes:

- assistant/user messages
- conversation titles
- rolling conversation summaries
- tool usage
- warnings
- structured `answerAudit` metadata on assistant messages (`scope`, `freshness`, `evidence`, terminology labels)
- charts
- usage/cost metadata
- worker artifacts

## Current Tool Layer

The app-owned tool set currently includes:

- `overview_summary`
- `traffic_conversion`
- `paid_media_summary`
- `inventory_risk`
- `product_performance`
- `email_performance`
- `data_freshness`
- `anomaly_scan`

These tools live in:

- `lib/agent/tools.ts`

They wrap server-side EcomDash2 loaders rather than raw browser-side queries.

Important point:

- the live agent does not depend on the archived `V1 agentic brain` runtime
- V1 remains reference material only

## Runbooks

The runbook UI and runtime are both in place.

Runbook prompt copy is loaded from:

- `docs/ecomdash2/agent-runbooks.md`

Runbook runtime behavior is defined in:

- `lib/agent/presets.ts`

Current preset ids:

- `daily-trading-pulse`
- `anomaly-and-issue-scan`
- `last-7-days-commercial-review`
- `last-month-board-summary`
- `paid-media-diagnostics`
- `product-and-merchandising-performance`
- `inventory-risk-and-missed-revenue`
- `email-and-retention-performance`

Each preset currently controls:

- label
- description
- default prompt
- title seed
- fixed execution mode
- fixed tool bundle
- fixed scope resolution rule
- whether worker use is allowed

## Charts

The agent can render inline charts from structured metadata.

Current chart generation lives in:

- `lib/agent/charts.ts`
- `components/agent/agent-inline-charts.tsx`

Charts are currently driven by deterministic structured data, not free-form markdown.

## Worker and Broker Path

The external worker path exists and is optional.

If `ECOMDASH2_AGENT_EXECUTOR_URL` is unset:

- the app uses the local executor in-process

If it is set:

- the app signs requests and sends them to the external executor service

Current worker-related files:

- `lib/agent/executor.ts`
- `scripts/agent-executor.ts`
- `lib/agent/broker.ts`

Current broker HTTP endpoints:

- `/api/agent/broker/datasets`
- `/api/agent/broker/sql`
- `/api/agent/broker/ops`

Current worker rules:

- generated code is JavaScript
- execution is constrained through `vm`
- access is brokered rather than exposing raw DB credentials directly to scripts
- guarded ops still require confirmation

### Current runtime limits (as of W9-B)

| Setting | Value |
|---------|-------|
| Max completion tokens per turn | 2000 |
| Max tools loaded per turn | 5 |
| Paid media campaigns (rows) | 20 |
| Product top rows | 20 |
| Product comparison rows | 20 |
| Funnel product rows | 20 |
| Funnel daily rows | 90 |

Worker mode for free-form turns is **enabled by default** (no env flag required).
The `ECOMDASH2_AGENT_ENABLE_WORKER` env variable is no longer consulted for free-form turns.
Runbook presets retain their own fixed `executionMode` and are unaffected.

## Cost Tracking and Budgets

The system currently tracks provider usage and estimated spend per assistant turn.

Current implementation files:

- `lib/agent/pricing.ts`
- `lib/agent/constants.ts`
- `lib/agent/orchestrator.ts`

Current protection layers:

- per-turn limits
- daily workspace budget
- monthly workspace budget
- separate lab budget cap per evaluation run

Important note:

- cost tracking is an estimate based on provider token usage and configured pricing logic
- it is an operational estimate, not a billing-grade invoice source

## Lab / Evaluation Harness

The repo includes a runbook lab loop for evaluating prompt and backend quality.

Current script:

- `scripts/agent-runbook-lab.ts`

What it does:

- runs a real preset against a workspace and date range
- captures the assistant answer
- asks a judge model to score the answer
- classifies failure type
- saves a markdown report under `artifacts/agent-lab`

This is used to tune runbooks against real data windows such as November 2025.

## Current File Structure

### Core runtime

- `lib/agent/orchestrator.ts`
- `lib/agent/context.ts`
- `lib/agent/types.ts`
- `lib/agent/constants.ts`
- `lib/agent/utils.ts`

### Provider adapters

- `lib/agent/providers/index.ts`
- `lib/agent/providers/openai.ts`
- `lib/agent/providers/anthropic.ts`

### Tooling and analysis

- `lib/agent/tools.ts`
- `lib/agent/anomalies.ts`
- `lib/agent/charts.ts`
- `lib/agent/presets.ts`

### Persistence and settings

- `lib/agent/storage.ts`
- `lib/agent/settings.ts`
- `lib/agent/pricing.ts`

### Worker and broker

- `lib/agent/executor.ts`
- `lib/agent/broker.ts`
- `scripts/agent-executor.ts`

### API routes

- `app/api/agent/chat/route.ts`
- `app/api/agent/models/route.ts`
- `app/api/agent/presets/route.ts`
- `app/api/agent/conversations/route.ts`
- `app/api/agent/conversations/[id]/route.ts`
- `app/api/agent/broker/**`

### UI

- `components/agent/agent-chat-sheet.tsx`
- `components/agent/agent-inline-charts.tsx`
- `components/agent/workspace-ai-settings-card.tsx`

### Supporting docs and artifacts

- `docs/ecomdash2/agent-runbooks.md`
- `docs/ecomdash2/agent-system.md`
- `artifacts/agent-lab/**`

## Current UX Behavior

The current chat sheet includes:

- shared conversation rail
- new chat
- rename and delete
- `Chat`, `Runbooks`, `Settings` tabs
- inline charts
- clarifying options
- usage/cost footer
- in-panel provider/model/key management

The current model is more reliable on runbooks than on totally free-form agentic interpretation.

That is because several important runbooks now use deterministic backend contracts rather than a generic “prompt + tools + hope” path.

## Current Known Limitations

The most important current limitations are:

- free-form scope resolution is still too rigid in some cases
- date and event inference is not yet confidence-based enough
- some runbooks are materially stronger than others
- workspace sharing exists, but true user-level auth does not
- the worker path exists, but many high-value flows are intentionally pinned to deterministic `tools` mode
- tool coverage is still stronger for overview, anomaly, product, and paid/media summary use cases than for deeper business-event reasoning
- answer auditability exists in storage, but there is still room for a better “inspect answer” product surface
- terminology guardrails are deterministic and warning-based; current coverage includes paid-media proxy modeling and mixed/fallback conversion language

## Important Current Principle

The live agent should be understood as:

- a real app-owned analysis subsystem
- with deterministic loaders and structured contracts
- plus optional LLM narration and optional worker execution

It is not:

- a direct runtime import of the V1 agentic brain
- a browser-side AI widget with direct warehouse access
- an unrestricted scripting shell

## Recommended Next Documentation

If this subsystem keeps growing, the next docs worth adding are:

- a dedicated route/interface contract doc for `app/api/agent/**`
- a broker security and capability doc
- a runbook quality tracker summarizing current lab scores and weak areas
- a scope-resolution design doc for the next free-form inference pass
