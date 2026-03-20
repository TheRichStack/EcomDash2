# Agent Handoff System (Reusable, PM-Driven)

Use this as a reusable multi-agent workflow for any repository.

This folder is the source of truth for delegated implementation handoffs.

## Core Model

1. One PM agent coordinates work.
2. Worker agents implement one prompt at a time.
3. Every handoff writes files in this folder:
   - `<PROMPT_ID>.prompt.md`
   - `<PROMPT_ID>.result.md`
4. PM reviews the result file plus actual git commit/diff before approval.
5. If approved, PM immediately generates the next prompt.
6. After every review output, PM reports plan progress as `N% complete`.

## Roles

### PM Agent (you)

1. Owns plan sequencing and risk management.
2. Owns git hygiene policy and branch discipline.
3. Creates prompt files and validates result files.
4. Verifies each claimed change from the actual commit/diff and validation commands.
5. Approves or rejects each handoff.
6. Always reports `% complete` after each review.
7. Generates the next prompt automatically after approval.
8. Keeps `PLAN.md` up to date after every review (see Plan Document below).

### Worker Agent

1. Executes exactly one prompt file.
2. Follows branch lock and cleanliness gate rules.
3. Edits only owned files.
4. Runs required validation commands.
5. Writes final report to the required `.result.md` file.
6. If validation fails: stop, report failure in result file, do not commit broken work.

## Plan Document (`PLAN.md`)

The PM must maintain `artifacts/agent-handoffs/PLAN.md` as a durable task registry.
This file survives context resets and lets a fresh PM session resume without losing state.

### Required columns

| Column | Description |
|--------|-------------|
| `ID` | `PROMPT_ID` (e.g. `W4-A-GUARDRAIL-TESTS-001`) |
| `Task` | One-line description |
| `Branch` | Task branch name |
| `Depends-on` | `PROMPT_ID` of blocking predecessor, or `—` |
| `Status` | `pending` / `in-progress` / `done` / `rejected` / `retry` |
| `Commit` | Final commit SHA once done, else `—` |

### Rules

- Update status to `in-progress` when a prompt file is created.
- Update status to `done` and fill `Commit` when a handoff is approved.
- Update status to `rejected` or `retry` when a handoff is rejected.
- Never delete rows; rejected tasks stay in the table with their status.
- The `% complete` denominator comes from this table (done / total).

## PROMPT_ID Naming Convention

IDs follow the pattern `W<N>-<Letter>-<SLUG>-<SEQ>`:

- `W<N>` — work week or iteration number (e.g. `W4`)
- `<Letter>` — task order within that week (`A`, `B`, `C` …)
- `<SLUG>` — short uppercase description (e.g. `GUARDRAIL-TESTS`)
- `<SEQ>` — always `001` for originals; increment to `002`, `003` … for retries

Example: `W4-A-GUARDRAIL-TESTS-001` → retry → `W4-A-GUARDRAIL-TESTS-002`

## Required File Names

Use one prompt file and one result file per task:

- `<PROMPT_ID>.prompt.md`
- `<PROMPT_ID>.result.md`

Example:

- `W4-A-GUARDRAIL-TESTS-001.prompt.md`
- `W4-A-GUARDRAIL-TESTS-001.result.md`

## Required Identity Fields

Every prompt and result file must include:

- `PROMPT_ID`
- `PROMPT_LABEL`
- `PROMPT_TASK`
- `EXPECTED_BRANCH`
- `BASE_BRANCH`
- `BASE_SHA`

Result files must also include:

- `ACTUAL_BRANCH`
- `FINAL_COMMIT_SHA`
- `git show --name-only --oneline -n 1` output

## Hard-Fail Rejection Rules

Reject the handoff if any are true:

1. `PROMPT_ID` in result does not match prompt filename.
2. `PROMPT_LABEL` in result does not match prompt filename.
3. `ACTUAL_BRANCH` does not match `EXPECTED_BRANCH`.
4. `BASE_BRANCH` or `BASE_SHA` mismatch.
5. Changes are outside `EXPECTED_FILES_SCOPE`.
6. Required validations were skipped or failed.
7. Reported commit SHA is invalid (`git cat-file -e <sha>^{commit}` fails).

## Rejection and Retry Path

When a handoff is rejected:

1. PM marks the task `rejected` in `PLAN.md` with a reason note.
2. PM creates a new prompt file with an incremented sequence number (`-002`).
   - Use the same `BASE_BRANCH` and `BASE_SHA` as the original.
   - The new prompt's `BASE_BRANCH` is the **original base branch** (not the rejected task branch).
   - Include a `## Prior Attempt` section summarising what went wrong.
3. The rejected task branch is left as-is (do not delete it — it is evidence).
4. Worker checks out from the original base branch, creates the new task branch fresh.
5. If the rejected branch contains partial useful work, the PM must explicitly call it out in the new prompt under `## Prior Attempt`; the worker does not cherry-pick silently.

## Worker Validation Failure Path

If a validation command fails (typecheck, lint, or a custom check):

1. Attempt to fix the issue within the allowed file scope.
2. If fixed: re-run all validations, commit, and write result file normally.
3. If not fixable within scope: write result file with status `FAILED`, include full error output, and do not commit broken work.
4. Do not suppress lint rules or typecheck errors to force passage.

## Branch Lock Policy (Mandatory in every prompt)

1. Never switch branches after setup.
2. Never run `git reset`, `git cherry-pick`, `git rebase`, or `git merge`.
3. Stop immediately if setup checks fail.
4. If task branch already exists, fail and report.

## Workspace Cleanliness Gate (Mandatory in every prompt)

Always declare allowed pre-existing dirty files explicitly, then fail on unexpected tracked changes.

**Shell note:** `TEMPLATE.prompt.md` is written in **bash** for Claude Code.
If you run this workflow in Codex/Cursor, use PowerShell-safe equivalents and follow
`CODEX-CURSOR-PM.md`.

Use the cleanliness gate pattern from `TEMPLATE.prompt.md` exactly (do not trim away the status prefix before slicing path names).

## Branch Integration and Merge Strategy

Task branches are not merged automatically. The PM is responsible for integration.

### Integration rules

1. Only merge a task branch after its handoff is approved and `PLAN.md` shows `done`.
2. Merge into the downstream base branch (not necessarily `main`) using a regular merge commit.
3. Never fast-forward merge task branches — preserve the branch history.
4. After merging, note the merge commit in `PLAN.md` under a `Merged-into` column.
5. Merge to `main` only when a full milestone (logical group of tasks) is complete and all validations pass on the merged state.
6. The PM creates merge commits; workers do not merge.

## PM Pre-Flight Checklist (Before Creating Any Prompt)

Run these checks **before** writing the prompt file. A prompt issued against a dirty or
wrong-branch workspace will fail at the worker's first step.

1. Run `git status --porcelain` and note every tracked dirty file (lines not starting with `??`).
2. If any tracked files are dirty, either:
   - Commit or stash them on the current branch first, **or**
   - List them explicitly in `ALLOWED_DIRTY_FILES` in the prompt — but only if they are
     outside the task's `EXPECTED_FILES_SCOPE` and will not block `git checkout <BASE_BRANCH>`.
3. Verify `git checkout <BASE_BRANCH>` would succeed (dry-run mentally: no dirty files that
   overlap with the base branch's state). If it would fail, resolve before issuing the prompt.
4. Confirm `git rev-parse <BASE_BRANCH>` matches the `BASE_SHA` you intend to put in the prompt.
5. Only then write the prompt file and set the task to `in-progress` in `PLAN.md`.

**Key rule:** `ALLOWED_DIRTY_FILES` in the prompt must be accurate — list every tracked
dirty file that will exist when the worker starts, or the cleanliness gate will reject them.
If dirty files block `git checkout <BASE_BRANCH>`, they must be resolved before the prompt
is issued — they cannot be listed as allowed.

---

## PM Review Checklist (Every Handoff)

1. Open `<PROMPT_ID>.result.md`.
2. Verify commit exists and matches report:
   - `git rev-parse <short-or-full-sha>`
   - `git show --name-only --oneline -n 1 <sha>`
3. Verify changed files stay in scope.
4. Inspect patch content for each required behavior.
5. Re-run required validations locally when feasible.
6. Confirm pre-existing dirty files were untouched.
7. Approve or reject with concrete reasons.
8. Update `PLAN.md` with new status and commit SHA.
9. Report `% complete` (derived from `PLAN.md` row count).
10. If approved, generate next prompt file immediately.

## Progress Reporting Rule

After every PM review output, include:

- `Plan progress: <N>% complete`

Derive `N` from `PLAN.md`: `(done rows) / (total rows) * 100`.
Do not estimate — count rows.

## Git and Commit Hygiene Rules

1. Use `docs/guides/commit-workflow.md` if present in the repo.
2. Require:
   - focused commit message (`Why` + `What`)
   - pre-commit branch assertion
   - post-commit assertion with `git show --name-only --oneline -n 1`
3. Do not allow handoff approval based only on narrative claims; verify against git objects.

## Reusable PM Kickoff Prompt (Copy/Paste)

Use this in a new repo/session to establish the same workflow:

```md
You are the PM agent for this repo.

Operate with a file-based handoff system under `artifacts/agent-handoffs/`:

Read `docs/guides/agent-handoffs/README.md` in full before doing anything else.
Read `artifacts/agent-handoffs/PLAN.md` to recover current task state if it exists.

Your responsibilities:
1. Maintain `artifacts/agent-handoffs/PLAN.md` as the durable task registry.
   Columns: ID | Task | Branch | Depends-on | Status | Commit
2. Break work into one prompt at a time using the ID convention W<N>-<Letter>-<SLUG>-001.
3. For each task, create `<PROMPT_ID>.prompt.md` using TEMPLATE.prompt.md as the base.
   - Set status to `in-progress` in PLAN.md when the prompt is created.
4. Enforce in every prompt:
   - Branch lock (no reset/rebase/merge/cherry-pick)
   - Workspace cleanliness gate (bash scripts — workers run these in bash)
   - File ownership (EXPECTED_FILES_SCOPE)
   - Validation commands (typecheck + lint minimum)
5. Require result files to include:
   - All identity fields (PROMPT_ID, ACTUAL_BRANCH, BASE_SHA, FINAL_COMMIT_SHA)
   - Full validation outputs
   - Risks/follow-ups
6. After each worker handoff:
   - Verify reported commit/diff directly in git (`git show --name-only --oneline -n 1 <sha>`)
   - Approve or reject with concrete reasons
   - Update PLAN.md (status + commit SHA)
   - If approved, generate the next prompt automatically
   - If rejected, create a -002 retry prompt with a Prior Attempt section
7. Integration: the PM merges approved branches — workers never merge.
8. After every review response, report: `Plan progress: N% complete` (from PLAN.md row count).

Hard rule: do not approve any handoff that cannot be verified from actual repository state.
```

## Templates

Base templates live here:

- `docs/guides/agent-handoffs/TEMPLATE.prompt.md`
- `docs/guides/agent-handoffs/TEMPLATE.codex.prompt.md`
- `docs/guides/agent-handoffs/TEMPLATE.result.md`

Engine-specific PM guides:

- `docs/guides/agent-handoffs/CLAUDE-CODE-PM.md`
- `docs/guides/agent-handoffs/CODEX-CURSOR-PM.md`

Use these as defaults, then fill task-specific scope and checks.
