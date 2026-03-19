# Agent Scope Resolution

## Purpose

This document describes how the agent currently resolves time scope for analysis turns and where that logic should live longer term.

Use it when the task touches:

- date inference
- clarification prompts
- relative date handling
- named event windows
- confidence and assumption notes

## Current Source Of Truth

Runtime logic now spans:

- `lib/agent/orchestration/scope-resolution.ts`
- `lib/agent/orchestrator.ts`

The system prompt guidance that works with it lives in:

- `docs/ecomdash2/agent-system.md`
- `lib/agent/context.ts`

## Current Responsibilities

The live scope path now handles all of these:

- parse explicit context overrides
- detect whether the user supplied enough time scope
- infer relative periods
- infer specific calendar dates
- infer seasons and quarters
- infer named event ranges like BFCM
- decide whether clarification is required
- attach confidence and assumption notes

Current note:

- the extraction has started, but it is not complete yet
- `lib/agent/orchestration/scope-resolution.ts` now owns the active imported scope helpers
- `lib/agent/orchestrator.ts` still contains legacy duplicate helpers that should be removed in a cleanup pass

## Current Supported Patterns

The current implementation note says free-form date inference covers:

- standard relative ranges
- specific days such as `November 16, 2025`
- seasons such as `summer 2026`
- quarters such as `Q1 2025`
- named events such as `BFCM`

This is useful coverage, but it is still coupled to the main run loop.

## Current Output Contract

Scope resolution produces:

- resolved `from`
- resolved `to`
- compare mode
- source: `explicit`, `inferred`, or `none`
- confidence
- warning
- assumption note
- clarification question and options when needed

That contract is important. If the implementation is moved, preserve the output shape.

## Current Pain Points

This is better than before, but not finished yet.

That creates three problems:

1. date work still partially conflicts with unrelated orchestration edits
2. the orchestrator still carries duplicate legacy scope code
3. tests and docs still need a final cleanup pass once the duplicate code is removed

## Recommended Target Structure

Move toward:

```txt
lib/agent/orchestration/
  scope-resolution.ts
  event-window-resolution.ts
  clarification.ts
```

Keep the public output contract stable, but move the parsing and inference logic out of `runAgentTurn`.

The first step is now done:

- active scope resolution helpers were moved into `lib/agent/orchestration/scope-resolution.ts`

## Recommended Documentation Rule

Whenever a new date pattern is added:

1. update runtime logic
2. update this doc
3. update `docs/ecomdash2/agentic-brain-implementation.md` if the supported coverage summary changes

## What Future Agents Should Read First

If the task is:

- "the agent interpreted the wrong date":
  - start here, then open `lib/agent/orchestration/scope-resolution.ts`
- "the agent should ask for clarification sooner":
  - start here, then inspect `lib/agent/orchestration/scope-resolution.ts`, `lib/agent/context.ts`, and the clarification branch in `lib/agent/orchestrator.ts`
- "we want event-specific planning windows":
  - start here, then read `docs/ecomdash2/agent-primitives-inventory.md`
