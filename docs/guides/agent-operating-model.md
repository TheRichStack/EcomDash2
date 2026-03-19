# EcomDash2 Agent Operating Model

> Status (March 19, 2026): Historical guidance for the rebuild phase.
> For current in-dashboard agent runtime navigation and ownership, use `docs/ecomdash2/agent/README.md` as the source of truth.

## Purpose

Define how a PM agent and fresh worker agents should operate inside this repo while EcomDash2 is being rebuilt inside `EcomDash2/TRS_Starter_Core`.

This is an in-repo build phase, not the final extracted repo phase.

## Why this model exists

EcomDash2 needs the existing repo during the rebuild for:

- current Turso schema and migrations
- existing live data access
- demo data
- connector jobs and backfill flow
- proven calculations and query patterns
- reference behavior from V1 pages

At the same time, EcomDash2 must avoid dragging V1 UI structure and legacy workflow systems into the new app.

The control mechanism is not hiding V1. The control mechanism is disciplined scope.

## Repo roles

### New app

`EcomDash2/TRS_Starter_Core`

Purpose:

- all new app code
- all new route scaffolds
- new app-owned loaders, adapters, helpers, and components
- the EcomDash2 planning docs

### Reference and shared context

`dashboard/`

Purpose:

- reference implementation
- schema and migration source
- current data loaders and reporting logic
- connector jobs and scheduling context
- proven UI behavior reference

This folder is readable by default, but not editable by default.

## PM responsibilities

The PM agent owns:

- sequencing work
- defining exact task boundaries
- choosing which V1 references a worker may inspect
- reviewing whether a task created forbidden V1 coupling
- keeping the product aligned to the locked EcomDash2 docs

The PM should assume worker agents start with zero context.

## Worker responsibilities

A worker agent should:

- read only the files named in the work order
- avoid expanding scope without a strong reason
- inspect V1 only when the work order names specific files or specific unknowns
- keep implementation inside EcomDash2-owned files
- call out unresolved ambiguity instead of silently inventing product behavior

## Required context pack for every task

Every PM work order should contain these sections.

### 1. Objective

One short paragraph describing the specific outcome.

### 2. Read first

A small file list. Usually 3 to 8 files.

Always include:

- `docs/ecomdash2/rebuild-plan.md`
- the relevant page spec or specs
- `docs/ecomdash2/ui-guardrails.md`
- `docs/ecomdash2/dashboard-patterns.md`
- `docs/ecomdash2/forbidden-abstractions.md`

Include when relevant:

- `docs/ecomdash2/design-philosophy.md`
- `docs/ecomdash2/backend-boundary.md`
- `docs/ecomdash2/metrics-engine.md`
- exact V1 reference files

### 3. Allowed edit scope

List exact folders or files the worker may change.

Default:

- `EcomDash2/TRS_Starter_Core/**`

### 4. Forbidden scope

List exact folders or files the worker may read or inspect only.

Default:

- `dashboard/**` is reference-only

### 5. Implementation rules

State the key constraints for the task, for example:

- no imports from V1 UI modules
- port logic, do not copy component trees
- use EcomDash2-owned query adapters
- namespaced config keys only
- approved patterns to use
- no new wrappers without justification

### 6. Acceptance criteria

Concrete conditions that define done.

### 7. Verification

Commands, screens, and comparisons the worker must run or check.

## Default worker rule set

Unless a work order explicitly says otherwise:

- read EcomDash2 docs first
- inspect the minimum V1 code required
- edit only inside `EcomDash2/TRS_Starter_Core`
- never import from `dashboard/components/**`
- avoid long-term imports from `dashboard/lib/**`
- if a V1 helper is worth reusing, port it into an EcomDash2-owned file

## Forbidden coupling patterns

These are failures unless a PM explicitly approves a temporary exception:

- importing V1 feature components into the new app
- copying V1 route layouts wholesale
- copying legacy dashboard wrappers such as brief, diagnose, investigate shells
- depending on diagnostics, anomaly, change-log, or action-queue tables
- writing EcomDash2 UI state into V1-only config keys
- leaving cross-folder imports in place without an extraction plan

## Allowed temporary bootstrap exceptions

These may be allowed briefly during foundation work if documented in the task:

- short-lived imports from V1 backend helpers while creating EcomDash2-owned replacements
- temporary demo-data adapters that mirror current V1 output
- temporary side-by-side comparisons with V1 route output

UI wrapper exceptions should almost never be used during bootstrap.

If used, the worker must document:

- what temporary dependency was introduced
- why it was necessary
- what needs to replace it

## Task types and minimum context

### Foundation task

Read first:

- `docs/ecomdash2/rebuild-plan.md`
- `docs/ecomdash2/backend-boundary.md`
- `docs/ecomdash2/design-philosophy.md`
- `docs/ecomdash2/ui-guardrails.md`
- `docs/ecomdash2/dashboard-patterns.md`

Likely V1 references:

- schema, env, auth, date-range, and layout files

### Page build task

Read first:

- `docs/ecomdash2/rebuild-plan.md`
- relevant `docs/ecomdash2/page-specs/*.md`
- `docs/ecomdash2/design-philosophy.md`
- `docs/ecomdash2/backend-boundary.md`
- `docs/ecomdash2/ui-guardrails.md`
- `docs/ecomdash2/dashboard-patterns.md`
- `docs/ecomdash2/forbidden-abstractions.md`

Likely V1 references:

- current route page
- current feature components for behavior reference
- current loader or query files

### Settings or metrics task

Read first:

- `docs/ecomdash2/page-specs/settings.md`
- `docs/ecomdash2/metrics-engine.md`
- `docs/ecomdash2/backend-boundary.md`
- `docs/ecomdash2/ui-guardrails.md`
- `docs/ecomdash2/dashboard-patterns.md`

### Data-layer task

Read first:

- `docs/ecomdash2/backend-boundary.md`
- `docs/ecomdash2/rebuild-plan.md`
- relevant page specs
- `docs/ecomdash2/ui-guardrails.md`

Likely V1 references:

- `dashboard/lib/data/**`
- `dashboard/lib/db/**`
- migrations and contract logic

## Suggested build sequence for PM handoff

1. foundation shell and nav
2. shared auth, workspace, and date-range state
3. EcomDash2-owned DB client and query adapter boundaries
4. settings routes and forms
5. overview page
6. Shopify profit
7. paid media
8. creative
9. products
10. inventory
11. funnel
12. email
13. extraction cleanup

## How the PM should prevent context bloat

- give workers one slice at a time
- name exact files, not whole folders, where possible
- only include V1 references that are genuinely needed
- prefer one authoritative spec plus one or two implementation references
- do not ask workers to infer product decisions that are already locked in docs

## Review checklist for PM

- did the worker edit only allowed files
- did they pull V1 UI structure across
- did they create new cross-folder imports
- did they follow the locked page spec
- did they respect the backend keep/defer/cut boundary
- did they document temporary exceptions
- did they stay inside the approved dashboard patterns
- did they create a wrapper that should have stayed inline
