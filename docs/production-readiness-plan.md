# numbat — Production Readiness Plan

- **Status:** Proposed
- **Date:** 2026-10-20
- **Scope:** Mitigate the gaps in [`production-readiness-assessment.md`](production-readiness-assessment.md)
  (external assessment) for the API + web Workers, **before** persistence (D1) is
  introduced.
- **Companions:** [`architecture.md`](architecture.md) (§7.3 errors, §7.4
  middleware, §13 observability, §14 security), [`workflow-plan.md`](workflow-plan.md)
  (W2/W4/W6/W7), [`scaffold-runbook.md`](scaffold-runbook.md).

The assessment verdict — *"not production-ready, but excellent foundation"* — is
fair. This plan turns its recommendations into sequenced, testable workstreams,
corrects a few items that don't apply to Workers as written, and explicitly
**defers D1/authentication** (architecture D4/D10) while leaving the hooks those
will need.

---

## 0. Progress

| Workstream | Status |
|---|---|
| P0.1 API error handling / request ID / structured logging | ✅ done (envelope + `X-Request-ID`, unknown errors not leaked) |
| P0.2 Frontend error handling | ✅ done (boundary + router `errorElement` + query caches) |
| P0.3 Security headers | ✅ done (API middleware; web `_headers`, CSP **Report-Only**) |
| P0.4 Environment / config validation | ✅ done (`ENVIRONMENT` var + Zod, `.dev.vars.example`) |
| P1.1 Input validation + OpenAPI | ✅ done (`OpenAPIHono`, `GET /api/openapi.json`, health documented) |
| P1.2 Rate limiting | ↩ **backlog** (skipped 2026-10-20) |
| P1.3 Health enhancement | ✅ done (`timestamp`, `version`, DB-check placeholder) |
| P1.4 Observability | ✅ decision: Workers Logs only; Sentry deferred |
| P1.5 CI hardening | ✅ done (node24 action bumps, audit step, post-deploy smoke, `main guard`, oxlint override) |
| P2.1–P2.3 | ☐ not started |

---

## 1. Relationship to the assessment

- **Adopt:** API error handling + request IDs + logging; frontend error
  boundaries; security headers; env/config validation; input validation; enhanced
  health check; observability; CI hardening; load testing; incident/rollback
  docs.
- **Adapt:** several code snippets need Workers/Hono-correct shapes (see §4
  corrections).
- **Defer (explicitly out of scope here):** D1 + Drizzle, authentication, preview
  D1. This plan only *prepares* for them (health-check DB hook, env schema,
  migration discipline in `workflow-plan.md` W7).

## 2. Sequencing principle

Do the **P0** items first (they block a safe launch), then **P1** before public
launch, then **P2** post-launch. Each workstream ships behind CI (typecheck, lint,
format, unit/integration, E2E) and is covered by a test. No schema work until
P0+P1 are done — so the database lands on a hardened base.

---

## 3. Workstreams

### P0 — Must have (block production)

#### P0.1 API error handling, request ID, structured logging
Implements `architecture.md` §7.3/§7.4.

- `apps/worker/src/api/middleware/request-id.ts` — generate a UUID, expose it on
  the Hono typed context (`Variables`), and return it as `X-Request-ID`.
- `apps/worker/src/api/middleware/logger.ts` — one structured JSON line per
  request and per response (method, path, status, duration, `cf-ray`, UA), logged
  **after** `next()` so the status/duration are correct.
- `apps/worker/src/api/middleware/error.ts` — `AppError` + `onError` normalizing
  every failure into the single envelope (`code`, `message`, `details`,
  `requestId`). Unknown errors log the stack but return a generic 500 (no leakage).
- Wire in `apps/worker/src/index.ts` in the documented order:
  request ID → logger → (future auth/rate limit) → routes → error handler.
- **Test:** integration tests for 404 envelope, thrown `AppError`, unknown error
  (500, no stack), and `X-Request-ID` presence.

#### P0.2 Frontend error handling
- `apps/web/src/components/error-boundary.tsx` (class boundary) wrapping the app.
- React Router `errorElement` on the root route for route/loader errors.
- TanStack Query: keep `throwOnError: false`, surface query errors in the UI, and
  a global `QueryCache`/`MutationCache` `onError` hook (log + TODO for Sentry).
- **Test:** an E2E (or component) test asserting the fallback renders on a thrown
  render error; a route that throws renders the `errorElement`.

#### P0.3 Security headers
- **API Worker:** a `secureHeaders` middleware (Hono's built-in `secureHeaders`
  helper where possible) setting `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and HSTS.
- **Web Worker (static assets):** add `apps/web/public/_headers` (copied into
  `dist/`) with the same headers plus CSP. Workers static assets support
  `_headers`; verify it survives to `dist/_headers` in the build.
- **CSP:** start with `Content-Security-Policy-Report-Only`, then enforce. The
  built SPA loads external module scripts and a stylesheet, so aim for
  `script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:`
  — avoid `'unsafe-inline'` for scripts. Validate before enforcing.
- **Test:** assert headers on `/api/health`; assert `dist/_headers` exists and is
  correct.

> The assessment's `"rules": [...]` block in `wrangler.jsonc` is **not a valid
> Workers config key** — Worker-level headers come from middleware or `_headers`
> (zone-wide headers would be Cloudflare Transform Rules, out of scope).

#### P0.4 Environment & config management
- Declare non-secret vars in `wrangler.jsonc` `vars` (e.g. `ENVIRONMENT`,
  `APP_VERSION`) — **do not** hand-edit `worker-configuration.d.ts`; it is
  generated by `wrangler types`.
- `apps/worker/src/config.ts` — Zod schema for `Env`; validate **once per
  isolate** (module-scope or a lazily-cached check), not on every request.
- `.dev.vars.example` per app (committed) + keep real `.dev.vars` gitignored.
- **Test:** config validation rejects a missing/invalid var (unit).

### P1 — Before public launch

#### P1.1 Input validation + OpenAPI
- Adopt the already-installed `@hono/zod-openapi` (use `OpenAPIHono` +
  `createRoute`) for new endpoints, with schemas in `packages/shared`.
- For plain routes, add `@hono/zod-validator` as a **direct** dependency (it's
  currently only transitive).
- Serve `GET /api/openapi.json`; keep schemas as the single contract.
- **Test:** invalid body → `400` with the error envelope; valid → success schema.

#### P1.2 Rate limiting — **BACKLOG (skipped 2026-10-20)**

Deferred. When revisited, do **not** use an in-memory `Map` (per-isolate,
unbounded, lost on eviction). Options: Cloudflare edge **Rate Limiting rules**
(zone) for coarse protection, or a **Durable Object / KV-backed** limiter for
per-key logic. Likely plan-gated on the free tier — verify availability first.

#### P1.3 Health check enhancement
- Extend `HealthResponse` in `packages/shared` (`timestamp`, `version`, optional
  `database`) and update the route; keep `{ ok: true }` shape compatible.
- Add a **DB-check placeholder** (commented or behind a flag) so D1 wiring is
  trivial later; return `503` when a check fails.
- **Test:** 200 healthy; 503 when a dependency check fails (stubbed).

#### P1.4 Observability
- **Error tracking:** integrate `@sentry/cloudflare` (decision required — see
  §7). DSN as a Worker secret.
- **Metrics:** Cloudflare Analytics Engine binding for request/error counters;
  Workers Logs already on.
- **Alerting:** dashboard alert on 5xx rate and error volume.
- **Test:** no secrets in logs; Sentry init behind config.

#### P1.5 CI hardening
- `npm audit --omit=dev` (or the audit step) + a non-blocking `npm outdated`
  report; triage the current **7 high** transitive advisories.
- **Post-deploy smoke:** a job after both deploys that polls
  `https://foonix.net/api/health` and `/` and fails on non-200 (the deploy matrix
  legs can't check each other).
- Add `actionlint` and the **`main guard`** advisory workflow from
  `workflow-plan.md` (Option C).

### P2 — Post-launch / nice to have

- **P2.1** Load testing (k6/autocannon) against staging/`workers.dev`, with results
  recorded.
- **P2.2** Incident response doc (severity, comms, rollback rehearsal via
  `wrangler rollback`).
- **P2.3** Monitoring dashboards + SLOs (availability, p95 latency, 5xx rate).
- **P2.4** D1 + Drizzle (architecture D4; `workflow-plan.md` W7) — next milestone
  *after* this plan.
- **P2.5** Authentication (architecture D10) — before user-scoped data.

---

## 4. Corrections to the assessment

| # | Assessment says | Correct for numbat |
|---|-----------------|--------------------|
| C1 | `wrangler.jsonc` `"rules"` for headers | Invalid key. Use Hono middleware (API) and a `_headers` file in the web assets |
| C2 | In-memory `Map` rate limiter | Doesn't work on Workers (per-isolate, unbounded). Use edge rules / DO / KV |
| C3 | Edit `worker-configuration.d.ts` to add `Env` | Generated by `wrangler types`; declare vars/secret names in `wrangler.jsonc`, regenerate |
| C4 | `import { zValidator } from '@hono/zod-validator'` as if present | Only a transitive dep today — add it directly, or use `@hono/zod-openapi` route validators |
| C5 | `c.res.headers.set(...)` before `next()` | Headers must be set after `next()` (or via `c.header`) to survive; use typed `Variables` for `requestId` |
| C6 | CSP with `'unsafe-inline'` scripts | Prefer `script-src 'self'`; roll out CSP with `Report-Only` first |
| C7 | `X-XSS-Protection` | Deprecated/ignored by modern browsers; harmless but unnecessary |
| C8 | `npm audit --production` | Use `--omit=dev`; expect the current 7 high transitive findings to need triage, not auto-fix |

---

## 5. Acceptance criteria (definition of done)

- **P0 complete when:** every API error returns the envelope with an
  `X-Request-ID`; the SPA shows a fallback on render/route errors; security
  headers present on both Workers; config validated once per isolate; all covered
  by tests; `verify` green.
- **P1 complete when:** new endpoints validate via shared Zod schemas and appear
  in `/api/openapi.json`; edge rate limiting live on `/api/*`; health returns
  version/timestamp and a DB hook; Sentry + metrics + one alert active; CI has
  audit + post-deploy smoke + actionlint + main guard.
- **P2 complete when:** load test recorded, incident/rollback doc committed,
  dashboards live.

## 6. Phased rollout & effort

| Phase | Workstreams | Est. |
|-------|-------------|------|
| **P0** | P0.1, P0.2, P0.3, P0.4 | ✅ done |
| **P1** | P1.1, P1.3, P1.4, P1.5 (P1.2 → backlog) | ✅ done |
| **P2** | P2.1–P2.3 | ~0.5–1 day |
| **Then** | D1 + Drizzle (P2.4), Auth (P2.5) | separate plan |

Each phase lands as its own PR(s) through the `verify` pipeline; previews
available per PR (`workflow-plan.md` W3).

## 7. Approval matrix

| Item | Owner |
|------|-------|
| P0.1–P0.4, P1.3, P1.5, P2.2 | None — agent-implementable, PR review |
| Sentry adoption + DSN secret (P1.4) | Eng decision + Cloudflare secret |
| Analytics Engine binding + alert (P1.4) | Cloudflare |
| Edge rate-limiting rules (P1.2) | Cloudflare (zone) |
| CSP enforcement level (P0.3) | Eng decision |
| `@hono/zod-openapi` as the standard (P1.1) | Eng decision |
| Load-testing scope (P2.1) | Eng decision |

## 8. Open questions

1. **Error tracking:** ✅ **resolved 2026-10-20 — stay on Workers Logs; Sentry deferred.**
2. **Rate limiting:** ✅ **resolved 2026-10-20 — skipped, moved to the backlog.** Revisit when the API is public/abused; decide edge rules vs DO/KV then.
3. **OpenAPI:** ✅ **resolved 2026-10-20 — `OpenAPIHono` adopted; `health` migrated**
   and the pattern is set for new routes.
4. **CSP:** ◐ applied as `Content-Security-Policy-Report-Only`; enforce after
   confirming no violations (P2).
5. **Staging:** introduce a `preview`/staging environment now (pairs with W4/W7)
   or with D1?

## 9. Backlog (Jira)

Tracked in project **KAN** on `saxeum.atlassian.net`:

| Ticket | Item |
|---|---|
| KAN-4 | [P1.2] Rate limiting for the public API |
| KAN-5 | [P2.1] Load testing for API and SPA |
| KAN-6 | [P2.2] Incident response & rollback runbook |
| KAN-7 | [P2.3] Monitoring dashboards & SLOs |
| KAN-8 | [Security] Enforce CSP (move off Report-Only) |
| KAN-9 | [Observability] Adopt Sentry error tracking (deferred) |

---

## 10. Explicit non-goals

- D1 + Drizzle, authentication, preview-isolated storage (deferred; prepared for
  via env schema, health DB hook, and `workflow-plan.md` W7).
- Zone-wide WAF/Transform Rules beyond rate limiting.
- Multi-region/DR work (single-origin Workers already give global edge).
