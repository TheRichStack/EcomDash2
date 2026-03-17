# Ecom Dash Agentic Brain Runbooks

This file defines the initial runbook set for the Agentic Brain inside Ecom Dash.

The goal is to make each runbook feel like a genuinely useful operator tool, not a gimmicky summary prompt. Each runbook should help an ecommerce owner or operator quickly understand what changed, why it changed, what matters most, and what to do next.

---

## Shared runbook design principles

Every runbook should be built to do the following:

- Focus on commercial impact, not just metric reporting.
- Prioritise the few changes that explain most of the outcome.
- Quantify important claims wherever possible.
- Separate signal from noise.
- Surface actionable next steps, not generic advice.
- Be honest about uncertainty, missing data, or low confidence.
- Act like an ecommerce owner, operator, or commercial lead reviewing the business.

---

## Shared rules for all runbooks

Use these rules, or a close variation, in every runbook prompt:

```text
Rules:
- Use only the available business data and tool outputs.
- Quantify every meaningful claim.
- Prioritise by commercial impact, not by metric count.
- Focus on the few changes that explain most of the result.
- Do not restate obvious metric changes without interpretation.
- Do not provide generic ecommerce advice.
- If evidence is weak or unavailable, say so clearly.
- Prefer decisive recommendations over broad brainstorming.
- Separate signal from noise.
- Be concise, commercially literate, and action-oriented.
```

---

## Shared response framework

Most runbooks should follow this core output shape unless there is a good reason not to:

1. **Executive takeaway**
2. **KPI scorecard**
3. **Main drivers**
4. **Pareto / biggest contributors**
5. **Risks and opportunities**
6. **Recommended actions**
7. **Confidence / data caveats**

This keeps the runbooks consistent and makes the UI feel intentional.

---

# Runbook 1: What happened yesterday?

**Internal name:** `daily-trading-pulse`

**Purpose:**
Daily operator review. This should answer: what happened yesterday, what drove it, and what needs action today?

**Recommended UI description:**
Yesterday's business performance with comparisons, key drivers, and the top actions to take today.

**Recommended visuals:**
- KPI scorecard table
- 7-day trend line for revenue, orders, and conversion rate
- Top product revenue bar chart

**Prompt:**

```text
Review yesterday's performance across revenue, orders, conversion rate, average order value, sessions/traffic, spend, MER/ROAS if available, contribution margin/profit if available, top products, and email revenue.

Compare yesterday against:
1) the prior day,
2) the same weekday last week,
3) the current week's pace where relevant.

Your job is to act like a commercially-minded ecommerce operator, not a generic analyst.

Prioritise the biggest commercial changes only. Quantify every claim. Do not list minor noise unless it is part of a clear pattern.

Output in this structure:

1. Executive takeaway
Give me the 3 to 5 most important things I need to know from yesterday in plain English, ranked by likely business impact.

2. KPI scorecard
Return a compact table with yesterday, prior day, same weekday last week, absolute change, and percentage change for:
- revenue
- orders
- conversion rate
- AOV
- sessions or traffic
- ad spend
- MER or blended ROAS
- profit/contribution margin if available
- email revenue if available

3. What drove the change
Explain the main drivers behind revenue movement. Separate into:
- traffic-driven
- conversion-driven
- AOV-driven
- product mix-driven
- channel-driven
- email-driven
- paid media-driven

Be explicit about what actually caused the movement, not just which metrics also moved.

4. Product highlights
Show:
- top 5 products by revenue yesterday
- top 5 products by units yesterday
- products with the biggest positive or negative revenue change vs same weekday last week
- any product with unusually high views and weak conversion, if available

5. Paid media check
State whether paid media efficiency improved or worsened yesterday and whether the change appears to be caused by spend, CPM/CPC, CTR, CVR, CPA, or tracked revenue.

6. Risks and opportunities
List up to 5 issues or opportunities that deserve action today only. Focus on impact, not completeness.

7. Recommended actions
Give the top 3 actions I should take today. Each action must include:
- what to do
- why it matters
- expected outcome
- urgency level: today / this week / watch

8. Data caveats
State what data was missing, delayed, or ambiguous and how that affects confidence.

Recommended visuals:
- revenue yesterday vs prior day vs same weekday last week
- orders and conversion rate trend for last 7 days
- top product revenue bar chart for yesterday

Do not pad the answer. Be concise, commercial, and evidence-based.
```

---

# Runbook 2: What needs attention?

**Internal name:** `anomaly-and-issue-scan`

**Purpose:**
Surface issues, anomalies, possible tracking errors, unusual performance, and anything that looks broken or abnormal.

**Recommended UI description:**
Find the unusual movements, hidden issues, and likely tracking problems that need investigation.

**Recommended visuals:**
- Anomaly timeline on revenue, spend, and orders
- Table of flagged anomalies with severity
- Contribution table by product and channel

**Prompt:**

```text
Run an anomaly scan across the current selected period and compare it with the immediately preceding equivalent period.

Search for statistically or operationally meaningful anomalies across:
- total revenue and orders
- traffic or sessions
- conversion rate
- AOV
- ad spend and paid media efficiency
- product revenue, units, and conversion
- inventory and stockouts
- email sends, opens, clicks, revenue, and unsubscribe rate
- data freshness or missing syncs if available

Do not return a generic summary. Only surface anomalies that are likely to matter commercially or operationally.

For each anomaly, provide:
- what changed
- how large the change is
- when it started
- likely causes
- confidence level
- whether this looks like a real commercial issue, a tracking issue, or normal volatility

Output in this structure:

1. Critical anomalies
List only the highest-severity anomalies first.

2. Likely tracking/data issues
Flag anything that looks like broken attribution, stale data, missing spend, missing orders, sudden zeroes, duplicated spikes, or sync failures.

3. Commercial anomalies
Flag sudden swings in:
- product demand
- conversion
- AOV
- ad efficiency
- email performance
- inventory position

4. Pareto impact
Estimate which anomalies explain most of the commercial movement. Focus on the few drivers causing most of the change.

5. Recommended actions
For each critical anomaly, give the next best action, owner type, and urgency:
- investigate now
- action today
- monitor

Recommended visuals:
- anomaly timeline on revenue/spend/orders
- table of flagged anomalies with severity
- top products/channels contributing to abnormal movement

Be strict. It is better to return 4 important anomalies than 20 weak ones.
```

---

# Runbook 3: How did the last 7 days go?

**Internal name:** `last-7-days-commercial-review`

**Purpose:**
Weekly operating review. This should explain the last 7 days versus the prior 7 days and tell the owner what to focus on next.

**Recommended UI description:**
A weekly commercial review of the business with the biggest drivers, channel performance, and next priorities.

**Recommended visuals:**
- 14-day trend chart for revenue, spend, and MER
- Product winners and laggards bar chart
- Channel comparison table

**Prompt:**

```text
Summarise the last 7 days versus the prior 7 days. Focus on the most important commercial changes and the recommended next actions.

Act as an ecommerce operator reviewing the business for weekly decision-making.

Analyse:
- revenue
- orders
- conversion rate
- AOV
- traffic/sessions
- ad spend
- MER/blended ROAS
- profit or contribution margin if available
- top channels
- top products
- email/lifecycle contribution
- inventory risk or missed sales risk if available

Output in this structure:

1. Weekly executive summary
Give 5 to 7 key findings ranked by business impact.

2. KPI bridge
Show what explains the revenue movement. Break it into:
- traffic change
- conversion change
- AOV change
- product mix change
- paid media change
- email change

3. Channel performance
Provide a table showing the main sales/acquisition channels with:
- revenue
- spend if relevant
- orders
- efficiency metric
- change vs prior 7 days
Call out which channels are scaling well, weakening, or need investigation.

4. Product performance
Show:
- winners: top products driving growth
- laggards: products dragging performance
- products with strong demand but low stock cover
- products with strong traffic but weak conversion

5. Paid media diagnosis
Explain whether paid media improved or worsened because of:
- spend
- CPM/CPC
- CTR
- conversion rate
- CPA
- tracked revenue
State what should be changed in budget allocation this week.

6. Email and retention
Explain how much email/lifecycle contributed to the week and whether it supported or failed to support overall trading.

7. This week's priorities
Give the top 5 actions for the next 7 days. Rank by expected commercial impact.

Recommended visuals:
- 14-day trend chart for revenue, spend, MER
- product winners/laggards bar chart
- channel comparison table

Be decisive and practical. Avoid generic advice.
```

---

# Runbook 4: Give me last month's trading review

**Internal name:** `last-month-board-summary`

**Purpose:**
Monthly review of the last full calendar month versus the prior full calendar month. This should feel like a proper trading post-mortem.

**Recommended UI description:**
A rigorous monthly trading summary showing what changed, what drove it, and what matters next.

**Recommended visuals:**
- Month vs prior month KPI table
- Revenue bridge or decomposition chart
- Last 60 days trend line for revenue, spend, and MER
- Top products chart
- Channel performance table

**Prompt:**

```text
Review the last full calendar month and compare it with the prior full calendar month.

Your goal is to produce a commercially rigorous monthly trading summary for an ecommerce owner. Focus on the few changes that explain most of the outcome. Avoid vanity commentary.

Analyse:
- revenue
- orders
- conversion rate
- AOV
- traffic/sessions
- new vs returning customer mix if available
- ad spend
- MER/blended ROAS
- channel contribution
- product/category performance
- discounts/promotions if visible
- profit or contribution margin if available
- email/lifecycle performance
- inventory availability and stockout impact if available

Output in this structure:

1. Executive summary
Provide the 5 to 8 most important commercial takeaways from the month.

2. KPI summary table
Return month, prior month, absolute change, percentage change for all core KPIs.

3. Revenue decomposition
Explain the revenue change by decomposing into:
- traffic
- conversion
- AOV
- customer mix
- product mix
- paid media
- email
- stock availability
Only include factors supported by evidence.

4. Pareto analysis
Identify the small number of products, channels, campaigns, or changes that drove most of the month's gain or loss.

5. Product performance
Show:
- top products by revenue
- top products by units
- products with strongest month-on-month growth
- products with steepest decline
- products with high demand but poor availability
- products with poor conversion despite high traffic

6. Marketing and channel performance
Show which channels created efficient growth and which channels consumed spend without sufficient return.

7. Retention and email
Evaluate whether repeat demand and lifecycle marketing strengthened or weakened during the month.

8. Risks
Flag the most important risks entering the next month:
- stock risk
- paid efficiency deterioration
- over-reliance on a single product or channel
- falling conversion
- weak customer quality
- data gaps

9. Recommended actions
Give the top 5 actions for next month. For each one include:
- action
- rationale
- expected commercial impact
- whether it is a revenue lever, margin lever, or risk reduction lever

10. One-paragraph operator verdict
Answer this plainly: Was this a good month, why, and what matters most next?

Recommended visuals:
- month vs prior month KPI table
- revenue bridge or decomposition chart
- channel performance table
- top products chart
- last 60 days trend line for revenue, spend, and MER

Be commercially sharp and direct.
```

---

# Runbook 5: Why are ads up or down?

**Internal name:** `paid-media-diagnostics`

**Purpose:**
Tactical paid media review that explains why paid performance changed and what budget or campaign decisions should follow.

**Recommended UI description:**
A performance marketing diagnostic showing what changed in paid media and where budgets should move next.

**Recommended visuals:**
- Spend vs revenue trend
- Platform comparison table
- Campaign efficiency table
- Top and bottom campaign bar charts

**Prompt:**

```text
Analyse paid media performance for the selected period compared with the previous equivalent period.

Focus on commercial diagnostics, not just reporting.

Review platform and campaign performance across spend, impressions, CPM, clicks, CTR, CPC, landing page views if available, add-to-cart, checkout, purchases/orders, CPA, tracked revenue, ROAS, MER/blended impact, and profit efficiency if available.

Output in this structure:

1. Paid media verdict
State clearly whether paid media improved, deteriorated, or held steady, and why.

2. KPI driver tree
Explain performance movement as a funnel:
- spend
- reach/impressions
- CPM
- CTR
- CPC
- landing page engagement if available
- site conversion rate
- CPA
- tracked revenue / ROAS
- blended impact on the business

3. Platform summary
Compare Meta, Google, TikTok, or other available channels in a table with:
- spend
- revenue
- ROAS
- CPA
- change vs previous period
- commercial comment

4. Campaign analysis
Identify:
- top scaling candidates
- inefficient campaigns to cut or fix
- campaigns with good traffic signals but poor site conversion
- campaigns with weak CTR or rising CPM
- campaigns with strong blended value but weak tracked attribution, if evidence supports this

5. Creative and audience signals
If creative/ad-level evidence exists, identify which creatives or audience segments are fatigue risks, emerging winners, or clear losers.

6. Budget reallocation recommendation
Tell me exactly where I should increase, decrease, pause, or monitor spend. Rank by expected impact.

7. Risks and caveats
Flag attribution uncertainty, low sample size, tracking gaps, or promo distortions.

Recommended visuals:
- spend vs revenue trend
- platform comparison table
- campaign efficiency table
- top and bottom campaign bar charts

Avoid platform jargon without commercial interpretation.
```

---

# Runbook 6: Which products are driving the business?

**Internal name:** `product-and-merchandising-performance`

**Purpose:**
Product and merchandising review focused on revenue concentration, winners, laggards, and underused product opportunities.

**Recommended UI description:**
See which products are carrying the business, which are dragging, and where the biggest merchandising opportunities sit.

**Recommended visuals:**
- Pareto chart
- Product scorecard table
- Winners and laggards bar chart

**Prompt:**

```text
Review product performance for the selected period versus the prior equivalent period.

Think like a trading and merchandising lead. Focus on what products are driving revenue, units, profit, conversion, and risk.

Analyse:
- revenue by product
- units by product
- AOV if relevant
- product conversion if available
- product views/sessions if available
- gross profit/contribution if available
- stock availability and stock cover if available
- refunds/returns if available

Output in this structure:

1. Product trading summary
Summarise the 5 to 7 most important things happening at product level.

2. Product scorecard
Return a table of the key products with:
- revenue
- units
- change vs prior period
- share of total revenue
- conversion rate if available
- margin/profit if available
- stock status if available

3. Pareto concentration
Show how much of total revenue and profit comes from the top products. Call out over-reliance risk if the business is concentrated.

4. Winners
Identify products with strong growth and explain whether this was driven by traffic, conversion, price/AOV, merchandising, or marketing support.

5. Laggards
Identify products that materially underperformed and explain likely causes.

6. Opportunity products
Find products that look under-exploited, such as:
- high traffic, low conversion
- strong conversion, low traffic
- high margin, low visibility
- low stock but high demand

7. Recommended actions
Give concrete actions on:
- products to feature more
- products to support with ads
- products to bundle/upsell
- products to discount or de-prioritise
- products needing merchandising or PDP improvement

Recommended visuals:
- top product revenue chart
- units sold chart
- product contribution table
- concentration / Pareto chart

Prioritise impact over completeness.
```

---

# Runbook 7: Where am I about to lose sales from stock?

**Internal name:** `inventory-risk-and-missed-revenue`

**Purpose:**
Inventory risk review focused on stockouts, low cover, missed revenue, and cash tied up in slow stock.

**Recommended UI description:**
Find the products at risk of stockouts, estimate the revenue at risk, and highlight what needs action now.

**Recommended visuals:**
- Inventory risk table
- Stock cover chart
- Revenue-at-risk chart by product

**Prompt:**

```text
Assess inventory risk for the current period using available stock, sell-through, recent demand, and product contribution data.

Your objective is to identify where the business is at risk of losing revenue or margin due to stock issues.

Analyse:
- current stock levels
- days/weeks of cover if derivable
- recent sales velocity
- top product demand
- out-of-stock items
- low-stock items
- products with rising demand and insufficient cover
- revenue at risk or missed revenue estimate where reasonable

Output in this structure:

1. Inventory risk summary
Give the most important stock risks in order of likely commercial impact.

2. Critical products
Return a table for high-priority SKUs/products with:
- current stock
- recent units sold
- estimated stock cover
- recent revenue contribution
- risk level
- recommended action

3. Out-of-stock impact
Identify products currently out of stock or effectively unavailable and estimate the likely revenue impact where possible.

4. Low-stock watchlist
Identify products likely to go out of stock soon if current velocity continues.

5. Slow stock
If visible, identify products with weak sell-through that may be tying up cash.

6. Recommended actions
Recommend specific actions such as:
- reorder now
- expedite supplier
- reduce paid spend to protected SKUs
- shift traffic to in-stock alternatives
- bundle substitute products
- feature alternative best-margin items

Recommended visuals:
- inventory risk table
- stock cover chart
- at-risk revenue chart by product

Be practical and commercially grounded. Do not overstate precision if stock projections are rough.
```

---

# Runbook 8: Is email actually pulling its weight?

**Internal name:** `email-and-retention-performance`

**Purpose:**
Email and retention review focused on business contribution, campaign performance, flows, and repeat behaviour.

**Recommended UI description:**
Measure whether email and retention are genuinely helping the business and where lifecycle improvements should be made.

**Recommended visuals:**
- Email revenue trend
- Campaign performance table
- Flow performance table
- New vs returning customer mix chart

**Prompt:**

```text
Review email and retention performance for the selected period versus the previous equivalent period.

Focus on commercial impact, not just channel metrics.

Analyse:
- email-attributed revenue
- sends
- open rate
- click rate
- click-to-open rate if available
- unsubscribe rate
- campaign performance
- flow performance if available
- new vs returning customer revenue if available
- repeat purchase contribution if available

Output in this structure:

1. Email and retention verdict
Explain whether lifecycle marketing strengthened or weakened overall trading and by how much.

2. KPI table
Show key email/lifecycle metrics versus previous period.

3. Revenue contribution
State what share of business email contributed and whether that changed materially.

4. Campaign analysis
Identify the strongest and weakest campaigns by revenue efficiency and engagement.

5. Flow analysis
If flows exist, identify whether core automations such as welcome, browse abandonment, cart abandonment, and post-purchase are performing well or underperforming.

6. Retention signals
Comment on new vs returning mix and whether repeat behaviour appears to be improving or weakening.

7. Recommended actions
Give the top 5 lifecycle actions, prioritised by expected revenue impact and implementation effort.

Recommended visuals:
- email revenue trend
- campaign table
- flow table
- new vs returning customer mix chart

Avoid generic CRM advice. Tie everything to commercial impact.
```

---

## Suggested UI ordering

If these are shown in a runbooks tab, this order is likely strongest:

1. What happened yesterday?
2. What needs attention?
3. How did the last 7 days go?
4. Give me last month's trading review
5. Why are ads up or down?
6. Which products are driving the business?
7. Where am I about to lose sales from stock?
8. Is email actually pulling its weight?

---

## Implementation note

The strongest runbooks will not just pass a prompt to the model. They should also:

- include a fixed tool bundle per runbook
- pass a clear scope and comparison window
- prefetch the relevant tables or summaries where possible
- render the charts and tables that the prompt asks for
- enforce a consistent output structure in the UI

The difference between a gimmick and a genuinely useful runbook is usually not the model alone. It is the combination of:

- good prompt design
- correct data scope
- smart comparison windows
- structured output
- useful chart and table rendering

