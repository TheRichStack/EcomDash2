# `<PROMPT_ID>` Result

## Prompt Identity
- `PROMPT_ID`: `<PROMPT_ID>`
- `PROMPT_LABEL`: `artifacts/agent-handoffs/<PROMPT_ID>.prompt.md`
- `PROMPT_TASK`: `<task-name>`
- `EXPECTED_BRANCH`: `<expected-branch>`
- `ACTUAL_BRANCH`: `<actual-branch>`
- `BASE_BRANCH`: `<base-branch>`
- `BASE_SHA`: `<base-sha>`
- `FINAL_COMMIT_SHA`: `<final-commit-sha>`

## Commit Proof
`git show --name-only --oneline -n 1`

```text
<paste output>
```

## Files Changed
- `<file-1>`
- `<file-2>`

## Implemented Behavior
- `<item-1>`
- `<item-2>`

## Validation Outputs
`npm run typecheck`
```text
<paste output>
```

`npm run lint`
```text
<paste output>
```

`<targeted check>`
```text
<paste output>
```

## Risks / Follow-ups
- `<risk-1>`
- `<risk-2>`
