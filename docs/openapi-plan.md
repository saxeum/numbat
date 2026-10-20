# numbat — Spec-First OpenAPI Plan

- **Status:** Implemented (Phases 1–3; Phase 4 partial)
- **Date:** 2026-10-20
- **Ticket:** Jira **KAN-16** (relates to KAN-15 todo UI, KAN-12 todos)
- **Scope:** Replace the current **code-first** `@hono/zod-openapi` setup with a
  **spec-first** pipeline: a hand-authored OpenAPI YAML is the source of truth,
  codegen produces schemas/types/clients, then routes/handlers are written against
  the generated artifacts, with Swagger UI for docs.
- **Companions:** [`architecture.md`](architecture.md) (§7 contracts, §7.2),
  [`frontend.md`](frontend.md), [`persistence-plan.md`](persistence-plan.md).

---

## 0. Progress & deviations

| Phase | Status |
|-------|--------|
| 1 Spec + tooling + scripts | ✅ |
| 2 Plain Hono routes via generated Zod (`@hono/zod-openapi` removed) | ✅ |
| 3 `/api/openapi.json` + Swagger UI at `/api/docs` | ✅ |
| 4 SPA on generated artifacts | ⏸ deferred (uses generated Zod/types; generated client not worth it yet) |
| 5 Mocks / contract tests | ⏸ deferred |

> **Phases 4–5 deferred (2026-10-20):** with only ~5 endpoints, hand-written
> fetch wrappers are readable and the drift risk is low; a generated client is
> LOC-neutral (and `orval` hooks would cost the optimistic-update control).
> Revisit when the API grows to ~15–20 endpoints. See KAN-18 (closed as deferred).
>
> **Deviation — generator:** the recommended `@hey-api/openapi-ts` **crashes under
> TypeScript 7** (it depends on the `ts.SyntaxKind` compiler API). We instead use
> **`openapi-zod-client`** with a vendored template (`openapi/zod-schemas.hbs`),
> which emits Zod schemas + inferred types and is TS7-safe. A generated
> fetch/query client (e.g. `openapi-fetch`/`orval`) remains a Phase-4 follow-up.
> Codegen runs via `npm run api:gen`; CI checks `api:lint` + drift (`api:check`).

---

## 1. Goal & rationale

**Goal:** one language-neutral `openapi.yaml` that drives validation, types,
client generation, docs, and mocks.

**Why spec-first over code-first:**
- The contract lives in a reviewable, portable artifact (not buried in TS).
- Real docs (Swagger/Redoc) with zero drift.
- Generated **runtime validators** (server) and **typed client/hooks** (SPA) from
  the same source.
- Enables mocks + contract tests and keeps parity with external consumers.

**Trigger:** the code-first `createRoute` + `todos.openapi(...)` pattern in
`apps/worker/src/api/routes/todos.ts` is verbose and couples the contract to the
implementation. (See KAN-16 description.)

## 2. Current state (to be replaced)

- `@hono/zod-openapi` `createRoute` descriptors + `.openapi()` handlers.
- Hand-written Zod schemas in `@numbat/shared`.
- `/api/openapi.json` generated from the code (not authored).
- No Swagger UI.

## 3. Research: how this is done for Node/Hono

### 3.1 Code-first (rejected)
| Tool | What it does | Why not |
|------|--------------|---------|
| `@hono/zod-openapi` | Zod → OpenAPI spec (current) | Contract lives in TS; the pattern we're replacing |
| `hono-openapi` (1.5.0) | Generates spec from Standard-Schema validators (Elysia-style) | Same code-first coupling |

### 3.2 Spec-first generators (candidates)
| Tool | Outputs | Notes |
|------|---------|-------|
| **`@hey-api/openapi-ts`** (0.99.0) | TypeScript types, **Zod/Valibot/Ajv** validators, fetch/axios clients, **TanStack Query** hooks, **MSW** mocks | One tool covers server validators **and** SPA hooks + mocks. Plugins are modular |
| `orval` (8.43.0) | TS clients, **React Query** hooks, Zod, MSW mocks | Mature; strong React Query story. Main alternative |
| `openapi-typescript` (7.13.0) | TypeScript types only (runtime-free) | Great with `openapi-fetch`, but no validators/hooks |
| `openapi-zod-client` (1.18.3) | Zod schemas + a client | Zod-centric, smaller ecosystem |
| `@openapitools/openapi-generator-cli` (2.41.0) | Full server/client stubs (many langs) | **No Hono template**; Java runtime; overkill here |

### 3.3 Lint / bundle
- **`@redocly/cli`** (2.65.0) — lint, bundle to JSON, preview docs.
- `@stoplight/spectral-cli` (6.17.0) — ruleset-based linting (optional).

### 3.4 Docs / Swagger UI
- **`@hono/swagger-ui`** (0.6.1) — Hono middleware, serve Swagger UI at `/api/docs`.
- `@scalar/hono-api-reference` (0.12.13) — modern alternative to Swagger UI.

### 3.5 Validation on the server
- Plain Hono + **`@hono/zod-validator`** using the codegen'd Zod schemas — simple,
  idiomatic, no code-first coupling.

### 3.6 Mocks / contract tests
- **MSW** (via hey-api/orval plugins) for SPA dev/tests; `@stoplight/prism-cli`
  for a spec-driven mock server.

**Conclusion:** there is **no OpenAPI→Hono server-stub generator**. "Codegen the
stubs for schema" realistically means: generate **types + Zod validators (+
clients/hooks/mocks)**, and hand-write the thin Hono routes/handlers against them.

## 4. Recommended stack

```
openapi/openapi.yaml              # source of truth (OpenAPI 3.1)
openapi/redocly.yaml              # lint/bundle config
        │  redocly lint + bundle
        ▼  hey-api codegen
packages/api/                     # generated (committed): types, zod, client, tanstack, msw
        │
        ├── apps/worker  → generated Zod validators + @hono/zod-validator
        └── apps/web     → generated fetch client + TanStack Query hooks
```

- **Author:** `openapi/openapi.yaml`.
- **Lint/bundle:** `@redocly/cli` (`npm run api:lint`, `api:bundle`).
- **Generate:** `@hey-api/openapi-ts` plugins → `packages/api` (committed, with a
  drift check in CI).
- **Server:** plain Hono; validate with generated Zod via `@hono/zod-validator`;
  handlers typed from generated types.
- **Docs:** serve bundled spec at `/api/openapi.json`; Swagger UI at `/api/docs`
  via `@hono/swagger-ui`.
- **SPA:** consume generated client/hooks (aligns with KAN-15).

## 5. Proposed repo layout

```
openapi/
├── openapi.yaml            # source of truth
└── redocly.yaml
packages/
├── api/                    # GENERATED — do not edit
│   ├── types.gen.ts
│   ├── zod.gen.ts
│   ├── client.gen.ts
│   ├── tanstack.gen.ts
│   └── msw.gen.ts
└── shared/                 # non-API shared bits (or retire once api/ lands)
apps/worker/
├── openapi.json            # bundled spec consumed by the Worker at runtime
└── src/api/routes/*.ts     # plain Hono + generated validators
```

## 6. Workflow (developer loop)

1. Edit `openapi/openapi.yaml`.
2. `npm run api:lint` (Redocly).
3. `npm run api:gen` (Redocly bundle + hey-api codegen) — regenerates
   `packages/api` and `apps/worker/openapi.json`.
4. Implement/adjust Hono handlers using generated validators/types.
5. PR — CI runs lint + codegen **drift check** (`api:gen` then
   `git diff --exit-code`), typecheck, tests.

## 7. Migration phases

| Phase | Contents | Effort |
|-------|----------|--------|
| **1** | Spec + tooling: `openapi.yaml` (health + todos), redocly config, hey-api config, `api:lint`/`api:gen` scripts, CI drift check | ~0.5 day |
| **2** | Re-implement `health` + `todos` as plain Hono routes using generated Zod validators; delete `@hono/zod-openapi` | ~0.5 day |
| **3** | Serve `/api/openapi.json` (bundled) + Swagger UI at `/api/docs` | ~0.5 day |
| **4** | SPA switches to generated client/TanStack hooks (pairs with KAN-15) | ~0.5 day |
| **5** | (Optional) MSW mocks + contract tests | ~0.5 day |

Ship through `verify` + PR preview (`workflow-plan.md` W3); no behavior change to
the public API.

## 8. CI

- `api:lint` — fail on invalid spec.
- `api:gen` + `git diff --exit-code` — fail on generated-code drift.
- Keep existing typecheck/tests/E2E.

## 9. Decisions & open questions

1. **Generator:** `@hey-api/openapi-ts` (recommended; validators + hooks + mocks
   in one) vs **orval** (React Query focus)?
2. **Generated package:** single `@numbat/api` vs separate `api-contracts` /
   `api-client`?
3. **`@numbat/shared`:** retire it in favor of generated validators, or keep for
   non-API types?
4. **Spec version:** OpenAPI **3.1** (recommended) vs 3.0 (widest tooling)?
5. **Docs exposure:** public `/api/docs`, or gate behind auth later (KAN-13)?
6. **Swagger UI vs Scalar** for the rendered docs.

## 10. Approval matrix

| Item | Owner |
|------|-------|
| Spec, tooling, codegen, handler rewrite, docs endpoint | agent (PR review) |
| Generator choice, package layout, 3.1 vs 3.0, docs exposure | eng decision |

## 11. References

- hey-api plugins (TypeScript, Zod, fetch, TanStack Query, MSW): https://heyapi.dev/openapi-ts/plugins
- OpenAPI TypeScript (types): https://openapi-ts.dev
- orval: https://orval.dev
- Redocly CLI: https://redocly.com/docs/cli
- Hono Swagger UI example: https://hono.dev/examples/swagger-ui
- Scalar for Hono: https://github.com/scalar/scalar
- OpenAPI 3.1 spec: https://spec.openapis.org/oas/v3.1.0
