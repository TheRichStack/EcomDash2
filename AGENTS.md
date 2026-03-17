# EcomDash2 — Agent Guide

This file is for agents operating in this repository.

There are two modes. Read the one that matches your current task.

---

## Mode A — Helping a founder set up the app

You are helping a non-technical founder get EcomDash2 running from scratch. They may have no prior development experience.

### Your job

Walk the founder through [SETUP.md](SETUP.md) step by step.

You can:

- Run commands on their behalf (`npm install`, `vercel`, `gh`, `npm run db:migrate:apply`, etc.)
- Help them find and correctly format credentials from each platform
- Diagnose errors and explain what went wrong in plain terms
- Confirm each step worked before moving to the next

### Setup sequence

1. Create Turso database → copy URL and auth token
2. Copy `.env.example` to `.env.local` and fill in core vars
3. Add connector credentials for each platform they use (Shopify, Meta, Google, TikTok, Klaviyo)
4. Run `npm run db:migrate:apply`
5. Run backfill: `npm run jobs:backfill -- --from=YYYY-MM-DD --to=YYYY-MM-DD --resume`
6. Run `npm run jobs:contracts:refresh`
7. Start dev server (`npm run dev`) and verify dashboard loads
8. Deploy to Vercel (`vercel --prod`)
9. Set GitHub Actions secrets (`gh secret set` or via the GitHub UI)
10. Optionally configure the in-dashboard AI agent API key via Settings

### Questions to ask upfront

- Which platforms do they use? (Shopify / Meta / Google / TikTok / Klaviyo)
- What currency? (default is GBP — change `ECOMDASH2_DEFAULT_CURRENCY` if needed)
- What date range do they want to backfill from?

### Connector credential requirements

| Platform | Required env vars |
|----------|-------------------|
| Shopify | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ACCESS_TOKEN` |
| Meta | `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` |
| Google (direct) | `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN` |
| Google (bridge) | `GOOGLE_ADS_TRANSPORT=bridge` |
| TikTok | `TIKTOK_ACCESS_TOKEN`, `TIKTOK_ADVERTISER_ID` |
| Klaviyo | `KLAVIYO_PRIVATE_API_KEY`, `KLAVIYO_CONVERSION_METRIC_ID` |

### Diagnosing failures

- **DB connection errors** — check `ECOMDASH2_TURSO_URL` and `ECOMDASH2_TURSO_AUTH_TOKEN` are correct
- **Connector errors** — run `npm run jobs:hourly` locally to see which connectors report missing env vars
- **Vercel deploy errors** — run `vercel inspect --logs` or check the Vercel dashboard
- **GitHub Actions failures** — run `gh run view --log-failed` to identify the failing step

### Note on automated agentic setup

A future version of this project will allow an agent to run the full setup automatically (Turso provisioning, Vercel deploy, GitHub secrets, backfill) in a single session with minimal user input. This is not yet built. For now, use SETUP.md as the guide and assist the founder through each step.

---

## Mode B — Building or maintaining the codebase

You are helping add features, fix bugs, or maintain EcomDash2.

### Read first

Before starting any build task, read the relevant docs:

- `docs/ecomdash2/README.md` — product scope and what exists today
- `docs/ecomdash2/design-philosophy.md` — reporting-first, no exception-based UI
- `docs/ecomdash2/backend-boundary.md` — which tables this app owns
- `docs/UI_BUILDING.md` — UI rules and the inline-first principle
- `docs/ecomdash2/forbidden-abstractions.md` — what not to build
- `docs/ecomdash2/dashboard-patterns.md` — approved page structure
- `docs/ecomdash2/ui-guardrails.md` — component promotion rules
- `docs/ecomdash2/metrics-engine.md` — metric definitions and registry
- The relevant file under `docs/ecomdash2/page-specs/` if working on a specific page
- `docs/ecomdash2/agentic-brain-implementation.md` if working on the in-dashboard agent

### Source of truth priority

1. `docs/ecomdash2/` specs — always win
2. Existing app-owned runtime files
3. Inference from the codebase
4. Ask for clarification if genuinely ambiguous — do not widen scope casually

### Hard constraints

- Do not invent new UI wrapper families outside the approved dashboard patterns
- Do not add diagnostics, anomaly scoring, change-log, or action-rail systems
- Do not write EcomDash2 state into config keys that are not namespaced `ecomdash2.*`
- Do not promote a component to shared unless it is used in 2+ real pages and the props are stable
- Keep page-specific markup inline until reuse is real
- Keep `components/ui/` reserved for shadcn CLI output only — do not edit these files manually
- `npm run lint` must pass — do not suppress meaningful rules to force a pass

### Coding style

- TypeScript everywhere
- Prefer small, direct components over clever abstractions
- Kebab-case file names
- Use the existing `@/` import alias
- Name files after what they render or export — avoid vague buckets like `helpers.ts` or `misc.ts`

### File placement

| What | Where |
|------|-------|
| Route files | `app/` |
| shadcn primitives | `components/ui/` (CLI output only) |
| Reusable assemblies | `components/shared/` |
| App shell and layout | `components/layout/` |
| In-dashboard agent UI | `components/agent/` |
| Theme helpers | `components/theme/` |
| Static config and nav | `config/` |
| Reusable hooks | `hooks/` |
| Utilities, env, formatting | `lib/` |
| Job runners (CLI entrypoints) | `scripts/jobs/` |
| DB scripts | `scripts/db/` |
| Shared types | `types/` |
| Project docs | `docs/` |

See [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for detailed folder-level rules.

### Database and backend

- This app uses a shared Turso database — this is intentional for the current phase
- Only read from and write to the tables listed in `docs/ecomdash2/backend-boundary.md`
- All EcomDash2-owned config keys must be namespaced `ecomdash2.*`
- New migrations go in `lib/db/migrations/` using the next sequence number

### In-dashboard agent

The in-dashboard agent (`lib/agent/`) is a real app-owned analysis subsystem — not a thin wrapper. When working on it:

- Read `docs/ecomdash2/agentic-brain-implementation.md` first
- Tools live in `lib/agent/tools.ts` and wrap server-side loaders (not browser-side queries)
- Runbook prompts live in `docs/ecomdash2/agent-runbooks.md`
- Runbook runtime config (execution mode, tool bundle, scope) lives in `lib/agent/presets.ts`
- Prefer deterministic `tools` mode over free-form LLM synthesis for data-answering runbooks
- Encrypted API key storage uses `DATA_ENCRYPTION_KEY` — do not log or expose decrypted values

### Component promotion rules

Only promote a component from inline to `components/shared/` if:

- Used in 2+ real pages
- The composition is stable (not still changing)
- Props are obvious and small
- It does more than rename a shadcn primitive

When in doubt, keep it inline.

### Work order workflow

For any substantial task:

1. Read the named spec docs
2. Inspect only the minimum app files needed
3. Implement in app-owned files
4. Verify: `npm run lint && npm run typecheck`
5. Call out any unresolved backend coupling or missing context explicitly

### If context is missing

- Prefer the page spec over inference
- Prefer the backend boundary doc over convenience shortcuts
- Ask for a tighter scope rather than widening the task
