# AGENTS.md

Guidance for AI agents working in this repository.

## Rules

1. **Do not write code unless explicitly asked to do so.** No new files, edits, refactors, or generated code beyond what was requested.
2. **Do not commit code unless explicitly asked to do so.** Never run `git commit`, `git push`, or create commits/branches on your own.
3. **Docs-only changes skip the PR.** Once a change is explicitly requested, commit documentation (`docs/**`, `*.md`, README/agents) **directly to `main`** and let it ride along in the **next real (code) PR** — do not open a PR solely for docs. Don't push `main` directly; unpushed doc commits are included when the next feature branch is cut from `main`.

## Additional Expectations

- Prefer read-only exploration (reading files, searching) before making any change.
- Ask for clarification when a request is ambiguous rather than assuming.
- If a task requires code changes, confirm the scope first and wait for explicit approval.
- Keep responses concise and show file paths clearly when referencing files.

## Project

`numbat` — TypeScript application with a React SPA frontend and a REST API
backend, deployed to Cloudflare Workers.

- **Source of truth:** GitHub. Code lives under the personal account `gmtreacy`
  or the `saxeum` organization. This repo: **`saxeum/numbat`**.
- **Deployment target:** Cloudflare Workers (via Wrangler).
- **Architecture:** see [`docs/architecture.md`](docs/architecture.md) for the
  accepted design (two Workers on `foonix.net` — static-assets SPA + Hono API,
  D1/Drizzle, Vitest + Playwright) and the current open questions.
- **Workflow plan:** see [`docs/workflow-plan.md`](docs/workflow-plan.md) for the
  branch/PR/CI hardening and the approval matrix.
- **Production readiness:** see [`docs/production-readiness-review.md`](docs/production-readiness-review.md)
  (current state — **ready for feature development**), [`docs/production-readiness-plan.md`](docs/production-readiness-plan.md)
  (mitigation plan), and [`docs/production-readiness-assessment.md`](docs/production-readiness-assessment.md)
  (source assessment).
- **Issue tracking:** Jira project **`KAN`** on `saxeum.atlassian.net` (via the
  Atlassian MCP server). Backlog tickets are referenced in the readiness plan §9.
- **Persistence plan:** see [`docs/persistence-plan.md`](docs/persistence-plan.md)
  (D1 + Drizzle, tracking ticket **KAN-10**).
- **Manual testing:** see [`docs/manual-testing-todos.md`](docs/manual-testing-todos.md)
  for exercising the DB + todo feature across local/staging/preview/prod.
- **Todo UI plan:** see [`docs/todo-ui-plan.md`](docs/todo-ui-plan.md)
  (single-user full CRUD, tracking ticket **KAN-15**).
- **OpenAPI plan:** see [`docs/openapi-plan.md`](docs/openapi-plan.md)
  (spec-first `openapi.yaml` + codegen + Swagger UI, tracking ticket **KAN-16**).
- **Auth plan:** see [`docs/auth-plan.md`](docs/auth-plan.md)
  (Google OAuth via Better Auth, per-user todos, tracking ticket **KAN-13**)
  and [`docs/google-oauth-setup.md`](docs/google-oauth-setup.md) (GCP setup).
- **Incident response:** see [`docs/incident-response.md`](docs/incident-response.md)
  (severity, rollback, D1 recovery, comms).

## Verified CLI Access

### GitHub — `gh`
- `gh` at `~/.local/bin/gh` (version 2.102.0).
- Authenticated as **`gmtreacy`** (Git operations over SSH).
- Token scopes: `gist`, `read:org`, `repo`.
- Confirmed access to the **`saxeum`** org and its private repos.

### Cloudflare — `wrangler`
- `wrangler` v4.151.2 installed globally (`npm install -g wrangler`).
- Authenticated via OAuth as **<redacted-email>**.
- Account: `<redacted-email>'s Account` (`<cloudflare-account-id>`).
- Credentials stored in `~/.config/.wrangler/config/default.toml`; the access
  token refreshes automatically via the stored refresh token.
- Confirmed `workers:write`, `workers_scripts:write`, `d1:write`, `pages:write`,
  `workers_kv:write`, and more.

> Secrets (OAuth/refresh tokens) live only in the config file above. Never print,
> commit, or paste them; reference them by path.
