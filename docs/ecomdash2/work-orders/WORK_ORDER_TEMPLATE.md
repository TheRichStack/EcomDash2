# Work Order Template

## Task

Short task name.

## Objective

Describe the exact outcome. Keep it narrow and concrete.

## Read first

- `docs/ecomdash2/rebuild-plan.md`
- `docs/ecomdash2/...`
- `docs/ecomdash2/...`
- `docs/ecomdash2/ui-guardrails.md`
- `docs/ecomdash2/dashboard-patterns.md`
- `docs/ecomdash2/forbidden-abstractions.md`

## V1 references allowed

- `dashboard/...`
- `dashboard/...`

If this section is empty, do not inspect V1 code.

## Allowed edit scope

- `EcomDash2/TRS_Starter_Core/...`

## Forbidden scope

- `dashboard/components/**`
- `dashboard/app/**` unless explicitly listed above as reference
- any file outside the allowed edit scope

## Implementation rules

- Build inside EcomDash2-owned files only
- Do not import V1 UI components
- Port logic deliberately if needed
- Respect the backend boundary and namespaced config rules
- Keep page-specific markup inline unless reuse is proven
- Do not invent new wrapper families without PM approval

## Approved patterns to use

- name the approved pattern or patterns from `dashboard-patterns.md`

## New abstractions proposed

- default: none
- if not none, justify why inline composition or an approved pattern is insufficient

## Acceptance criteria

- condition 1
- condition 2
- condition 3

## Verification

- command 1
- command 2
- visual or behavior check

## Temporary exceptions to document

- note any temporary V1 dependency
- note the planned removal path
- note any PM-approved UI abstraction exception

## Branch

Suggested branch name.
