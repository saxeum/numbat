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
| D2 | Frontend | **Vite + React (pure SPA)** | React Router v7 framework mode; TanStack Start; Astro; Next.js via OpenNext |
| D3 | API framework | **Hono** with Zod + OpenAPI | itty-router + chanfana; plain `fetch`; tRPC/oRPC |
| D4 | Persistence | **D1 + Drizzle ORM** | KV-only; Hyperdrive + Postgres; Durable Objects |
| D5 | Unit/integration tests | **Vitest + `@cloudflare/vitest-pool-workers`** | Miniflare directly; mocked bindings |
| D6 | Browser E2E tests | **Playwright** | Cypress |
| D7 | CI/CD | **GitHub Actions + `cloudflare/wrangler-action`** (with Workers Builds as an option) | Workers Builds only; manual `wrangler deploy` |
| D8 | Auth | **Deferred — see §10** | Cloudflare Access; Better Auth; managed IdP |

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
cf-e2e/
├── agents.md                  # agent rules + verified CLI access
├── docs/
│   └── architecture.md        # this document
├── src/
│   ├── api/                   # Hono app: routes, middleware, schemas
│   └── db/                    # Drizzle schema, queries, migrations
├── web/                       # Vite + React SPA source
│   └── ...                    # built output consumed by Static Assets
├── tests/
│   ├── unit/                  # Vitest (Workers pool)
│   └── e2e/                   # Playwright
├── wrangler.jsonc             # Worker config: assets, bindings, envs
├── .dev.vars                  # local secrets (gitignored)
├── .gitignore
└── package.json
```

> This is a proposal. The layout is finalized when scaffolding begins.

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
- **Routing:** client router with history API; unknown deep links fall back to
  `index.html`.
- **State/data:** to be decided during scaffolding (e.g. TanStack Query for
  server state; minimal local state). Not fixed here.
- **Styling / component library:** open — decide at scaffold time.
- **Build:** Vite produces the static bundle consumed by the assets binding.
- **Types:** API types shared from the OpenAPI document or generated client to keep
  frontend and backend in sync.

---

## 9. Local development

- **Worker/API:** `wrangler dev` runs the Worker in `workerd` with real bindings,
  including a local D1 instance and local persistence.
- **Frontend:** Vite dev server for fast HMR; `/api` proxied to the Worker during
  development.
- **Secrets:** `.dev.vars` for local-only values.
- **Data:** local D1 state via Drizzle migrations applied to the local instance.

---

## 10. Authentication & authorization (open)

Not yet decided. Options, in order of least code:

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
  build → (optionally) deploy a preview environment.
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

## 16. Open questions

1. **Auth** — which of the §10 options?
2. **Database** — is D1 required for the first milestone, or API-only?
3. **Custom domain / route** — attach a `saxeum` domain or use `*.workers.dev`?
4. **Monorepo vs single package** — keep the SPA and Worker in one package
   (recommended) or a workspace split.
5. **Frontend data/state library** and component/styling approach.
6. **Preview deployments** — per-PR Workers environment or Workers Builds previews?

---

## 17. Next steps

1. Resolve §16.1 (auth) and §16.2 (database).
2. Scaffold: Vite + React SPA, Hono API, `wrangler.jsonc` with static assets + SPA
   fallback.
3. Add Drizzle + D1 and the first migration if a database is in scope.
4. Add Vitest Workers pool and a Playwright smoke test.
5. Add the GitHub Actions workflow for tests + deploy.
