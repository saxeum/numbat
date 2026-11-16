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

> **Baseline tag `v0.1.0`:** infrastructure is complete; fork the repo and check
> out this tag to start a new product. See [`docs/baseline.md`](docs/baseline.md).

`numbat` — TypeScript application with a React SPA frontend and a REST API
backend, deployed to Cloudflare Workers.

- **Source of truth:** GitHub. Code lives under the personal account `gmtreacy`
  or the `saxeum` organization. This repo: **`saxeum/numbat`**.
- **Deployment target:** Cloudflare Workers (via Wrangler).
- **Architecture:** see [`docs/architecture-tech-stack-review.md`](docs/architecture-tech-stack-review.md)
  for a comprehensive review of the implemented architecture and tech stack
  (current state), and [`docs/architecture.md`](docs/architecture.md) for the
  original design decisions (two Workers on `foonix.net` — static-assets SPA +
  Hono API, D1/Drizzle, Vitest + Playwright).
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
- **OpenAPI plan:** see [`docs/openapi-plan.md`](docs/openapi-plan.md)
  (spec-first `openapi.yaml` + codegen + Swagger UI, tracking ticket **KAN-16**).
- **Auth plan:** see [`docs/auth-plan.md`](docs/auth-plan.md)
  (Google OAuth via Better Auth; tracking ticket **KAN-13**)
  and [`docs/google-oauth-setup.md`](docs/google-oauth-setup.md) (GCP setup).
- **Incident response:** see [`docs/incident-response.md`](docs/incident-response.md)
  (severity, rollback, D1 recovery, comms).
- **Rate limiting:** see [`docs/rate-limiting.md`](docs/rate-limiting.md)
  (how it works, how to test it, Cloudflare console links).
- **BYOK probe reports:** see [`docs/byok-probe-reports-plan.md`](docs/byok-probe-reports-plan.md)
  (per-user probe reports + `model_availability`-driven chat and routing; epic
  **KAN-46**).

## CLI access

- **GitHub:** `gh`, authenticated as `gmtreacy` (SSH for git operations).
- **Cloudflare:** `wrangler`, installed globally; see [`docs/scaffold-runbook.md`](docs/scaffold-runbook.md).

> Never print, commit, or paste tokens, account identifiers, or credential paths into this file.
> Reference credentials by the location that holds them, never by value. **Everything in this file
> is published with the repository.**
