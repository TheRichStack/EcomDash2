# Starter Rules

## Philosophy

This repository is a reusable Rich Stack core starter.

Keep it lean, readable, and easy to inspect before adding product-specific complexity.

## Stack

- Next.js App Router
- TypeScript
- shadcn/ui
- Tailwind CSS
- CSS-variable theming

## Coding style

- Use TypeScript everywhere practical.
- Prefer small, direct components over clever abstractions.
- Use kebab-case for file names.
- Keep imports aligned to the existing `@/` alias.

## File placement

- Route files live in `app`.
- shadcn-generated primitives live in `components/ui` only.
- App shell and layout wrappers live in `components/layout`.
- Small reusable starter assemblies live in `components/shared`.
- Theme helpers live in `components/theme`.
- Static configuration lives in `config`.
- Generic helpers live in `lib`.
- Shared types live in `types`.
- Project-facing documentation lives in `docs`.

## Naming

- Name files after what they render or export.
- Avoid vague buckets such as `helpers.ts`, `misc.ts`, or `stuff.ts`.
- Promote page-specific UI into shared files only when reuse is clear.

## Component boundaries

- Prefer shadcn primitives first.
- Prefer composition over premature abstraction.
- Do not copy primitives into new files under different names.
- Keep `components/ui` reserved for CLI-generated files.
- Build starter-level assemblies in `components/shared`.
- Keep shell-only pieces in `components/layout`.
- Keep page-specific markup inline until reuse is real.

## Lint expectations

- `npm run lint` must pass.
- Do not disable meaningful lint rules to force a pass.
- Do not use ignore-during-build hacks.

## Design

- Use semantic theme tokens.
- Keep the UI neutral and structured.
- Avoid arbitrary styling drift.

## Preview

- `/preview/components` is the visual source of truth for installed starter components.
- When adding a meaningful new component, preview it there.

## Starter discipline

Do not add auth, database clients, analytics, CMS integrations, state libraries, or feature-specific SDKs to the base starter unless the repository is intentionally evolving beyond the core seed.
