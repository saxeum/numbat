# cf-e2e — Architecture

- **Status:** Accepted (proposed baseline)
- **Date:** 2026-10-19
- **Repo:** `saxeum/cf-e2e`
- **Scope:** TypeScript application — React SPA frontend, REST API backend — deployed to Cloudflare Workers.

This document records the target architecture and the decisions behind it. It is
descriptive, not an implementation guide; code is written only when explicitly
requested (see `agents.md`).

---

## 1. Decision summary

| # | Decision | Choice | Alternatives considered |
|---|----------|--------|-------------------------|
| D1 | Hosting model | **Single Worker serving static assets + API** | Pages + Functions; two separate deployments |
| D2 | Frontend | **Vite + React SPA** — React Router, TanStack Query, Tailwind + **shadcn/ui** (see [`frontend.md`](frontend.md)) | Mantine; MUI; Ant Design; DaisyUI; framework modes (React Router v7, TanStack Start, Next via OpenNext) |
| D3 | API framework | **Hono** with Zod + OpenAPI | itty-router + chanfana; plain `fetch`; tRPC/oRPC |
| D4 | Persistence | **Deferred to a later stage** — intended D1 + Drizzle when needed (see §16) | KV-only; Hyperdrive + Postgres; Durable Objects |
| D5 | Unit/integration tests | **Vitest + `@cloudflare/vitest-pool-workers`** | Miniflare directly; mocked bindings |
| D6 | Browser E2E tests | **Playwright** | Cypress |
| D7 | CI/CD | **GitHub Actions + `cloudflare/wrangler-action`** (with Workers Builds as an option) | Workers Builds only; manual `wrangler deploy` |
| D8 | Auth | **Deferred to a later stage** (see §10) | Cloudflare Access; Better Auth; managed IdP |
| D9 | Repo structure | **Monorepo (workspaces)** — API and web apps plus a shared contracts package | Single package |
| D10 | Custom domain | **Deferred to a later stage** — use `*.workers.dev` for now (see §16) | Attach a domain now |
| D11 | Preview deployments | **Deferred to a later stage** (see §12, §16) | Per-PR Workers env; Workers Builds previews |

---

## 2. System overview

A single Cloudflare Worker owns both the client and the server surface:

```
                    ┌──────────────────────── Cloudflare edge ────────────────────────┐
   Browser ───────▶ │  Worker (cf-e2e)                                                 │
                    │                                                                  │
                    │   /api/*   ──▶  Hono REST API ──▶  bindings (D1, KV, R2, ...)    │
                    │                                                                  │
                    │   *        ──▶  Static Assets binding ──▶ built React SPA        │
                    │                 (SPA fallback → index.html for client routes)   │
                    └──────────────────────────────────────────────────────────────────┘
```

**Why one Worker:** same origin means no CORS configuration, first-class cookies
and sessions, one deploy artifact, one `wrangler` config, and no cross-service
auth plumbing. Static asset requests are served by Cloudflare's asset layer and
do not consume Worker CPU unless routed to the Worker.

---

## 3. Components

### 3.1 Frontend — Vite + React SPA
- TypeScript throughout; client-side routing (React Router, library mode).
- Build output is a static bundle (HTML, JS, CSS, assets) consumed by the Worker's
  Static Assets binding.
- No SSR server. Deep links resolve client-side via the SPA fallback.
- Data fetching talks to the same-origin `/api` surface.

### 3.2 API — Hono + Zod/OpenAPI
- Hono router mounted at `/api`, running in the Worker.
- Zod schemas validate request bodies, params, query strings, and define response
  shapes; `@hono/zod-openapi` generates an OpenAPI document served by the app.
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

---

## 4. Request lifecycle

1. Request hits the Worker on the edge.
2. If the path matches the API prefix (`/api/*`), the Worker runs Hono:
   request ID → logging → validation → handler → typed JSON response.
3. Otherwise the Static Assets binding serves the matching built asset.
4. If no static asset matches and the request looks like a client route, the SPA
   fallback returns `index.html` so the React router can resolve it.
5. Errors are normalized into a single JSON error envelope (§7.3).

Static assets are cached by Cloudflare's CDN; API responses set explicit cache
headers (default: no-store unless a handler opts into caching).

---

## 5. Proposed repository layout

```
cf-e2e/                          # monorepo root (workspaces)
├── agents.md                    # agent rules + verified CLI access
├── docs/
│   └── architecture.md          # this document
├── package.json                 # workspace root
├── wrangler.jsonc               # Worker config: assets, bindings, envs
├── apps/
│   ├── web/                     # Vite + React SPA (static build output)
│   └── worker/                  # Hono API + Worker entry
│       └── src/
│           ├── api/             # routes, middleware, schemas
│           └── db/              # Drizzle schema, queries, migrations (later)
├── packages/
│   └── shared/                  # shared Zod contracts + TS types (api ↔ web)
├── tests/
│   ├── unit/                    # Vitest (Workers pool)
│   └── e2e/                     # Playwright
├── .dev.vars                    # local secrets (gitignored)
└── .gitignore
```

> The monorepo uses workspaces (npm workspaces; pnpm optional). `packages/shared`
> holds contracts shared between API and web so types and validation stay in sync.

---

## 6. Configuration

Worker configuration lives in `wrangler.jsonc`:

- **Compatibility:** pinned `compatibility_date`, with flags opted in explicitly.
- **Static assets:** a build-output directory, an assets binding, and
  `not_found_handling` set to SPA mode so client routes fall through to
  `index.html`.
- **Routing precedence:** configure which requests run the Worker first (the API
  prefix) versus which are served as static assets.
- **Bindings:** D1, KV, R2, etc., declared per environment.
- **Environments:** named environments (e.g. `staging`, `production`) with separate
  bindings and secrets.

Secrets never live in the config or repo:
- Local: `.dev.vars` (already gitignored).
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

- **Rendering:** client-side only (SPA). The Worker never renders React.
- **Build:** Vite produces the static bundle consumed by the assets binding.
- **Routing:** React Router (library mode); unknown deep links fall back to
  `index.html`.
- **Server state:** TanStack Query. **Client state:** React built-ins (Zustand only
  if a real global-store need appears).
- **Styling & UI:** Tailwind CSS + **shadcn/ui** (Radix primitives, components
  owned in-repo).
- **Forms:** React Hook Form + Zod, validating with schemas shared from
  `packages/shared`.
- **Tables:** TanStack Table (shadcn data-table pattern).
- **API types:** Hono RPC client for end-to-end types across the monorepo; the
  OpenAPI document remains the contract for docs/external clients.

Full detail: [`frontend.md`](frontend.md).

---

## 9. Local development

- **Worker/API:** `wrangler dev` runs the Worker in `workerd` with real bindings
  (local D1 is used once persistence is introduced — see §16).
- **Frontend:** Vite dev server for fast HMR; `/api` proxied to the Worker during
  development.
- **Secrets:** `.dev.vars` for local-only values.
- **Data:** local D1 state via Drizzle migrations, added with persistence (§16).

---

## 10. Authentication & authorization (deferred to a later stage)

**Decision: deferred.** Authentication is out of scope for the first milestone and
will be added in a later stage. The options below are the shortlist, in order of
least code:

1. **Cloudflare Access** — zero application code for internal/private apps.
2. **Self-hosted on Workers** — Better Auth / Auth.js / Lucia, sessions in the
   same-origin Worker (simple because there is no CORS).
3. **Managed IdP** — Clerk / Auth0 / WorkOS for social, MFA, enterprise SSO.

This must be resolved before any user-specific data model is finalized.

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
- **Preview deployments: deferred to a later stage.** When added, choose per-PR
  Workers environments or Workers Builds previews (see §16).
- **On merge to `main`:** build → deploy to production via
  `cloudflare/wrangler-action`, authenticated with a Cloudflare API token stored as
  a GitHub Actions secret.
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
- Same-origin design removes the CORS attack surface by default.
- Input validated at the edge with Zod before reaching handlers or the database.
- Security headers (CSP, HSTS, etc.) applied by middleware; Cloudflare WAF / rate
  limiting available at the edge.
- Least-privilege credentials: CI deploy token ≠ local OAuth session ≠ GitHub token.

---

## 15. Consequences & trade-offs

**Benefits**
- One deploy, one config, one origin; no CORS or cross-service auth complexity.
- TypeScript everywhere with shared contracts via OpenAPI.
- Local dev and tests run in the real `workerd` runtime with real bindings.
- Cheap to start; services (D1, KV, R2, Queues, DO) added incrementally.

**Trade-offs / risks**
- Frontend and backend deploy together; no independent release cadence (mitigated
  by environments, not by splitting).
- Static assets are client-rendered, so first paint waits on JS (acceptable for an
  SPA; SSR would require a framework change — see D2 alternatives).
- Worker CPU limits apply to API work; long-running jobs should move to Queues or
  Durable Objects.

---

## 16. Deferred items & open questions

### Deferred to a later stage
Deliberately out of scope for the first milestone; each is revisited before it
becomes a blocker.

1. **Authentication / authorization** — see §10. Must be resolved before any
   user-specific data model is finalized.
2. **Persistence (D1 + Drizzle)** — the API is built without a database first;
   D1 + Drizzle is the intended choice when persistence is introduced.
3. **Custom domain** — deployed to `*.workers.dev` for now; a custom domain/route
   is attached later.
4. **Preview deployments** — CI runs tests and builds but does not deploy
   previews yet (see §12).

### Open
None at present. The frontend stack — the last open item — is now decided; see
[`frontend.md`](frontend.md).

---

## 17. Next steps

1. Scaffold the monorepo: workspace root, `apps/web` (Vite + React SPA),
   `apps/worker` (Hono API), `packages/shared` (Zod contracts), and
   `wrangler.jsonc` with static assets + SPA fallback.
2. Add Vitest Workers pool and a Playwright smoke test.
3. Add the GitHub Actions workflow for tests and production deploy.
4. Revisit the deferred items when they reach the top of the backlog.
