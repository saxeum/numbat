# numbat — Frontend

- **Status:** Accepted
- **Date:** 2026-10-19
- **Scope:** The React SPA that runs in `apps/web` and is served as static assets by
  the **web Worker** at `foonix.net/*` (see [`architecture.md`](architecture.md)).

This document records the frontend stack decision, the rationale, and the
conventions the code will follow. It is descriptive — code is written only when
explicitly requested (see `agents.md`).

---

## 1. Decision summary

| Axis | Choice | Alternatives considered |
|------|--------|-------------------------|
| Build tool | **Vite** | — (Vite is the baseline for the SPA) |
| Language | **TypeScript** (strict) | — |
| UI framework | **React** | — |
| Routing | **React Router** (library mode) | TanStack Router; Wouter |
| Server state | **TanStack Query** | SWR; RTK Query; plain `fetch` |
| Client state | **React built-ins** (add Zustand only if a real need appears) | Zustand; Jotai; Redux Toolkit |
| Styling | **Tailwind CSS** | CSS Modules; Vanilla Extract; Panda CSS |
| Components | **shadcn/ui** (Radix primitives, owned in-repo) | Mantine; MUI; Ant Design; DaisyUI; HeroUI |
| Forms | **React Hook Form** + Zod | TanStack Form; Conform |
| Validation | **Zod** (generated from `openapi/openapi.yaml` → `@numbat/api`) | Valibot; ArkType |
| Tables | **TanStack Table** (shadcn data-table pattern) | AG Grid; hand-rolled |
| API client | **Hono RPC** typed client (monorepo) + `fetch` | openapi-fetch from the OpenAPI doc |
| Icons | **Lucide** (shadcn default) | Heroicons; Phosphor |
| Charts | **Recharts** (shadcn charts) | Tremor; visx |
| Toasts | **Sonner** (shadcn default) | react-hot-toast |
| Animation | **Motion** (optional) | — |
| Component tests | **Vitest + React Testing Library** | — |
| E2E tests | **Playwright** | Cypress |

> **Versions at scaffold time (2026-10):** Vite 9, React 19, TypeScript 7,
> React Router 8 (library mode), Tailwind v4, and shadcn v4 (Nova preset, unified
> `radix-ui`). Forms use React Hook Form 7 with `@hookform/resolvers@5.9`
> (`6.x` has an `effect` peer conflict — see `scaffold-runbook.md` §12). Note that
> TypeScript 7 removed `baseUrl`: the `@/*` alias is declared with `paths` only and
> mirrored in `vite.config.ts`.

---

## 2. Why shadcn/ui

- **You own the code.** Components are copied into the repo, not imported from a
  versioned dependency, so there is no breaking-change treadmill and no fighting a
  library's opinions.
- **Radix under the hood.** Accessibility (focus management, ARIA, keyboard) comes
  from battle-tested primitives; styling is entirely ours.
- **Tailwind-native.** Pairs directly with the utility-first styling choice and the
  team's design tokens.
- **Themeable with CSS variables.** Light/dark and brand themes are driven by CSS
  custom properties; `tweakcn` gives a live visual editor.
- **Ecosystem.** `blocks` (dashboards, auth screens, sidebars) and a large body of
  examples accelerate common app surfaces.
- **Escape hatch.** Because it's plain React + Tailwind, anything can be customized
  without bending a library API.

### Alternatives considered

| Library | Why not chosen |
|---------|----------------|
| Mantine | Excellent and fast, but you don't own the components; styling is opinionated and less Tailwind-native. |
| MUI (Material) | Heavy, Material look is hard to fully escape; better suited to dense enterprise apps. |
| Ant Design | Strong for data-heavy enterprise UIs, but large and visually opinionated. |
| DaisyUI | Very quick theming on top of Tailwind, but fewer accessible primitives than Radix and less copy-in control. |
| HeroUI / Chakra / Park UI | Viable; shadcn won on ownership, Radix accessibility, and ecosystem size. |

---

## 3. Component ownership model

- **`components/ui/`** — shadcn-generated components. Treated as ours, but kept
  close to upstream so they remain diffable against the registry.
- **`components/`** — hand-built, app-specific components composed from `ui/`.
- **Composition over configuration:** prefer composing small primitives to adding
  props to a `ui/` component. Changes to `ui/` are deliberate and reviewed.
- The shadcn CLI/registry is the source of truth for adding new components.

---

## 4. Theming

- Tailwind design tokens exposed as **CSS custom properties** (colors, radius,
  spacing), so themes swap without JS.
- **Dark mode** supported via a class/attribute strategy; default theme decided at
  scaffold time.
- **`tweakcn`** (https://tweakcn.com) used to design and preview themes; the
  resulting tokens are committed as CSS variables.
- No runtime CSS-in-JS, keeping the bundle small and Cloudflare-friendly.

---

## 5. Placement in the monorepo

```
apps/web/
├── src/
│   ├── app/                 # root providers (Query, Router, Theme, Toaster)
│   ├── routes/              # route components + route definitions
│   ├── features/            # feature folders (feature-local components/hooks)
│   ├── components/
│   │   ├── ui/              # shadcn-generated primitives (owned)
│   │   └── ...              # shared app components
│   ├── lib/                 # api client, query client, utils (cn, formatters)
│   └── styles/              # tailwind entry + theme tokens
├── public/
└── index.html
```

- **`packages/api`** holds the **generated** Zod schemas + TypeScript types
  (from `openapi/openapi.yaml`) used by both the API (`apps/worker`) and the web
  app, so validation and types never drift. Regenerate with `npm run api:gen`.
- **`apps/web`** builds to a static bundle consumed by the **web Worker's** Static
  Assets binding; the SPA fallback is configured in that Worker's route
  (`architecture.md` §6).

---

## 6. Conventions

- **Data fetching** goes through TanStack Query hooks; components never call `fetch`
  directly. Query keys are centralized.
- **API access** is typed by the generated `@numbat/api` schemas; the SPA parses
  responses with them. A generated fetch/query client is a follow-up
  (`openapi-plan.md` Phase 4). The served OpenAPI document is the contract for
  docs and external consumers.
- **Forms** use React Hook Form with `zodResolver`, validating against schemas
  from `@numbat/api` — the same schemas the API validates with.
- **Errors** surface through a single boundary + toast pattern; API error envelopes
  (`architecture.md` §7.3) map to user-facing messages in one place.
- **Types:** `strict` TypeScript; no `any` in application code.
- **Feature structure:** UI, hooks, and API calls for a feature live together under
  `features/<name>` to keep changes local.
- **Accessibility:** Radix primitives plus `eslint-plugin-jsx-a11y`; interactive
  elements must be keyboard reachable.

---

## 7. Testing

| Layer | Tool | Covers |
|-------|------|--------|
| Component/unit | Vitest + React Testing Library | Components, hooks, reducers, formatters |
| API integration | Vitest + Workers pool (in `apps/worker`) | Routes and bindings in `workerd` |
| End to end | Playwright | Full SPA + API flows |

Optional: **Storybook** for isolated component development and visual review, added
later if the component surface grows.

---

## 8. Deferred / later

- **Branding & final theme** — tokens and logo TBD.
- **Storybook** — optional, revisit once components multiply.
- **i18n** — not required initially.
- **PWA / offline** — out of scope for the first milestone.
- **Motion/animation library** — add only when a concrete need appears.

---

## 9. Links

**Core stack**
- Vite — https://vite.dev
- React Router — https://reactrouter.com
- TanStack Query — https://tanstack.com/query/latest
- Tailwind CSS — https://tailwindcss.com
- shadcn/ui — https://ui.shadcn.com
- Radix UI — https://www.radix-ui.com
- React Hook Form — https://react-hook-form.com
- Zod — https://zod.dev
- TanStack Table — https://tanstack.com/table/latest
- Hono RPC client — https://hono.dev/docs/guides/rpc

**Supporting**
- Lucide icons — https://lucide.dev
- Recharts — https://recharts.org
- Sonner — https://sonner.emilkowal.ski
- Motion — https://motion.dev
- TanStack Router (alternative) — https://tanstack.com/router/latest

**Look & feel galleries**
- shadcn examples — https://ui.shadcn.com/examples
- shadcn blocks — https://ui.shadcn.com/blocks
- shadcn themes — https://ui.shadcn.com/themes
- tweakcn live theme editor — https://tweakcn.com
- Tailwind Play — https://play.tailwindcss.com

**Testing**
- Vitest — https://vitest.dev
- React Testing Library — https://testing-library.com/docs/react-testing-library/intro/
- Playwright — https://playwright.dev
