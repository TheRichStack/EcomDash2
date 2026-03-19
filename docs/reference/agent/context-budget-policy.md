# Agent Context Budget Policy

This policy controls context size in two systems:

1. repo-working agents editing EcomDash2
2. in-dashboard agent turns paid by workspace users

## Repo-working agent budgets

- `Read first` list in a work order: max 8 files.
- `Allowed edit scope`: max 3 paths.
- `V1 references allowed`: max 3 paths.
- Work orders must include an explicit `Out of scope` section.
- New or changed files in `lib/agent/**` and `components/agent/**` should stay under 1200 lines unless explicitly allowlisted.
- 900+ lines is warning level and should trigger a split plan.

## In-dashboard prompt budgets

- direct mode: no tool evidence payload.
- tools mode: max 2800 chars total evidence payload, max 900 chars per tool payload.
- worker-plan mode: summary-only evidence payload, max 1800 chars total.
- default evidence tier is `compact`; `full` is debug/lab only.

## Tool cache policy

- key dimensions: workspace + scope + compare + sorted tools + preset + question fingerprint for message-sensitive tools.
- TTL:
  - 2 minutes when `data_freshness` is included
  - 10 minutes for free-form tools turns
  - 6 hours for runbook turns
- bypass cache for worker confirmation/resume.

## Ratchet policy

- run `npm run agent:context:ratchet` weekly.
- lower allowlisted max-line ceilings incrementally until hotspots are split.
- do not add new allowlisted hotspot files without explicit PM decision.
