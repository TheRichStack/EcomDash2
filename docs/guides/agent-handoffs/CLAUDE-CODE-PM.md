# Claude Code — PM + Sub-Agent Workflow Guide

This is a reusable guide for running a PM/worker handoff system using Claude Code's
native **Agent tool** with `isolation: "worktree"`. It extends the core handoff system
described in `README.md` with everything specific to autonomous sub-agent execution.

---

## Starting a New Project — Choose Your Mode

When starting a new implementation plan, ask the user:

> **"Would you like to run this plan using autonomous sub-agents (Claude Code Agent tool),
> or do it the manual way where you paste each prompt into a worker session yourself?"**
>
> - **Sub-agent mode** — I spawn worker agents automatically. Faster, less copy-paste,
>   but requires a one-time permission setup (see below). Best for: mechanical tasks,
>   tasks with clear file scope, and any task where validation is deterministic.
>
> - **Manual mode** — You copy each `.prompt.md` file into a worker Claude session
>   yourself and paste the `.result.md` back. More control, works everywhere, no setup.
>   Best for: tasks that need human judgment mid-way, or environments without worktree support.

Record the user's choice in `PLAN.md` under a `## Execution Mode` heading so a resumed
session doesn't have to ask again.

---

## One-Time Setup for Sub-Agent Mode

Sub-agents run in isolated git worktrees. Because `.claude/settings.local.json` is
gitignored, it is **not present in worktrees**. Bash permissions must be set globally.

Add to **`~/.claude/settings.json`** (global user settings):

```json
{
  "permissions": {
    "allow": [
      "Bash(git:*)",
      "Bash(npm run:*)"
    ]
  }
}
```

Add any other project-specific commands your validation steps need (e.g. `Bash(npx tsc:*)`).

**Settings take effect after a Claude Code restart.** Make this change before starting
a sub-agent run, or sub-agents will be blocked from running git and npm commands.

> **Verify before every batch run** — not just first-time. Run:
> ```bash
> cat ~/.claude/settings.json | grep -A5 '"allow"'
> ```
> If `Bash(git:*)` and `Bash(npm run:*)` are absent, stop. Do not launch agents until they are present.
> If permissions are missing and you launch agents anyway, every agent will be blocked from git/npm
> and all their file edits will land as unstaged changes in the main working tree (see
> "Multiple agents contaminated the main working tree" in the failures section).

---

## Sub-Agent Execution

### Launching a worker sub-agent

```
Agent tool:
  subagent_type: general-purpose
  model: sonnet          ← always sonnet; never haiku for tasks with git/npm
  isolation: worktree    ← mandatory — gives the agent its own repo copy
  run_in_background: true
  prompt: |
    You are a worker agent. Read and execute the prompt file at:
      <repo>/artifacts/agent-handoffs/<PROMPT_ID>.prompt.md

    Follow it exactly. Do NOT ask for permission before running Bash commands — all
    git and npm commands are pre-authorized. Just proceed.

    When done, write your result to:
      artifacts/agent-handoffs/<PROMPT_ID>.result.md

    Working directory: <repo>
    Do not return final results only in chat — the result file is mandatory.
```

### Model Selection

| Task type | Model | Reason |
|-----------|-------|--------|
| Complex TypeScript refactoring, new patterns, LLM integration | `sonnet` | Fewer type errors on first attempt |
| Mechanical constant changes, flag flips, doc updates, config | `sonnet` | See haiku warning below |
| Anything touching >2 files with shared interfaces | `sonnet` | Reduces fix loops |

**Haiku — do not use for tasks that require git or npm.** Even with explicit "Do NOT ask
for permission — just proceed" instructions, haiku consistently stops and asks rather than
attempting Bash. This is a hard behavioural limit, not a prompt-wording problem. Haiku
is only appropriate for read-only research tasks that involve no shell commands.

**Sonnet quirk:** Sonnet tries Bash first. If blocked (permissions not yet set up), it
reports the failure clearly in the result file and still writes all code changes. The PM
can then run git/npm steps manually.

### What worktree isolation actually provides

`isolation: worktree` gives each agent:
- Its own git checkout on a separate branch (git operations are isolated)
- Its own CWD for Bash commands

**It does NOT isolate file I/O tools (Read/Edit/Write).** Those tools always resolve
paths relative to the main project root (`c:/Users/Rich/CursorApps/EcomDash2`), regardless
of which worktree the agent is in. This means:

- File edits from ALL agents (even parallel ones) land in the main working tree
- The only protection is that each agent commits its changes via git to its own branch
- If an agent can't run git (permissions blocked), its edits stay as unstaged changes
  in the main working tree — not isolated in any way

**Implication:** The "no overlapping files" rule for parallel agents is only safe when
global Bash permissions are set so agents can commit. Without git access, parallel agents
editing different files will all contaminate the main working tree simultaneously.

### After the sub-agent completes

The worktree branch is accessible in the main repo (worktrees share the same `.git` directory).
The PM reviews the result file and merges via `git merge --ff-only <branch>` from the main repo.
The worktree is cleaned up automatically.

---

## Parallel vs Sequential Execution

Running agents in parallel is faster but unsafe when tasks share files. Follow these rules:

### When parallel is safe ✓

Tasks can run in parallel only if their `EXPECTED_FILES_SCOPE` sets are **completely disjoint**.
If two tasks both touch `lib/agent/tools.ts` or `lib/agent/types.ts`, they will produce merge
conflicts — run them sequentially instead.

**Safe to parallelise:**
- Tasks that each create a new file with no shared dependencies
- Tasks in different subsystems (e.g. a DB migration task + an unrelated UI task)

**Not safe to parallelise:**
- Any two tasks that both modify the same registry file (e.g. `tools.ts`, `types.ts`)
- Tasks where one is a dependency of the other

### How to run parallel agents safely

1. Identify the shared files. If any overlap exists, convert to sequential.
2. If truly parallel: launch both Agent tool calls in the **same message** (parallel tool calls).
3. Each agent bases off the **same `BASE_SHA`** on `main`.
4. After both complete, resolve any merge conflicts manually before merging to main.
5. Document the conflict resolution in `PLAN.md`.

**Example of a safe parallel pair:** Two loaders in different files, neither touching `tools.ts`.
**Example of an unsafe pair:** Any two tasks that both add an entry to `TOOL_BUILDERS` —
run these sequentially, each basing off the previous task's merged commit.

### Sequential execution pattern

When tasks share files, run them sequentially:

1. Complete task A → merge to main → capture new `BASE_SHA`
2. Write task B prompt with the new `BASE_SHA`
3. Launch task B

The PM captures `BASE_SHA` at prompt-creation time with `git rev-parse main`.

---

## PM Workflow with Sub-Agents

### Creating a prompt

1. Run `git status --porcelain | grep -v "^??"` — confirm no unexpected tracked dirty files.
2. Run `git rev-parse main` — capture `BASE_SHA`.
3. Write `<PROMPT_ID>.prompt.md` using `TEMPLATE.prompt.md`.
4. Set task to `in-progress` in `PLAN.md`.

### Launching the agent

5. Launch sub-agent via Agent tool (see template above).
6. Set `run_in_background: true` — while it runs, write the next prompt if safe to do so.
7. Wait for task-notification.

### Reviewing the result

8. Read `<PROMPT_ID>.result.md`.
9. Verify commit: `git cat-file -e <sha>^{commit} && echo valid`
10. Verify files changed: `git show --name-only --oneline -n 1 <sha>`
11. Verify typecheck + lint outputs in the result file show 0 errors.
12. Spot-check the diff for the key required behaviors.
13. Approve or reject.

### After approval

14. `git checkout main && git merge --ff-only <branch>`
15. Update `PLAN.md`: status → `done`, fill `Commit` SHA.
16. Report `N% complete` (done rows / total rows).
17. Generate next prompt.

---

## Handling Sub-Agent Failures

### Agent blocked on Bash (permissions not set up)

**Symptom:** Result file says "Bash access was denied" but code edits were made.

**Recovery:** File edits land in the main working tree (file tools are not worktree-isolated).
Check `git status --porcelain | grep -v "^??"` — if the expected files show as modified,
review the diffs, run typecheck/lint, and commit manually:

```bash
git diff <file>            # verify the change is correct
npm run typecheck && npm run lint
git add <file>
git commit -m "fix: ..."
```

Then add `Bash(git:*)` and `Bash(npm run:*)` to `~/.claude/settings.json` and restart
Claude Code before the next sub-agent run.

### Agent asked for permission instead of proceeding (Haiku)

**Symptom:** Agent completed with only 2-3 tool uses, result file not written.

**Recovery:** Re-launch with **sonnet**, not haiku. The haiku Bash-blocking behaviour is
a hard limit that cannot be overcome with prompt wording alone.

### Multiple agents contaminated the main working tree

**Symptom:** `git status` shows several files dirty after parallel agents complete, some of which
belong to different tasks. Happens when global Bash permissions are absent and agents can't commit.

**Recovery:**
1. Run `git diff <file>` on each dirty file — verify each change is correct and complete.
2. Run `npm run typecheck && npm run lint` across all of them together.
3. Commit each file (or logical group) separately so history stays readable:
   ```bash
   git add lib/agent/context.ts
   git commit -m "fix: ..."
   git add lib/agent/orchestrator.ts
   git commit -m "fix: ..."
   ```
4. Any sonnet agents that also committed to their worktree branches will have duplicate work.
   Verify the worktree diffs match what you just committed, then discard those branches:
   ```bash
   git branch -D feat/<task-branch>
   ```
5. Fix global permissions before the next run.

### Typecheck or lint failed

**Symptom:** Result file shows errors; agent reports `FAILED` and did not commit.

**Recovery:** The task branch exists with the broken state. Either:
- Fix within scope yourself and commit to the same branch, or
- Reject and create a `-002` retry prompt with a `## Prior Attempt` section describing the error.

### Branch already exists

**Symptom:** Agent reports `ERROR: Task branch already exists`.

**Recovery:** The previous run got partway through. Inspect the branch, then either:
- Delete it and re-run: `git branch -D <branch>`
- Or pick up from it manually.

---

## When to Skip Sub-Agents

Use manual mode for a task if:

- The task requires judgment calls mid-implementation not covered by the prompt
- The task touches unfamiliar code where you want to review before committing
- The prompt is ambiguous and you expect the worker to need clarification
- The task is a one-liner (faster to just edit the file directly)

In these cases, create the `.prompt.md` file as normal, give it to a human worker session,
and paste the result back — the PM review flow is identical.

---

## Quick Reference

### Permissions (one-time, in `~/.claude/settings.json`)

```json
{ "permissions": { "allow": ["Bash(git:*)", "Bash(npm run:*)"] } }
```

Restart Claude Code after adding. Applies to all projects and all sub-agent worktrees.

### Agent tool launch template

```
subagent_type: general-purpose
model: sonnet          ← always sonnet; haiku blocks on Bash even with explicit permission
isolation: worktree
run_in_background: true
prompt: "You are a worker agent. Read and execute <PROMPT_ID>.prompt.md.
         Do NOT ask for permission before running Bash — just proceed.
         Write result to artifacts/agent-handoffs/<PROMPT_ID>.result.md."
```

### Parallel safety check

Before launching parallel agents, confirm both:
```
1. Bash(git:*) and Bash(npm run:*) present in ~/.claude/settings.json
2. No overlap in EXPECTED_FILES_SCOPE across the parallel tasks.
```
If permissions absent → stop, add them, restart Claude Code, then launch.
If file overlap exists → run sequentially.

### Progress reporting

After every approval:
```
Progress: N/T = X%   (N = done rows, T = total rows in PLAN.md)
```

---

## Templates

- `docs/guides/agent-handoffs/TEMPLATE.prompt.md` — prompt template
- `docs/guides/agent-handoffs/TEMPLATE.result.md` — result template
- `artifacts/agent-handoffs/PLAN.md` — live task registry (ephemeral, per-project)
- `docs/guides/agent-handoffs/README.md` — core handoff rules (model-agnostic)

This guide supplements `README.md` — all rules in `README.md` still apply.
