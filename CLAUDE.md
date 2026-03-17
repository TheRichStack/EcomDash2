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
| Building any UI | [docs/UI_BUILDING.md](docs/UI_BUILDING.md), [docs/ecomdash2/forbidden-abstractions.md](docs/ecomdash2/forbidden-abstractions.md) |
| Working on a specific page | [docs/ecomdash2/page-specs/](docs/ecomdash2/page-specs/) |
| Design and product scope | [docs/ecomdash2/design-philosophy.md](docs/ecomdash2/design-philosophy.md) |
| Data sources and table ownership | [docs/ecomdash2/backend-boundary.md](docs/ecomdash2/backend-boundary.md) |
| Jobs and connectors | [docs/ecomdash2/job-runtime-layout.md](docs/ecomdash2/job-runtime-layout.md) |
| In-dashboard AI agent | [docs/ecomdash2/agentic-brain-implementation.md](docs/ecomdash2/agentic-brain-implementation.md) |
| Metrics and KPIs | [docs/ecomdash2/metrics-engine.md](docs/ecomdash2/metrics-engine.md) |
| Folder placement rules | [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) |

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
- Only read/write tables listed in `docs/ecomdash2/backend-boundary.md`
- The in-dashboard AI agent (`lib/agent/`) is a real subsystem — read its doc before touching it
