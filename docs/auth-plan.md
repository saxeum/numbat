# numbat — Auth Plan (Google OAuth via Better Auth)

- **Status:** Proposed
- **Date:** 2026-10-20
- **Ticket:** Jira **KAN-13** (`[S2] User accounts and auth`, epic KAN-11)
- **Scope:** Add user accounts and make todos per-user, starting with **Google
  OAuth**. Resolves the deferred auth decision (`architecture.md` D8/§10).
- **Companions:** [`architecture.md`](architecture.md) (§2, §10, §14, §16),
  [`persistence-plan.md`](persistence-plan.md) (§7 migrations),
  [`frontend.md`](frontend.md), [`openapi-plan.md`](openapi-plan.md).

---

## 1. Goal

A visitor can **sign in with Google**, get a first-party session, and see only
**their own** todos. Unauthenticated access to todo endpoints is rejected; the
data model gains an owner; sessions persist across reloads.

## 2. Decision — Better Auth (self-hosted on Workers)

Researched options (architecture §10 shortlist + the field):

| Option | Verdict |
|--------|---------|
| **Better Auth** (`better-auth@1.7`) self-hosted in the API Worker | ✅ **Chosen** — D1/Drizzle adapter, Hono handler, cookie sessions, Google + more providers, no vendor |
| Cloudflare Access | Good for internal/private apps; no app-level identity → not for per-user todos |
| Auth.js / `@auth/core` | Works on Workers but Next-centric; more glue for Hono + D1 |
| Lucia | In maintenance/deprecated — avoid for new work |
| Managed IdP (Clerk/Auth0/WorkOS) | Less code but per-MAU cost + vendor; revisit for enterprise SSO later |

**Why it fits:** same-origin (`foonix.net`) keeps session cookies first-party
(architecture §2/§10); Better Auth plugs into our existing **D1 + Drizzle** stack
(`drizzleAdapter(db, { provider: "sqlite" })`, requires `drizzle-orm ^0.45.2` /
`drizzle-kit >=0.31.4` — we satisfy both) and mounts on **Hono**
(`app.all("/api/auth/*", (c) => auth.handler(c.req.raw))`).

Packages: `better-auth@1.7`, `@better-auth/drizzle-adapter@1.7`, dev
`@better-auth/cli` (schema/codegen).

## 3. Provider — Google OAuth (first)

- Create a **Google Cloud OAuth client** (Web application) with:
  - Scopes: `openid`, `email`, `profile` (no sensitive scopes → no verification review).
  - Authorized redirect URIs (exact, no wildcards): `<baseURL>/api/auth/callback/google`.
- Config: `socialProviders.google = { clientId, clientSecret }`, plus
  `baseURL` (`BETTER_AUTH_URL`) and `secret` (`BETTER_AUTH_SECRET`).

### Redirect-URI constraint (important)
Google requires **exact** redirect URIs — no wildcards. Our **per-PR preview
hosts are dynamic** (`pr-<n>-numbat-web-preview…`), so they **cannot** be
registered. Consequence:

| Env | SPA origin | Google OAuth? |
|-----|-----------|---------------|
| Local | `http://localhost:5173` | ✅ register `http://localhost:5173/api/auth/callback/google` |
| Production | `https://foonix.net` | ✅ register `https://foonix.net/api/auth/callback/google` |
| Staging | *(API-only today)* | ⚠️ needs a stable web origin (or skip) |
| PR preview | `pr-<n>-…workers.dev` | ❌ not registerable — previews stay anonymous (or mock auth) |

## 4. Sessions

- **Cookie sessions** (Better Auth default): HttpOnly, Secure, SameSite=Lax,
  first-party on `foonix.net` — the same-origin design is the whole point.
- The auth instance needs the per-request **D1 binding**, so build it per request
  (or memoize by `env`): `createAuth(env)`.
- Secrets (per environment, never committed):
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
  Local → `apps/worker/.dev.vars`; remote → `wrangler secret put`.
- `trustedOrigins` includes the web origins (`foonix.net`, localhost) so the SPA
  can call the API cross-… (same-origin in prod, but localhost dev needs it).

## 5. Data model (Drizzle + migration)

- **Better Auth tables**: `user`, `session`, `account`, `verification` — generate
  with `@better-auth/cli generate`, fold into `src/db/schema.ts`, and produce a
  Drizzle migration (forward-only, persistence-plan §7).
- **`todos.owner_id`**: `text` FK → `user.id`, **NOT NULL**, indexed.
- **Backfill policy for existing anonymous todos** (decide — §12): options are
  (a) delete the handful of anonymous rows (they're test data), (b) keep nullable
  and hide unowned rows, or (c) assign to a seed user. Proposed: **delete/hide**;
  the anonymous rows have no owner and shouldn't leak into the first account.

## 6. API

- Mount the library handler (excluded from our OpenAPI spec, documented):
  `api.all("/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw))`.
- **Auth middleware**: resolve the session
  (`auth.api.getSession({ headers: c.req.raw.headers })`), attach `user` +
  `session` to the typed context; 401 via the standard **error envelope**
  (`UNAUTHENTICATED`).
- **Ownership in queries**: every todo query filters `owner_id = user.id`
  (list/create/update/delete). Cross-user access is impossible by construction;
  covered by isolation tests.
- Contract: todo endpoints gain a `401` response; the spec (`openapi.yaml`) gets a
  `security` scheme (session cookie) and 401 responses — auth *routes* stay
  library-owned.

## 7. SPA

- `src/features/auth/`: `client.ts` (`createAuthClient` from `better-auth/react`,
  `baseURL: "/api/auth"`), a `useSession` hook, `SignInButton` (Google),
  `UserMenu` (name/avatar + sign out).
- **Protected `/todos`**: unauthenticated → show a sign-in screen (or redirect to
  `/sign-in`), then load the user's todos.
- Add a `401` interceptor so an expired session bounces to sign-in.

## 8. Testing

- **Worker integration**: inject a session (mock `getSession` / a test user) and
  assert (a) 401 without a session, (b) **isolation** — user A cannot read/update/
  delete user B's todo.
- **E2E**: real Google can't be automated headlessly. Proposal: enable
  **`emailAndPassword` only in dev/test** (Better Auth) so Playwright can sign in
  deterministically; Google is covered manually + by the worker tests.
- CI `verify` stays green (typecheck/lint/format/tests/E2E + spec drift).

## 9. Environments & secrets

| Env | `BETTER_AUTH_URL` | Notes |
|-----|-------------------|-------|
| Local | `http://localhost:5173` | `.dev.vars`; register localhost redirect |
| Staging | *(TBD)* | API-only today; add a stable web origin or defer |
| Production | `https://foonix.net` | wrangler secrets; registered redirect |

## 10. Rollout

| Phase | Contents | Effort |
|-------|----------|--------|
| 1 | Better Auth + Drizzle adapter + auth tables migration; Google client + secrets; `/api/auth/*` mounted | ~0.5 day |
| 2 | Auth middleware + `owner_id` migration + owner-scoped queries + 401 envelope + isolation tests | ~0.5 day |
| 3 | SPA sign-in/out + session + protected `/todos` | ~0.5 day |
| 4 | E2E (dev credential provider), docs (architecture §10/§16), hardening (rate limit on auth, CSRF check) | ~0.5 day |

## 11. Approval matrix

| Item | Owner |
|------|-------|
| Google Cloud project + OAuth client + redirect URIs | **you** (GCP console) |
| Secrets (`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `BETTER_AUTH_URL`) | you / Cloudflare + local `.dev.vars` |
| Schema, middleware, routes, SPA, tests | agent (PR review) |
| Anonymous-data policy (§12) and dev credential provider (§8) | eng decision |

## 12. Open questions

1. **Existing anonymous todos** — delete, hide (nullable owner), or assign?
2. **Dev/test sign-in** — enable `emailAndPassword` in dev/test for E2E?
3. **Staging** — add a stable staging web origin so OAuth works there, or test
   auth on local + prod only?
4. Extra providers later (GitHub, email magic link) — not now.

## 13. References

- Better Auth — Hono: https://www.better-auth.com/docs/integrations/hono
- Better Auth — Drizzle adapter: https://www.better-auth.com/docs/adapters/drizzle
- Better Auth — Google: https://www.better-auth.com/docs/authentication/google
- Google OAuth redirect URIs must be exact (no wildcards).
- `architecture.md` D8/§10 (decision), §14 (security), §16 (deferred items).
