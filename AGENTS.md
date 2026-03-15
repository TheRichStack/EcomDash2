# EcomDash2 Agent Rules

This repository is the implementation root for EcomDash2.

## Primary objective

Build and maintain EcomDash2 as its own app, job runtime, and operating surface while it continues to use the shared Turso database.

Do not rebuild from markdown alone.

Do not copy V1 UI complexity into the new app.

## Source of truth

Use these docs first:

- `docs/ecomdash2/README.md`
- `docs/ecomdash2/rebuild-plan.md`
- `docs/ecomdash2/design-philosophy.md`
- `docs/ecomdash2/metrics-engine.md`
- `docs/ecomdash2/backend-boundary.md`
- `docs/ecomdash2/ui-guardrails.md`
- `docs/ecomdash2/dashboard-patterns.md`
- `docs/ecomdash2/forbidden-abstractions.md`
- relevant file under `docs/ecomdash2/page-specs/`
- `docs/ecomdash2/agent-operating-model.md`
- `docs/ecomdash2/post-extraction-checklist.md` when the repo has just been split out

If a legacy V1 implementation conflicts with the EcomDash2 docs, the EcomDash2 docs win.

## Workspace model

- the repository root is the implementation target
- EcomDash2 owns its app runtime, jobs, connectors, workflows, CI, and keep-boundary migrations
- the shared Turso database remains intentional for the current phase
- legacy V1 code may not be locally present after extraction; rely on the EcomDash2 docs first

## Read and edit rules

Default read scope:

- the whole repository
- `docs/ecomdash2/**` first
- any runtime, route, or job files explicitly named in the work order

Default edit scope:

- the whole repository, unless the work order narrows it further

If a work order references legacy V1 files that are not present locally, continue from the EcomDash2 docs, tracker, and app-owned runtime files, then call out the missing reference explicitly.

## Hard constraints

- Do not import V1 UI components into EcomDash2.
- Do not copy whole V1 feature modules into EcomDash2.
- Do not make EcomDash2 depend on external sibling app code.
- Do not use legacy diagnostics, anomaly, brief, diagnose, investigate, change-log, or action-rail systems.
- Do not write new EcomDash2 UI state into legacy V1-specific config keys.
- Namespace EcomDash2-owned config keys, for example `ecomdash2.*`.
- Do not invent new UI wrapper families outside the approved dashboard patterns.
- Keep page-specific markup inline unless reuse is proven.

## Allowed reuse

- data contracts
- schema and migrations as reference
- server query logic and formulas
- workspace-aware auth and scoping patterns
- demo data patterns
- proven calculation logic

Reuse behavior and data shapes deliberately. Rebuild UI structure natively in the new app.

## Fresh-agent workflow

- Read only the files named in the PM work order.
- Do not scan the whole repo unless the work order requires it.
- If the work order points to legacy V1 files, use them as reference only when they are available.
- If legacy V1 files are not available locally, continue from the EcomDash2 docs, tracker, and app-owned runtime files.
- Keep the final implementation inside EcomDash2-owned files.

## Delivery pattern

For any substantial task:

1. read the named spec docs
2. inspect only the minimum legacy references needed, if they are available
3. implement in EcomDash2-owned files
4. verify against the spec and, when relevant, against known legacy behavior
5. report any remaining shared-infrastructure or legacy-coupling risk explicitly

## If context is missing

- Prefer the page spec over inference
- Prefer the backend boundary over convenience
- Prefer the tracker and handoff docs over assumptions about an older repo layout
- Prefer asking the PM for a tighter work order over widening scope casually
