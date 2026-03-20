# EcomDash2 — Claude Code Context

EcomDash2 is a self-hosted ecommerce reporting dashboard for DTC founders. It pulls data from Shopify, Meta, Google, TikTok, and Klaviyo into a Turso (libSQL) database and serves a Next.js dashboard on Vercel. GitHub Actions runs hourly syncs automatically.

The repo root is the app root. There is no parent repo.

## Hard constraints

- Do not invent new UI wrapper families — use shadcn primitives and approved assemblies only
- Do not add diagnostics, anomaly scoring, change-log, or action-rail systems
- Keep page-specific markup inline until reuse across 2+ real pages is proven
- `components/ui/` is reserved for shadcn CLI output — do not edit manually
- All EcomDash2-owned config keys must be namespaced `ecomdash2.*`
- `npm run lint` must pass — do not suppress rules to force it

## Where to go by task

| Task | Read first |
|------|------------|
| Setting up the app (founder) | [SETUP.md](SETUP.md) |
| Full agent rules | [AGENTS.md](AGENTS.md) |
| Building any UI | [docs/guides/ui-building.md](docs/guides/ui-building.md), [docs/decisions/forbidden-abstractions.md](docs/decisions/forbidden-abstractions.md) |
| UI patterns and guardrails | [docs/decisions/dashboard-patterns.md](docs/decisions/dashboard-patterns.md), [docs/decisions/ui-guardrails.md](docs/decisions/ui-guardrails.md) |
| Working on a specific page | [docs/ecomdash2/page-specs/](docs/ecomdash2/page-specs/) |
| Design and product scope | [docs/ecomdash2/README.md](docs/ecomdash2/README.md), [docs/decisions/design-philosophy.md](docs/decisions/design-philosophy.md) |
| Data sources and table ownership | [docs/reference/backend-boundary.md](docs/reference/backend-boundary.md) |
| Jobs and connectors | [docs/reference/job-runtime-layout.md](docs/reference/job-runtime-layout.md) |
| MCP server and agent data engine | [docs/reference/agent/README.md](docs/reference/agent/README.md) |
| PM/worker agent handoff system | [docs/guides/agent-handoffs/README.md](docs/guides/agent-handoffs/README.md), [docs/guides/agent-handoffs/CLAUDE-CODE-PM.md](docs/guides/agent-handoffs/CLAUDE-CODE-PM.md), [docs/guides/agent-handoffs/CODEX-CURSOR-PM.md](docs/guides/agent-handoffs/CODEX-CURSOR-PM.md), [docs/guides/agent-handoffs/TEMPLATE.codex.prompt.md](docs/guides/agent-handoffs/TEMPLATE.codex.prompt.md) |
| Metrics and KPIs | [docs/reference/metrics-engine.md](docs/reference/metrics-engine.md) |
| Folder placement rules | [docs/reference/project-structure.md](docs/reference/project-structure.md) |

## Key commands

```bash
npm run dev              # local dev
npm run lint             # must pass before any commit
npm run typecheck        # must pass before any commit
npm run build            # production build check
npm run jobs:hourly      # run hourly sync locally
npm run db:migrate:apply # apply pending migrations
```

## Notes

- The Turso database is currently shared with a prior version of the app — this is intentional
- Only read/write tables listed in `docs/reference/backend-boundary.md`
- `lib/agent/` is the data engine for the MCP server — only `tools.ts`, `anomalies.ts`, `types.ts`, and `constants.ts` remain
- The MCP server lives at `lib/mcp/` and `app/api/mcp/route.ts` — see `docs/reference/agent/README.md`
- When asked to "create a plan" for any multi-step task, read `docs/guides/agent-handoffs/README.md` and create `artifacts/agent-handoffs/PLAN.md` automatically — do not ask where to put files. Delete all artifacts when the plan is complete.
