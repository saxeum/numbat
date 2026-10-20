# Contributing to numbat

Trunk-based development: short-lived branches, review via pull request, merge to
`main`, automatic deploy. See [`docs/workflow-plan.md`](docs/workflow-plan.md)
for the rationale and the hardening roadmap.

## Setup

```bash
npm ci            # install all workspaces (root lockfile)
npm run dev       # API Worker (:8787) + web SPA (:5173) together
```

Individual processes: `npm run dev:api`, `npm run dev:web`. Secrets live in each
app's `.dev.vars` (gitignored).

Database + feature verification is covered in
[`docs/manual-testing-todos.md`](docs/manual-testing-todos.md) (local → staging →
preview → prod). Apply local migrations once with
`cd apps/worker && npx wrangler d1 migrations apply numbat-db --local`.

## Day-to-day flow

1. **Branch off `main`** — short-lived, descriptive (`feat/...`, `fix/...`).
2. **Make the change** — keep it focused; one concern per PR.
3. **Run the checks locally** before pushing:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run test:e2e
   ```
4. **Open a PR** — fill in the template; link issues; screenshots for UI.
5. **Get a review** — at least one approval; address feedback; keep the branch
   up to date with `main`.
6. **Squash-merge** once CI is green; delete the branch.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/)-style prefixes
(`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`, `refactor:`). Keep the
subject imperative and under ~72 chars; put detail in the body.

## Checks

CI (`.github/workflows/ci.yml`) runs on every PR: typecheck → lint → tests →
build → Playwright E2E. The same `verify` job is intended to be a **required**
status check on `main` (see `docs/workflow-plan.md` W1). Do not merge with red CI.

## Repository layout

| Path | Purpose |
|------|---------|
| `apps/web` | Web Worker — Vite + React SPA (Tailwind, shadcn) |
| `apps/worker` | API Worker — Hono, mounted at `/api` |
| `packages/shared` | `@numbat/shared` — Zod contracts + types used by both |
| `tests/e2e` | Playwright end-to-end tests |
| `docs/` | Architecture, frontend, scaffold runbook, workflow plan |

## Boundaries

- **Auth is deferred** (architecture D10); `/api/*` is intentionally public.
- **Don't commit** secrets, `.dev.vars`, or per-app `package-lock.json` files —
  one root lockfile is the workspace source of truth.
- **Keep `compatibility_date` identical** across both `wrangler.jsonc` files.
