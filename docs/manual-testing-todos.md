# Manual testing: database & todo feature

A hands-on guide to exercising the D1 + Drizzle persistence and the todo CRUD
feature across every environment, from local dev to production.

- **Feature:** anonymous todo CRUD (`GET/POST/PATCH/DELETE /api/todos`) + `/todos` SPA.
- **Companions:** [`persistence-plan.md`](persistence-plan.md),
  [`architecture.md`](architecture.md), [`scaffold-runbook.md`](scaffold-runbook.md).

> Run `wrangler` commands **from `apps/worker`** (or pass
> `-c apps/worker/wrangler.jsonc`). Running them at the repo root fails because
> the root is an npm workspace.

---

## 0. Environment map

| Env | SPA | API | Database |
|-----|-----|-----|----------|
| **Local** | `http://localhost:5173` | `http://localhost:8787` | local Miniflare D1 (`.wrangler/state`) |
| **Preview (PR)** | `https://pr-<n>-numbat-web-preview…` | `https://pr-<n>-numbat-api-preview…` | `numbat-db-preview` |
| **Staging** | *(API only)* | `https://numbat-api-staging…` | `numbat-db-staging` |
| **Production** | `https://foonix.net/todos` | `https://foonix.net/api` | `numbat-db` |

Database IDs:

| DB | Env | ID |
|----|-----|----|
| `numbat-db` | prod | `7aa958b9-c747-417f-9273-a50221c21f16` |
| `numbat-db-staging` | staging | `e3f36ab5-1ea6-4ea0-89f1-de52d3897323` |
| `numbat-db-preview` | preview | `ccbb09e4-ea7c-47c7-aaa3-b068215afe69` |

The web preview Worker proxies `/api/*` to the API preview via a service binding
(KAN-14), so the **full SPA works on preview URLs** — `/todos` reads/writes the
isolated `numbat-db-preview`.

---

## 1. Local development

### 1.1 Start everything

```bash
npm ci

# apply migrations to the local D1 (once, and after any schema change)
cd apps/worker
npx wrangler d1 migrations apply numbat-db --local
cd ../..

npm run dev            # API Worker :8787 + Vite :5173
```

Open **http://localhost:5173/todos** and try add / toggle / delete.

### 1.2 Exercise the API with curl

```bash
BASE=http://localhost:8787

curl -s $BASE/api/health | jq
curl -s $BASE/api/todos | jq                       # []
curl -s -X POST $BASE/api/todos \
  -H 'content-type: application/json' \
  -d '{"title":"buy milk"}' | jq
curl -s $BASE/api/todos | jq
```

Through the Vite proxy (same origin the SPA uses): `curl -s http://localhost:5173/api/todos`.

### 1.3 Inspect the local database

```bash
cd apps/worker
npx wrangler d1 execute numbat-db --local --command "SELECT * FROM todos ORDER BY created_at DESC"
npx wrangler d1 migrations list numbat-db --local
```

---

## 2. Staging (API only)

Staging runs the **API + `numbat-db-staging`** only (no separate SPA is deployed).

```bash
BASE=https://numbat-api-staging.<account-subdomain>.workers.dev

curl -s $BASE/api/health | jq          # database: "healthy"
curl -s $BASE/api/todos | jq
curl -s -X POST $BASE/api/todos \
  -H 'content-type: application/json' \
  -d '{"title":"staging smoke"}' | jq
```

Inspect / migrate staging:

```bash
cd apps/worker
npx wrangler d1 migrations list DB --remote --env staging
npx wrangler d1 execute DB --remote --env staging --command "SELECT count(*) AS n FROM todos"
# after a schema change:
npx wrangler d1 migrations apply DB --remote --env staging
```

---

## 3. PR preview

Open a PR; the `preview` CI job comments URLs on the PR, e.g.:

- Web (SPA): `https://pr-<n>-numbat-web-preview.<account-subdomain>.workers.dev`
- **API:** `https://pr-<n>-numbat-api-preview.<account-subdomain>.workers.dev`

The API preview runs the `preview` environment → `numbat-db-preview` (isolated;
never production).

```bash
BASE=https://pr-<n>-numbat-api-preview.<account-subdomain>.workers.dev
curl -s $BASE/api/health | jq
curl -s -X POST $BASE/api/todos -H 'content-type: application/json' -d '{"title":"preview"}' | jq
```

If a change adds a migration, apply it to the preview DB (CI does **not** do this
automatically yet):

```bash
cd apps/worker
npx wrangler d1 migrations apply DB --remote --env preview
npx wrangler d1 execute DB --remote --env preview --command "SELECT * FROM todos"
```

---

## 4. Production

```bash
curl -s https://foonix.net/api/health | jq     # database: "healthy"
curl -s https://foonix.net/api/todos | jq
```

Browser: **https://foonix.net/todos**

Inspect production (read-only queries recommended):

```bash
cd apps/worker
npx wrangler d1 execute numbat-db --remote --command "SELECT count(*) AS n FROM todos"
```

---

## 5. Changing the schema

Follow `persistence-plan.md` §7 and `workflow-plan.md` W7 (forward-only).

```bash
cd apps/worker
# 1. edit src/db/schema.ts
# 2. generate the migration
npx drizzle-kit generate --name <short_name>
# 3. apply locally and test
npx wrangler d1 migrations apply numbat-db --local
cd ../.. && npm test && npm run test:e2e
# 4. open a PR; apply to preview for manual UI checks
# 5. after merge, apply to staging then production (gated, explicit)
cd apps/worker
npx wrangler d1 migrations apply DB --remote --env staging
npx wrangler d1 migrations apply numbat-db --remote
```

> Production migrations are an **explicit, reviewed step** — they are not run by
> CI automatically (see `persistence-plan.md` §7/§10).

---

## 6. D1 quick reference

| Task | Command (from `apps/worker`) |
|------|------------------------------|
| Apply migrations (local) | `npx wrangler d1 migrations apply numbat-db --local` |
| Apply migrations (staging) | `npx wrangler d1 migrations apply DB --remote --env staging` |
| Apply migrations (preview) | `npx wrangler d1 migrations apply DB --remote --env preview` |
| Apply migrations (prod) | `npx wrangler d1 migrations apply numbat-db --remote` |
| List migrations | `npx wrangler d1 migrations list <db> [--local\|--remote]` |
| Query a DB | `npx wrangler d1 execute <db> [--local\|--remote] --command "SELECT …"` |
| List databases | `npx wrangler d1 list` |

---

## 7. Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `/api/health` shows `database: "unhealthy"` (503) | D1 binding missing or DB unreachable; check `wrangler types`, the binding id, and `d1 migrations list`. |
| `/api/todos` returns 500 | `todos` table missing → apply the migration for that environment. |
| `Couldn't find a D1 DB with the name or binding …` | You're on the default env; use `--env staging`/`--env preview` (or the DB name). |
| `… run in the root of a workspace …` | Run wrangler from `apps/worker` (or pass `-c apps/worker/wrangler.jsonc`). |
| Web preview `/todos` empty / errors | The preview web Worker proxies `/api/*` to `numbat-api-preview`; check that worker exists and the `API` service binding is set (`wrangler deploy --env preview`). |
| Error response body | All failures use the envelope: `{ "error": { code, message, requestId, details? } }`; quote the `requestId` when debugging (`wrangler tail numbat-api`). |
