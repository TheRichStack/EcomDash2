# EcomDash2

A self-hosted ecommerce reporting dashboard for DTC founders. Pulls live data from your Shopify store, Meta Ads, Google Ads, TikTok Ads, and Klaviyo into a private database. Served as a Next.js app on Vercel with hourly data syncs running automatically via GitHub Actions.

You own the code. You own the data. No third-party SaaS has access.

---

## For founders

### What you get

- **Overview** — revenue, orders, blended ROAS, MER, and profit at a glance with daily trend
- **Paid media** — channel-level breakdown across Meta, Google, and TikTok with creative performance gallery
- **Shopify** — profit and margin, product performance, inventory snapshots, and funnel conversion
- **Email** — Klaviyo campaign and flow performance
- **Settings** — connect your data sources, manage budgets, costs, and revenue targets
- **In-dashboard AI agent** — chat with your data, run pre-built analysis runbooks (daily trading pulse, paid media diagnostics, inventory risk, board summaries), powered by your own OpenAI or Anthropic API key

### Setting up

Open this repo in Cursor or Claude Code and follow [SETUP.md](SETUP.md).

Your AI assistant can guide you through each step — you do not need prior development experience.

> **Automated agentic setup is on the roadmap.** The goal is for an agent to run the entire setup with minimal input in a single session. That is not yet built. For now, SETUP.md walks you through each service step by step with your AI assistant alongside you.

---

## For developers and agents

### Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| UI | shadcn/ui + Tailwind CSS 4 |
| Charts | Recharts |
| Database | Turso (libSQL) |
| Hosting | Vercel |
| CI/CD | GitHub Actions |
| Job runtime | tsx |

### Structure

```
app/                  # Next.js App Router routes and API handlers
components/
  ui/                 # shadcn-generated primitives (CLI only — do not edit manually)
  shared/             # Reusable assemblies (KPI cards, section headers, tables)
  layout/             # App shell, sidebar, header
  agent/              # In-dashboard AI agent UI
config/               # Site, nav, and preview metadata
docs/
  ecomdash2/          # Design philosophy, backend boundary, page specs, UI guardrails
  UI_BUILDING.md      # UI rules for agents building dashboard pages
  PROJECT_STRUCTURE.md
lib/
  connectors/         # Shopify, Meta, Google, TikTok, Klaviyo API clients
  jobs/               # Job runners (hourly, backfill, reconcile, contracts)
  db/                 # Turso client, migrations, typed queries
  agent/              # In-dashboard agent runtime (orchestrator, tools, presets)
  metrics/            # 60+ metric definitions and registry
  env.ts              # Environment variable parsing
scripts/
  jobs/               # CLI entrypoints for job runners
  db/                 # Migration and seeding scripts
types/                # Shared TypeScript types
.github/workflows/    # CI and scheduled job workflows
```

See [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for folder-level placement rules.

### Running locally

```bash
npm install
cp .env.example .env.local   # fill in your values
npm run dev
```

Minimum vars required to load real data:

```
ECOMDASH2_TURSO_URL
ECOMDASH2_TURSO_AUTH_TOKEN
ECOMDASH2_DEFAULT_WORKSPACE_ID
```

### Job runners

```bash
npm run jobs:hourly
npm run jobs:backfill -- --from=2025-01-01 --to=2025-12-31 --resume
npm run jobs:reconcile
npm run jobs:contracts:refresh
```

### Verify before deploying

```bash
npm run lint
npm run typecheck
npm run build
```

### GitHub Actions workflows

| Workflow | Trigger |
|----------|---------|
| `ecomdash2-ci.yml` | Push to main |
| `ecomdash2-hourly-sync.yml` | Hourly schedule |
| `ecomdash2-daily-reconcile.yml` | Daily schedule |
| `ecomdash2-backfill.yml` | Manual dispatch |
| `ecomdash2-contract-refresh.yml` | Scheduled + manual |

Required secrets (GitHub repo Settings → Secrets and variables → Actions):

- `ECOMDASH2_TURSO_URL`
- `ECOMDASH2_TURSO_AUTH_TOKEN`
- `ECOMDASH2_DEFAULT_WORKSPACE_ID`
- `DATA_ENCRYPTION_KEY`
- Plus any connector credentials (see [SETUP.md](SETUP.md))

### Docs

- [SETUP.md](SETUP.md) — founder onboarding and connector setup guide
- [AGENTS.md](AGENTS.md) — rules for agents setting up or building the app
- [docs/ecomdash2/](docs/ecomdash2/) — design philosophy, backend boundary, page specs, UI guardrails
- [docs/UI_BUILDING.md](docs/UI_BUILDING.md) — UI building rules for agents
- [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) — folder conventions
