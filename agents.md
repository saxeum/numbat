# AGENTS.md

Guidance for AI agents working in this repository.

## Rules

1. Do not write code unless explicitly asked. No extra files, refactors, or generated code.
2. Do not commit, push, or open a pull request unless explicitly asked. Never push to `main`, force-push, merge, or change repository visibility.
3. Every change lands through a pull request. `main` requires the `typecheck · test · build` check and a linear history.
4. Prefer reading and searching before changing anything, and ask when a request is ambiguous.

## Project

`numbat` is a Cloudflare Workers application:

- `apps/web` — Vite + React SPA served as static assets from a Worker
- `apps/worker` — Hono API Worker mounted at `/api`
- `packages/api` — Zod schemas and types generated from `openapi/openapi.yaml`
- `packages/probe` — model probe engine
- Persistence is D1 + Drizzle; sessions use Better Auth; provider credentials are
  encrypted at rest (BYOK)

Both Workers share one origin, so there is no CORS layer.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — design, request lifecycle, decisions
- [`docs/frontend.md`](docs/frontend.md) — frontend conventions
- [`docs/incident-response.md`](docs/incident-response.md) — severity, rollback, D1 recovery
- [`docs/rate-limiting.md`](docs/rate-limiting.md) — how limiting works and how to test it
- [`docs/free-token-onboarding.md`](docs/free-token-onboarding.md) — provider keys
- [`docs/google-oauth-setup.md`](docs/google-oauth-setup.md) — OAuth client setup
- [`docs/gateway-tutorial.md`](docs/gateway-tutorial.md) — local gateway walkthrough
- [`SECURITY.md`](SECURITY.md) — disclosure policy
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — workflow and checks

## Commands

```bash
npm ci             # install all workspaces
npm run dev        # API on :8787, SPA on :5173
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

## Conventions

- `openapi/openapi.yaml` is the source of truth for the API. After changing it, run
  `npm run api:gen` and commit the regenerated files; CI checks for drift.
- Keep `compatibility_date` identical in both `wrangler.jsonc` files.
- Never commit secrets, `.dev.vars`, account identifiers, or local tool state.
