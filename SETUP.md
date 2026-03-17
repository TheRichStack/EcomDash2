# EcomDash2 Setup Guide

This guide walks you through setting up EcomDash2 from scratch.

Open this repo in Cursor or Claude Code. Your AI assistant can help you complete each step — paste in the relevant section and ask it to guide you through. It can run commands on your behalf and explain anything that is unclear.

> **Automated agentic setup is coming.** The goal is for an agent to run the entire setup for you with minimal input. That is not yet built — for now, follow these steps. Your AI assistant can still answer questions and run commands for you throughout.

---

## What you need before you start

- A **GitHub account** (repo already created at setup)
- A **Vercel account** — [vercel.com](https://vercel.com) (free tier works)
- A **Turso account** — [turso.tech](https://turso.tech) (free tier works)
- Credentials for whichever data sources you want to connect (Shopify, Meta, Google, TikTok, Klaviyo)

---

## Step 1 — Create your Turso database

1. Sign in at [turso.tech](https://turso.tech)
2. Create a new database (any name, e.g. `ecomdash2`)
3. Copy the **Database URL** — it looks like `libsql://your-db-name-yourname.turso.io`
4. Generate an **Auth Token** from the database dashboard
5. Keep both — you will need them in the next step

---

## Step 2 — Configure your environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in the core values:

```
ECOMDASH2_TURSO_URL=libsql://your-db.turso.io
ECOMDASH2_TURSO_AUTH_TOKEN=your-token
ECOMDASH2_DEFAULT_WORKSPACE_ID=default
ECOMDASH2_DEFAULT_CURRENCY=GBP
```

Change `ECOMDASH2_DEFAULT_CURRENCY` to your currency code if not GBP (e.g. `USD`, `EUR`).

Then add credentials for each connector you want to use — see Step 3.

---

## Step 3 — Connect your data sources

Add the relevant env vars to `.env.local` for each platform you use. You only need to set up the ones you actively use.

### Shopify

You need a **Custom App** in your Shopify Admin.

1. Go to `Settings → Apps → Develop apps`
2. Create a new app and grant it `read_orders`, `read_products`, and `read_inventory` access
3. Install the app and copy the **Admin API access token**

```
SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxx
```

---

### Meta Ads

You need a **System User token** from Meta Business Manager with `ads_read` and `read_insights` permissions on your ad account.

```
META_ACCESS_TOKEN=your-long-lived-token
META_AD_ACCOUNT_ID=act_123456789
```

The account ID must include the `act_` prefix.

---

### Google Ads

Google Ads supports two connection modes:

**Option A — Direct API** (preferred)

You need a Google Ads developer token, OAuth client credentials, and a refresh token. Ask your AI assistant to walk you through the OAuth setup if needed.

```
GOOGLE_ADS_CUSTOMER_ID=123-456-7890
GOOGLE_ADS_DEVELOPER_TOKEN=your-dev-token
GOOGLE_ADS_CLIENT_ID=your-client-id
GOOGLE_ADS_CLIENT_SECRET=your-client-secret
GOOGLE_ADS_REFRESH_TOKEN=your-refresh-token
```

**Option B — Bridge (Google Ads Script fallback)**

If you use a Google Ads Script to export data, set this instead:

```
GOOGLE_ADS_TRANSPORT=bridge
```

Ask your AI assistant to help configure the bridge script if you go this route.

---

### TikTok Ads

You need a TikTok for Business **Marketing API** app with `Ad Data Read` permissions.

```
TIKTOK_ACCESS_TOKEN=your-access-token
TIKTOK_ADVERTISER_ID=1234567890123456789
```

The advertiser ID must be the exact integer as shown in TikTok Ads Manager — no scientific notation or formatting.

---

### Klaviyo

You need a **Private API Key** from Klaviyo with `Campaigns`, `Flows`, and `Metrics` read access. You also need your conversion metric ID.

```
KLAVIYO_PRIVATE_API_KEY=pk_xxxx
KLAVIYO_CONVERSION_METRIC_ID=your-metric-id
```

To find your conversion metric ID: go to Klaviyo → Analytics → Metrics → find your purchase or "Placed Order" metric → the ID is in the URL.

---

## Step 4 — Run database migrations

This creates all the required tables in your Turso database:

```bash
npm run db:migrate:apply
```

---

## Step 5 — Run a historical backfill

Pull your historical data into the database. Adjust the date range to suit your needs:

```bash
npm run jobs:backfill -- --from=2025-01-01 --to=2025-12-31 --resume
```

Then rebuild the reporting contract tables:

```bash
npm run jobs:contracts:refresh
```

This may take a few minutes depending on your data volume. The `--resume` flag means it will pick up where it left off if interrupted.

---

## Step 6 — Run locally and verify

```bash
npm install
npm run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) and check that data is loading on the overview page.

---

## Step 7 — Deploy to Vercel

If the Vercel CLI is available (your AI assistant can check):

```bash
vercel --prod
```

Or connect via the Vercel dashboard at [vercel.com](https://vercel.com) → New Project → Import from GitHub → select your EcomDash2 repo.

Add all your `.env.local` values as environment variables in the Vercel project settings before deploying.

---

## Step 8 — Set up GitHub Actions secrets

Go to your GitHub repo → Settings → Secrets and variables → Actions.

Add these secrets:

| Secret | Value |
|--------|-------|
| `ECOMDASH2_TURSO_URL` | Your Turso database URL |
| `ECOMDASH2_TURSO_AUTH_TOKEN` | Your Turso auth token |
| `ECOMDASH2_DEFAULT_WORKSPACE_ID` | Your workspace ID (e.g. `default`) |
| `DATA_ENCRYPTION_KEY` | A random 32-character string for encrypting stored API keys |

Add connector credentials too — the same keys you put in `.env.local` (e.g. `SHOPIFY_ACCESS_TOKEN`, `META_ACCESS_TOKEN`, etc.).

Your AI assistant can add these for you using the `gh` CLI if you have it installed.

Once secrets are set, the hourly sync workflow will run automatically every hour.

---

## Step 9 — Set up the in-dashboard AI agent (optional)

Once the dashboard is live, go to **Settings → Workspace → Agent** and enter your OpenAI or Anthropic API key.

The agent supports pre-built runbooks:

- Daily trading pulse
- Anomaly and issue scan
- Last 7 days commercial review
- Last month board summary
- Paid media diagnostics
- Product and merchandising performance
- Inventory risk and missed revenue
- Email and retention performance

Your API key is encrypted before being stored in your database. It is never shared externally.

---

## You are done

Your dashboard should now be live, syncing hourly, and ready to use.

If anything did not work, open this guide in your IDE and ask your AI assistant to help diagnose the issue. Share the error message and which step you were on.
