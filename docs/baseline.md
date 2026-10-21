# numbat — Infrastructure Baseline (fork template)

- **Tag:** `v0.1.0` (annotated)
- **Meaning:** infrastructure is done. Fork this repo and check out the tag to
  start a **new product** on the same foundation.
- **Reference product in the tag:** the baseline shipped a worked example of the
  full slice (SPA → API → D1) and auth; it has been removed in this fork.

Companion docs: [`architecture.md`](architecture.md),
[`scaffold-runbook.md`](scaffold-runbook.md) (how it was built),
[`workflow-plan.md`](workflow-plan.md), [`production-readiness-plan.md`](production-readiness-plan.md),
[`persistence-plan.md`](persistence-plan.md), [`openapi-plan.md`](openapi-plan.md),
[`auth-plan.md`](auth-plan.md).

---

## 1. What the baseline gives you

- **Monorepo** (npm workspaces): `apps/web` (Vite + React SPA on a Worker),
  `apps/worker` (Hono API on a Worker), `packages/api` (generated contracts).
- **Two Workers, one origin**: SPA + Hono API path-routed on a custom domain
  (`/api/*` → API Worker, `/*` → web Worker). No CORS.
- **Spec-first OpenAPI**: `openapi/openapi.yaml` is the source of truth →
  generated Zod + types (`@numbat/api`), Swagger UI at `/api/docs`.
- **D1 + Drizzle**: typed schema + migrations, per-environment databases
  (prod / staging / preview), local Miniflare D1 in tests.
- **Auth**: Better Auth (Google OAuth), first-party cookie sessions, per-user
  data, owner-scoped queries, dev email/password for tests.
- **CI/CD**: GitHub Actions — typecheck, lint, format, tests, E2E, spec lint +
  codegen drift, per-PR **preview URLs** (isolated web+API+DB), deploy on merge,
  post-deploy smoke, advisory `main guard`.
- **Ops**: structured logs + request IDs, error envelope, security headers
  (incl. enforced CSP), health check with DB probe, incident/rollback runbook,
  manual-testing guide.

## 2. Fork & start a new product

```bash
git clone <fork-url> && cd <new-repo>
git checkout v0.1.0
git switch -c feat/initial-product
npm ci && npm run dev
```

Then:

**A. Remove the reference product.**
This fork has already stripped the baseline's reference domain — routes, schema,
UI, tests, OpenAPI paths, and migrations. The API now serves `/health` plus the
product's own `/api/*` routes, and D1 migrations are auth-only. When creating a
new baseline, keep this step as the reminder to remove the previous product
(OpenAPI paths + schemas, Drizzle tables + queries + routes, SPA features/routes,
tests) and then regenerate: `npm run api:gen && (cd apps/worker && npx drizzle-kit generate --name init)`.

**B. Rename & re-provision** (the baseline is hard-wired to `numbat`/`foonix.net`):
- **Names**: Worker names in both `wrangler.jsonc` (`numbat-web`, `numbat-api`,
  `numbat-api-preview`, `numbat-api-staging`), D1 database names, package
  names, and docs.
- **Domain**: the custom domain + `/api/*` route, `BETTER_AUTH_URL`, the Google
  OAuth client's JS origins + redirect URIs, and `openapi` servers.
- **Cloudflare**: account/zone, D1 databases (new IDs in `wrangler.jsonc`),
  CI secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
- **Auth secrets**: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`
  (`.dev.vars` locally, `wrangler secret put` remotely) — see
  [`google-oauth-setup.md`](google-oauth-setup.md).
- **GitHub**: repository secrets and any URLs in docs/CI.

**C. Update the docs:** the reference product's plans have been removed from the
fork; rewrite `architecture.md` for the new domain.

## 3. Keep as-is

The workspace layout, CI workflow + preview pipeline, spec-first OpenAPI setup,
error/logging middleware, security headers, D1/Drizzle + migration discipline,
Better Auth wiring, and the runbooks are product-agnostic — don't rebuild them.

## 4. Making a new baseline

When the new product also reaches "infra done", tag it the same way:

```bash
git tag -a v0.1.0 -m "Infrastructure baseline"
git push origin v0.1.0
```
