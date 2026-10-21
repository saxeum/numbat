# numbat — Architecture

- **Status:** Accepted (proposed baseline)
- **Date:** 2026-10-19
- **Repo:** `saxeum/numbat`
- **Scope:** TypeScript application — React SPA frontend, REST API backend — deployed to Cloudflare Workers.

This document records the target architecture and the decisions behind it. It is
descriptive, not an implementation guide; code is written only when explicitly
requested (see `agents.md`).

---

## 1. Decision summary

| # | Decision | Choice | Alternatives considered |
|---|----------|--------|-------------------------|
| D1 | Hosting model | **Two Workers, one origin** — web Worker (static assets) + API Worker (Hono), path-routed on a custom domain | Single Worker (assets + API); Pages + Functions; service-binding proxy |
| D2 | Frontend | **Vite + React SPA** — React Router, TanStack Query, Tailwind + **shadcn/ui** (see [`frontend.md`](frontend.md)) | Mantine; MUI; Ant Design; DaisyUI; framework modes (React Router v7, TanStack Start, Next via OpenNext) |
| D3 | API framework | **Hono** with Zod + OpenAPI | itty-router + chanfana; plain `fetch`; tRPC/oRPC |
| D4 | Persistence | **Deferred to a later stage** — intended D1 + Drizzle when needed (see §16) | KV-only; Hyperdrive + Postgres; Durable Objects |
| D5 | Unit/integration tests | **Vitest + `@cloudflare/vitest-pool-workers`** | Miniflare directly; mocked bindings |
| D6 | Browser E2E tests | **Playwright** | Cypress |
| D7 | CI/CD | **GitHub Actions + `cloudflare/wrangler-action`** (with Workers Builds as an option) | Workers Builds only; manual `wrangler deploy` |
| D8 | Auth | **Better Auth (self-hosted), Google OAuth first** (see §10, [`auth-plan.md`](auth-plan.md)) | Cloudflare Access; Auth.js; managed IdP |
| D9 | Repo structure | **Monorepo (workspaces)** — API and web apps plus a shared contracts package | Single package |
| D10 | Custom domain | **`foonix.net`** (apex; Cloudflare zone already in-account). Web + API share the origin via path routes | Subdomain split; `*.workers.dev` |
| D11 | Preview deployments | **Per-PR Version URLs** (see `workflow-plan.md` W3) | Named preview env; Workers Builds/Previews |

---

## 2. System overview

Two Workers share one public origin under the custom domain `foonix.net`:

```
                         Cloudflare zone: foonix.net
                    ┌────────────────────────────────────────────────
   Browser ───────▶ │  foonix.net/api/*  ──▶  API Worker (Hono)        │
                    │                            │                    │
                    │                            ▼                    │
                    │                     bindings (D1, KV, R2, ...)   │
                    │                                                 │
                    │  foonix.net/*      ──▶  Web Worker              │
                    │                            │                    │
                    │                            ▼                    │
                    │                     React SPA static assets     │
                    │                     (+ SPA fallback)            │
                    └────────────────────────────────────────────────
```

**Why this shape:** the zone's route table sends `/api/*` to the API Worker and
everything else to the web Worker. Because both live on the same hostname, the
browser sees a single origin — no CORS, and first-party cookies for auth later
(§10). The two Workers deploy independently while sharing one public origin.
Cloudflare matches the more specific route (`/api/*`) before the catch-all (`/*`).

The origin is **public by design**: `foonix.net/api/*` is an intentionally public
REST surface. Access control, when introduced, is the API's own responsibility
(§10, §14) — the route is not a security boundary.

---

## 3. Components

### 3.1 Frontend — Vite + React SPA
- TypeScript throughout; client-side routing (React Router, library mode).
- Build output is a static bundle (HTML, JS, CSS, assets) served by the **web
  Worker** through its Static Assets binding.
- No SSR server. Deep links resolve client-side via the SPA fallback.
- Data fetching talks to the same-origin `/api` surface.

### 3.2 API — Hono + Zod/OpenAPI
- Hono router mounted at `/api`, running in the **API Worker** — a separate
deployable from the web Worker.
- **Spec-first contracts:** `openapi/openapi.yaml` is the source of truth; codegen
  (`openapi-zod-client`) produces Zod validators + TypeScript types in
  `@numbat/api`. Plain Hono routes validate with those schemas
  (`@hono/zod-validator`); the spec is served at `/api/openapi.json` with Swagger
  UI at `/api/docs` (see [`openapi-plan.md`](openapi-plan.md)).
- Middleware: request ID, structured logging, error handling, (later) auth and
  rate limiting.
- REST conventions are defined in §7.

### 3.3 Persistence — D1 + Drizzle
- D1 (serverless SQLite) is the default relational store.
- Drizzle provides typed schema, queries, and generated migrations.
- Additional bindings can be added as needs arise: KV (cache/config), R2 (objects),
  Queues (async work), Durable Objects (stateful coordination), Analytics Engine
  (metrics).
- Not every environment needs a database; D1 is introduced only when persistence is
  required. The architecture allows it to be added without restructuring.

### 3.4 Routing — zone routes on `foonix.net`

| Route pattern | Worker | Serves |
|---|---|---|
| `foonix.net/api/*` | API Worker | Hono REST API |
| `foonix.net/*` | Web Worker | React SPA static assets + SPA fallback |

- Both Workers and the `foonix.net` zone are in the same Cloudflare account
  (`<cloudflare-account-id>`), so routes and the custom domain are managed
  with the existing `wrangler` credentials.
- A Workers **custom domain** at `foonix.net` provides the DNS record and
  certificate; the API Worker is attached with a **path route** (`/api/*` is more
  specific than the catch-all, so it wins).
- The apex was reclaimed from a retired Worker (`ungozenji`); it now has no routes
  or DNS records other than what this project creates.
- Verify custom-domain + path-route coexistence when wiring up; the fallback if the
  platform disallows it is a single Worker or a service-binding proxy (D1
  alternatives).

---

## 4. Request lifecycle

1. A request reaches Cloudflare's edge for `foonix.net`.
2. The zone route table matches the path:
   - `/api/*` → **API Worker**: Hono runs request ID → logging → validation →
     handler → typed JSON response; errors are normalized into the error envelope
     (§7.3).
   - anything else → **Web Worker**: the Static Assets binding serves the matching
     built asset.
3. If no static asset matches and the request looks like a client route, the web
   Worker's SPA fallback returns `index.html` so the React router can resolve it.

Static assets are cached by Cloudflare's CDN; API responses set explicit cache
headers (default: no-store unless a handler opts into caching).

---

## 5. Proposed repository layout

```
numbat/                          # monorepo root (workspaces)
├── agents.md                    # agent rules + verified CLI access
├── docs/
│   └── architecture.md          # this document
├── package.json                 # workspace root
├── apps/
│   ├── web/                     # Web Worker: Vite + React SPA (static assets)
│   │   └── wrangler.jsonc       #   route: foonix.net/*
│   └── worker/                  # API Worker: Hono + Worker entry
│       ├── wrangler.jsonc       #   route: foonix.net/api/*
│       └── src/
│           ├── api/             # routes, middleware, schemas
│           └── db/              # Drizzle schema, queries, migrations (later)
├── packages/
│   └── api/                     # GENERATED from openapi.yaml (types + zod)
├── tests/
│   ├── unit/                    # Vitest (Workers pool)
│   └── e2e/                     # Playwright
├── .dev.vars                    # local secrets (gitignored)
└── .gitignore
```

> The monorepo uses workspaces (npm workspaces; pnpm optional). `packages/api`
> holds the codegen'd contracts (TypeScript types + Zod) shared by API and web;
> the OpenAPI spec (`openapi/openapi.yaml`) is the source of truth.

---

## 6. Configuration

Each app is its own Worker and has its own `wrangler.jsonc`:

**`apps/web/wrangler.jsonc`** (web Worker)
- **Static assets:** build-output directory, assets binding, and
  `not_found_handling` set to SPA mode so client routes fall through to
  `index.html`.
- **Route:** `foonix.net/*` (catch-all); the `foonix.net` custom domain is owned
  here, providing the DNS record and certificate.

**`apps/worker/wrangler.jsonc`** (API Worker)
- **Route:** `foonix.net/api/*` (more specific, so it wins for API calls).
- **Bindings:** D1, KV, R2, etc., declared per environment.

Shared across both:
- **Compatibility:** a pinned `compatibility_date`, kept in sync between the two
  configs, with flags opted in explicitly.
- **Environments:** named environments (e.g. `staging`, `production`) with separate
  routes, bindings, and secrets.
- **Account/zone:** both Workers and the `foonix.net` zone live in the same
  Cloudflare account.

Secrets never live in the config or repo:
- Local: per-app `.dev.vars` (already gitignored).
- Remote: `wrangler secret put` / CI secrets.

---

## 7. API design

### 7.1 Conventions
- Base path: `/api`; resource-oriented REST.
- JSON request/response bodies; UTC ISO-8601 timestamps.
- Versioning: introduce `/api/v1` when the first breaking change is needed; start
  unversioned to avoid premature ceremony.
- Pagination: cursor-based for lists; consistent envelope.
- Idempotency keys for unsafe retryable operations (when relevant).

### 7.2 Contracts
- Every route defines Zod schemas for input and output.
- An OpenAPI document is generated from the schemas and exposed by the app,
  enabling typed clients and living documentation.

### 7.3 Errors
A single error envelope for all failures, e.g. a stable machine-readable `code`,
a human `message`, optional `details`, and the request ID. HTTP status codes carry
the class of error; the body carries the specifics.

### 7.4 Middleware chain
Request ID → structured log → (auth) → rate limit → validation → handler →
error normalization.

---

## 8. Frontend architecture

- **Rendering:** client-side only (SPA). The web Worker serves static assets and
  never renders React.
- **Build:** Vite produces the static bundle consumed by the assets binding.
- **Routing:** React Router (library mode); unknown deep links fall back to
  `index.html`.
- **Server state:** TanStack Query. **Client state:** React built-ins (Zustand only
  if a real global-store need appears).
- **Styling & UI:** Tailwind CSS + **shadcn/ui** (Radix primitives, components
  owned in-repo).
- **Forms:** React Hook Form + Zod, validating with schemas generated from
  `openapi/openapi.yaml` (`@numbat/api`).
- **Tables:** TanStack Table (shadcn data-table pattern).
- **API types:** Hono RPC client for end-to-end types across the monorepo; the
  OpenAPI document remains the contract for docs/external clients.

Full detail: [`frontend.md`](frontend.md).

---

## 9. Local development

- **API Worker:** `wrangler dev` in `apps/worker` runs the Hono API in `workerd`
  with real bindings (local D1 is used once persistence is introduced — see §16).
- **Web:** Vite dev server in `apps/web` for fast HMR; `/api` is proxied to the API
  Worker during development, so the split origin is invisible locally.
- **Secrets:** per-app `.dev.vars` for local-only values.
- **Data:** local D1 state via Drizzle migrations, added with persistence (§16).

---

## 10. Authentication & authorization

**Decision (2026-10-20): [Better Auth](https://www.better-auth.com) self-hosted in
the API Worker, Google OAuth as the first provider.** See
[`auth-plan.md`](auth-plan.md).

- **Why:** same-origin (`foonix.net`) keeps session cookies first-party; Better
  Auth plugs into our **D1 + Drizzle** stack (`drizzleAdapter`) and mounts on
  **Hono** (`/api/auth/*`); no vendor/MAU cost; more providers later.
- **Enforcement** lives **inside the API Worker** (§2) — every owner-scoped query is
  owner-scoped; unauthenticated requests get the standard 401 envelope.
- **Constraint:** Google OAuth redirect URIs are exact (no wildcards), so the
  dynamic per-PR preview hosts can't use real OAuth; auth is exercised on local +
  production (and worker tests).

Alternatives considered: Cloudflare Access (no app-level identity); Auth.js
(Next-centric); managed IdP (Clerk/Auth0/WorkOS — cost/vendor).

---

## 11. Testing strategy

| Layer | Tooling | What it covers |
|-------|---------|----------------|
| Unit | Vitest | Pure functions, schema/validation, small helpers |
| Integration | Vitest + `@cloudflare/vitest-pool-workers` | Hono routes and D1 access running *inside* `workerd` with real bindings |
| End to end | Playwright | Full SPA + API flows against a deployed or locally served instance |

The Workers test pool is deliberately chosen so tests exercise the real runtime and
bindings rather than mocks.

---

## 12. CI/CD

- **On pull request:** install → typecheck → lint → unit/integration tests →
  build (no deploy).
- **Preview deployments: per-PR Version URLs.** CI uploads a version per PR
  (`wrangler versions upload --preview-alias pr-<n>`) and comments the URL
  (`workflow-plan.md` W3). Named preview environments or Workers Builds/Previews
  remain alternatives if previews need isolated storage — see §16.
- **On merge to `main`:** build → deploy **both Workers** (web and API) to
  production via `cloudflare/wrangler-action` (e.g. a matrix over the two apps),
  authenticated with a Cloudflare API token stored as a GitHub Actions secret.
- **Alternative:** **Workers Builds** connects the Git repo and builds/deploys on
  push without a custom workflow; can be adopted if it covers the required gates.
- **Environments:** separate Workers environments for staging and production,
  each with its own bindings and secrets.

Note: the Cloudflare API token used in CI should be scoped to Workers deploy
rights, distinct from the interactive OAuth session used for local `wrangler`.

---

## 13. Observability & operations

- **Workers Logs** and `wrangler tail` for live logs.
- **Structured logging** with request IDs, emitted from Hono middleware.
- **Analytics Engine** for custom metrics; Cloudflare dashboard for request/error
  metrics and Workers analytics.
- **Error tracking** (e.g. Sentry) can be added via middleware later.
- **Rollbacks:** `wrangler rollback` / versioned deployments.

---

## 14. Security

- Secrets only in `.dev.vars` (local) and Workers secrets (remote); never committed.
- Same-origin, path-routed design removes the CORS attack surface by default.
- The API is intentionally public; any sensitive endpoint must be protected by auth
  in the API Worker (§10) — the route itself is not a security boundary.
- Input validated at the edge with Zod before reaching handlers or the database.
- Security headers (CSP, HSTS, etc.) applied by middleware; Cloudflare WAF / rate
  limiting available at the edge.
- Least-privilege credentials: CI deploy token ≠ local OAuth session ≠ GitHub token.

---

## 15. Consequences & trade-offs

**Benefits**
- One public origin — no CORS.
- Web and API deploy independently.
- TypeScript everywhere with shared contracts via OpenAPI.
- Local dev and tests run in the real `workerd` runtime with real bindings.
- Cheap to start; services (D1, KV, R2, Queues, DO) added incrementally.

**Trade-offs / risks**
- Two Workers means two configs, two deploy targets, and two sets of secrets to keep
  in sync (mitigated by a shared `compatibility_date` and a CI matrix).
- The API is publicly addressable, so it must own its own access control (§14).
- The custom domain and the `/api/*` path route must coexist on one zone (verified
  at wire-up; fallback is a single Worker).
- Static assets are client-rendered, so first paint waits on JS (acceptable for an
  SPA; SSR would require a framework change — see D2 alternatives).
- Worker CPU limits apply to API work; long-running jobs should move to Queues or
  Durable Objects.

---

## 16. Deferred items & open questions

### Deferred to a later stage
Deliberately out of scope for the first milestone; each is revisited before it
becomes a blocker.

1. **Authentication / authorization** — ✅ **implemented** (Better Auth + Google
   OAuth, KAN-13): records are per-user and owner-scoped; sessions are first-party
   cookies. See [`auth-plan.md`](auth-plan.md).
2. **Persistence (D1 + Drizzle)** — the API is built without a database first;
   D1 + Drizzle is the intended choice when persistence is introduced.
3. **Preview deployments** — per-PR Version URLs are wired up (see §12 and
   `workflow-plan.md` W3).

### Open
None at present. The frontend stack — the last open item — is now decided; see
[`frontend.md`](frontend.md).

---

## 17. Next steps

The step-by-step execution guide is [`scaffold-runbook.md`](scaffold-runbook.md).

1. Scaffold the monorepo: workspace root, `apps/web` (Vite + React SPA, web
   Worker), `apps/worker` (Hono API Worker), and `packages/api` (generated
   contracts).
2. Wire the domain: `foonix.net` custom domain on the web Worker, `/api/*` route to
   the API Worker.
3. Add Vitest Workers pool and a Playwright smoke test.
4. Add the GitHub Actions workflow for tests and production deploy of both Workers.
5. Revisit the deferred items when they reach the top of the backlog.
