# UI Building

## Purpose

This repo is a reusable Rich Stack starter built on Next.js and shadcn.

The goal is to build fast, consistent UIs without drifting into random bespoke component work too early.

## Core rule

Start with shadcn primitives.

If the interface can be built by composing existing shadcn components cleanly, do that instead of inventing a custom abstraction.

## Folder boundaries

### `components/ui`

- Reserved for shadcn-generated files only.
- Install new primitives through the shadcn CLI or MCP workflow.
- Do not manually edit shadcn internals unless there is a strong reason.
- Do not hand-roll equivalents of existing shadcn components here.

### `components/shared`

- Use for tiny reusable starter assemblies.
- Good fits: empty states, stat cards, section headers, filter bars.
- Keep them generic and presentation-focused.

### `components/layout`

- Use for app shells, sidebars, headers, containers, and route-level wrappers.
- Keep business logic out of this folder.

## Styling rules

- Prefer consistent spacing, typography, and tokens.
- Use semantic tokens from `app/globals.css`.
- Avoid inline one-off colours unless there is a real need.
- Keep cards, filters, tables, dialogs, and tabs based on shadcn composition.

## Component decisions

- Do not invent custom components if shadcn composition already solves the problem.
- Prefer composing `Card`, `Tabs`, `Table`, `Dialog`, `Sheet`, `Select`, and `Button` before introducing new wrappers.
- Keep page-specific markup inline until a real reusable pattern emerges.

## Before creating a custom component

Ask:

1. Can this be solved by composing existing shadcn primitives?
2. Is this reused in at least 2 to 3 places?
3. Is this a true reusable pattern, or just one page section?
4. Does it belong in `shared`, or should it stay inline in the page for now?

If the answer is unclear, keep it inline first.

## Workflow

1. Add new primitives through the shadcn CLI instead of hand-rolling them.
2. Preview meaningful additions on `/preview/components`.
3. Preview EcomDash2 dashboard compositions on `/preview/dashboard-patterns` when working on product UI.
4. Check the result in light and dark mode.
5. Run `npm run lint` before finishing.

## Guardrails

- `components/ui` is reserved for shadcn-generated files.
- Use CSS-variable theme tokens only.
- Do not bypass lint errors with build ignores.
- `/preview/components` is the visual source of truth for bundled starter components.
- `/preview/dashboard-patterns` is the visual source of truth for EcomDash2 dashboard compositions.
- Keep the starter calm, neutral, and reusable rather than turning it into a one-off app.

## Dashboard defaults

Default to these building blocks:

- cards for KPI and summary surfaces
- tabs for mode switching
- tables for dense operational data
- dialogs or sheets for secondary actions
- dropdown menus for compact action lists
- forms built from installed shadcn input primitives
- separators and muted text for hierarchy
