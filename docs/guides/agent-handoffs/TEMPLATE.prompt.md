# `<PROMPT_ID>`

## Worker Instructions

You are a worker agent. Your only job is to execute this prompt file exactly as written.

- Read every section before touching any file or running any command.
- Run all shell scripts in **bash** (Claude Code's default shell). Do not use PowerShell.
- Do not make any decisions not covered by this file. If something is unclear or a check fails, stop and report in the result file.
- When done, write your full result to `artifacts/agent-handoffs/<PROMPT_ID>.result.md`. Do not return results only in chat.

---

## Prompt Identity (Mandatory)
- `PROMPT_ID`: `<PROMPT_ID>`
- `PROMPT_LABEL`: `artifacts/agent-handoffs/<PROMPT_ID>.prompt.md`
- `PROMPT_TASK`: `<task-name>`
- `EXPECTED_FILES_SCOPE`: `<comma-separated files>`
- `EXPECTED_BRANCH`: `<task-branch>`
- `BASE_BRANCH`: `<base-branch>`

## Mission
`<task mission>`

## Branch Lock (Mandatory, do first)
1. Never switch branches after setup.
2. Never run `git reset`, `git cherry-pick`, `git rebase`, or `git merge`.
3. If any check fails, stop and report.

### Setup
```bash
git fetch --all --prune
git checkout <BASE_BRANCH>
git pull --ff-only 2>/dev/null || echo "No upstream configured; skipping pull --ff-only"
git show-ref --verify --quiet refs/heads/<TASK_BRANCH> && echo "ERROR: Task branch already exists" && exit 1
git checkout -b <TASK_BRANCH>
export TASK_BRANCH="<TASK_BRANCH>"
export BASE_SHA=$(git rev-parse HEAD)
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

## Workspace Cleanliness Gate (Mandatory, run before edits)

Set allowed pre-existing dirty files (use empty string if none).
**PM note:** run `git status --porcelain` before writing this prompt and list every tracked
dirty file here. If any dirty file would block `git checkout <BASE_BRANCH>`, resolve it
before issuing the prompt — do not list it here as a workaround.

```bash
export ALLOWED_DIRTY_FILES=""
```

Run gate:

```bash
UNEXPECTED=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  x="${line:0:1}"
  y="${line:1:1}"
  [ "$x" = "?" ] && [ "$y" = "?" ] && continue
  filepath="${line:3}"
  if [[ "$x" =~ [MADRCU] ]] || [[ "$y" =~ [MADRCU] ]]; then
    if [ -z "$ALLOWED_DIRTY_FILES" ] || ! echo ",$ALLOWED_DIRTY_FILES," | grep -qF ",$filepath,"; then
      UNEXPECTED="$UNEXPECTED\n  $filepath"
    fi
  fi
done < <(git status --porcelain)
if [ -n "$UNEXPECTED" ]; then
  echo -e "Unexpected pre-existing tracked changes:$UNEXPECTED" && exit 1
fi
echo "Cleanliness gate passed. Allowed dirty files: ${ALLOWED_DIRTY_FILES:-none}"
```

## Read only
1. `<doc-1>`
2. `<doc-2>`

## File ownership (edit only)
1. `<file-1>`
2. `<file-2>`

## Required changes
1. `<change-1>`
2. `<change-2>`

## Non-goals
1. `<non-goal-1>`
2. `<non-goal-2>`

## Validation
1. `npm run typecheck`
2. `npm run lint`
3. `<targeted-check-if-needed>`

## Pre-commit assertions
```bash
[ "$(git rev-parse --abbrev-ref HEAD)" = "$TASK_BRANCH" ] || { echo "Wrong branch"; exit 1; }
git status --short
```

## Git workflow
Follow `docs/commit-workflow.md` exactly.

## Commit assertions
```bash
git diff --cached --name-only
git show --name-only --oneline -n 1
[ "$(git rev-parse --abbrev-ref HEAD)" = "$TASK_BRANCH" ] || { echo "Branch drift detected"; exit 1; }
```

## Output file requirement (Mandatory)
Write the full final handoff report to:

- `artifacts/agent-handoffs/<PROMPT_ID>.result.md`

Do not return final results only in chat.

## Return format in result file (strict)
1. `PROMPT_ID`
2. `PROMPT_LABEL`
3. `PROMPT_TASK`
4. `EXPECTED_BRANCH`
5. `ACTUAL_BRANCH`
6. `BASE_BRANCH`
7. `BASE_SHA`
8. `FINAL_COMMIT_SHA`
9. `git show --name-only --oneline -n 1` output
10. Files changed
11. `ALLOWED_DIRTY_FILES` used
12. Detected pre-existing dirty files
13. Confirmation they were left untouched
14. Implemented behavior
15. Validation outputs
16. Risks/follow-ups
