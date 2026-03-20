# EcomDash2 Agent Data Engine

## What this is

`lib/agent/` is the **data engine** that powers the MCP server. It fetches, assembles,
and shapes ecommerce data into structured tool results that the MCP server exposes to
external AI clients (Claude Desktop, Claude Code, etc.).

The in-dashboard chat UI and orchestration layer have been removed. All AI reasoning
and response synthesis now happens inside the user's own AI client via the MCP protocol.

## What lives here

| File | Purpose |
|------|---------|
| `lib/agent/tools.ts` | Entry point. Exports `runAgentTools()`, called by `lib/mcp/tools.ts` |
| `lib/agent/anomalies.ts` | Builds the anomaly scan dataset |
| `lib/agent/types.ts` | Shared types: `AgentToolName`, `AgentToolResult`, `DashboardRequestContext` |
| `lib/agent/constants.ts` | `AGENT_MAX_TOOL_COUNT` and other runtime constants |

## What was removed

The following were deleted when the in-dashboard chat was replaced by MCP:

- `lib/agent/orchestrator.ts` — chat orchestration
- `lib/agent/orchestration/` — scope resolution, prompt building, turn management
- `lib/agent/broker.ts`, `executor.ts` — guarded worker execution
- `lib/agent/storage.ts` — conversation/message persistence
- `lib/agent/settings.ts` — workspace AI settings and encrypted key storage
- `lib/agent/providers/` — Anthropic and OpenAI SDK wrappers
- `lib/agent/presets.ts`, `charts.ts`, `pricing.ts`, `utils.ts`, `context.ts`
- `app/api/agent/` — all chat API routes
- `components/agent/` — chat sheet, inline charts, settings card

## The MCP server

The MCP server lives at `lib/mcp/` and is the only consumer of this data engine:

| File | Purpose |
|------|---------|
| `lib/mcp/server.ts` | Creates and configures the `McpServer` instance |
| `lib/mcp/tools.ts` | 14 tool definitions wrapping `runAgentTools()` |
| `lib/mcp/prompts.ts` | 8 runbook prompts as native MCP Prompts |
| `lib/mcp/auth.ts` | Bearer token validation |
| `lib/mcp/context.ts` | Builds `DashboardRequestContext` for MCP calls |
| `app/api/mcp/route.ts` | HTTP endpoint — POST and GET, stateless, Vercel-hosted |

## When to touch lib/agent/

Only if you are changing the data a tool returns. The tool definitions (names,
descriptions, schemas) live in `lib/mcp/tools.ts`. The data builders live in
`lib/agent/tools.ts` and its dependencies.

Do not add orchestration, storage, or provider code back to `lib/agent/`. That
responsibility now belongs to the user's AI client.
