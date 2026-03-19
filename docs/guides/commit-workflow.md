# Commit Workflow (Atomic + Context-Preserving)

Use this checklist in Claude Code, Cursor, or Codex. The goal is clean atomic commits plus durable context in git history.

## 1. Review changes

```bash
git status --short
git diff --stat HEAD
git diff HEAD
git ls-files --others --exclude-standard
```

Choose one unit of work for this commit. If the diff contains unrelated edits, split into separate commits.

## 2. Run quality gates before staging

For this repo, run:

```bash
npm run lint
npm run typecheck
```

Run additional checks only when relevant (example: `npm run build`).

## 3. Stage only files for this unit of work

Do not stage:
- `.env*` or credential files
- large generated artifacts (`.next/`, logs, caches, binaries)
- files unrelated to the current task
- partial hunks you do not understand

Validate staged content:

```bash
git diff --cached --stat
git diff --cached
```

## 4. Write an atomic commit message

Use conventional commit tags:
- `feat:` new capability
- `fix:` bug fix
- `refactor:` restructure without behavior change
- `docs:` documentation-only change
- `test:` test changes
- `chore:` tooling/build/CI
- `perf:` performance improvement

Suggested format:

```text
tag(scope): concise change summary

Why:
- reason this change is needed

What:
- key behavior/code changes

[Optional footer: Fixes #123]
```

Examples:

```text
feat(agent): add guarded retry around tool execution
fix(workflows): prevent stale cursor date writes on partial failure
docs(setup): clarify Turso token format in startup guide
```

## 5. Capture long-term context in commit body

If this commit changes agent instructions, operating docs, specs, or runbooks, include a `Context:` section. This is required for preserving long-term memory.

Example:

```text
feat(agent): add retry handling for orchestrator tool calls

Why:
- single transient tool failures were ending valid runs

What:
- added bounded retry with explicit failure classification

Context:
- Updated docs/ecomdash2/agentic-brain-implementation.md with retry semantics
- Updated docs/ecomdash2/agent-primitives-inventory.md to reflect retry-safe calls
- Updated AGENTS.md workflow notes for validation expectations
```

Context files in this repo commonly include:
- `.cursorrules`
- `AGENTS.md`
- `CLAUDE.md`
- `.claude/*.md` and `.claude/settings.local.json` (local by default)
- `docs/ecomdash2/**/*.md`
- `docs/UI_BUILDING.md`
- `docs/PROJECT_STRUCTURE.md`

Why this matters: git history is the durable memory across sessions and tools. Without explicit context in commit bodies, future agents lose the reasoning behind rules, specs, and workflow choices.

## 6. Commit

```bash
git commit
```

Optional: for major product/runtime milestones, update `docs/ecomdash2/EXECUTION_TRACKER.md` in the same PR or immediately after.

## Delegated agent handoffs (file-based)

When delegating work to other agents, store prompts and outputs under:

- `artifacts/agent-handoffs/`

Use paired files:

- `<PROMPT_ID>.prompt.md`
- `<PROMPT_ID>.result.md`

Each result file must include prompt identity, branch/base SHA, final commit SHA, and `git show --name-only --oneline -n 1` output so reviews are traceable and branch drift is detectable.
