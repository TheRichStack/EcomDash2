# Project Structure

## Purpose

This starter keeps routing, composition, configuration, and documentation in predictable locations so new Rich Stack projects can grow without early sprawl.

It is designed to be:

- clean
- reusable
- easy to inspect
- easy for an agent to work in
- easy for a human to extend

## Top-level overview

```txt
.
|-- app/         # App Router pages, layouts, route groups, API routes
|-- components/  # UI building blocks and starter assemblies
|-- config/      # Site, nav, and preview metadata
|-- docs/        # Project guidance and development rules
|-- hooks/       # Reusable React hooks
|-- lib/         # Utilities, helpers, formatting, env parsing
|-- public/      # Static assets
|-- types/       # Shared TypeScript types
|-- README.md    # Project setup and usage guide
```

## Folders

### `app`

Holds all App Router routes, layouts, route groups, and API handlers.

- `(marketing)` contains the public placeholder page for `/`.
- `(app)` contains the starter dashboard shell.
- `(system)` contains internal starter utilities such as `/preview/components`.
- `api` contains lightweight route handlers such as `/api/health`.

Do not place reusable UI helpers directly in `app` unless they are route-specific and not worth promoting.

### `components/ui`

Reserved for shadcn-generated primitives only.

Do not place app-specific wrappers, business components, or layout assemblies here.

### `components/shared`

Use for small reusable starter assemblies built from shadcn primitives.

Examples:

- `empty-state`
- `section-header`
- `stat-card`

Choose this folder when the component is generic, presentational, and reusable across multiple pages.

### `components/layout`

Use for app shell pieces and route-level wrappers.

Examples:

- sidebar
- app header
- page container
- shell composition

Choose this folder when the component controls page structure more than page content.

### `components/theme`

Use for theme provider and theme-specific helpers such as the theme toggle.

### `config`

Static project metadata and route-level configuration.

Examples:

- site metadata
- nav definitions
- preview section metadata

### `hooks`

Small reusable React hooks only.

### `lib`

Generic utilities, constants, environment parsing, and formatting helpers.

Do not turn `lib` into a dumping ground for feature-specific code.

### `types`

Shared TypeScript types used across config and components.

### `public`

Static assets used by the starter.

### `docs`

Project rules and contributor-facing documentation.

## Choosing between `ui`, `shared`, and `layout`

- Put it in `ui` if it comes from shadcn CLI output.
- Put it in `shared` if it is a small reusable assembly composed from primitives.
- Put it in `layout` if it defines shells, wrappers, headers, sidebars, or structural composition.

If the answer is unclear, keep the markup inline in the page until reuse becomes obvious.
