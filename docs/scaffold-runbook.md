# numbat — Scaffold Runbook

- **Status:** Ready to execute
- **Date:** 2026-10-19
- **Audience:** the human running the bootstrap by hand
- **Companion docs:** [`architecture.md`](architecture.md), [`frontend.md`](frontend.md)

> This runbook is written for manual execution. The agent will **not** run it
> unless explicitly asked.

---

## 0. Preflight

Confirm the tools and identity before touching anything:

```bash
node --version            # expect v24.x
npm --version             # expect 11.x
wrangler --version        # expect 4.x
gh auth status            # expect gmtreacy logged in
wrangler whoami           # expect account <redacted-email>
```

Reference values used throughout:

| Thing | Value |
|---|---|
| GitHub repo | `saxeum/numbat` |
| Cloudflare account ID | `<cloudflare-account-id>` |
| Cloudflare zone | `foonix.net` (`<cloudflare-zone-id>`) |
| Web Worker name | `numbat-web` |
| API Worker name | `numbat-api` |
| Local API port | `8787` (wrangler default) |
| Local web port | `5173` (Vite default) |

Decisions already made: monorepo, two Workers, `foonix.net` public origin,
TypeScript, Hono API, Vite + React SPA, Tailwind + shadcn/ui, auth **deferred**.

---

## 1. Target layout

```
numbat/
├── package.json                 # workspace root + scripts
├── tsconfig.base.json
├── apps/
│   ├── web/                     # Web Worker: Vite + React SPA
│   │   ├── wrangler.jsonc       #   route: foonix.net (custom domain) + SPA assets
│   │   └── src/ ...
│   └── worker/                  # API Worker: Hono
│       ├── wrangler.jsonc       #   route: foonix.net/api/*
│       └── src/ ...
├── packages/
│   └── shared/                  # Zod contracts + types (consumed by both)
├── tests/
│   └── e2e/                     # Playwright
├── .github/workflows/ci.yml
├── .dev.vars                    # (gitignored, per app)
└── docs/
```

---

## 2. Workspace root

Create `package.json` at the repo root:

```json
{
  "name": "numbat",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "concurrently -n api,web -c blue,green \"npm:dev:api\" \"npm:dev:web\"",
    "dev:api": "npm run dev -w apps/worker",
    "dev:web": "npm run dev -w apps/web",
    "build": "npm run build -w apps/web",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm test --workspaces --if-present",
    "test:e2e": "playwright test",
    "deploy:api": "npm run deploy -w apps/worker",
    "deploy:web": "npm run deploy -w apps/web"
  },
  "devDependencies": {
    "concurrently": "^9"
  }
}
```

`tsconfig.base.json` (per-app configs extend this):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "isolatedModules": true
  }
}
```

`.gitignore` already covers `node_modules/`, `dist/`, `.wrangler/`, `.dev.vars`,
`.env*`. No change needed unless you add new build outputs.

---

## 3. `apps/worker` — API Worker (Hono)

### 3.1 Scaffold

**Option A — C3 Hono template (recommended):**

```bash
npm create cloudflare@latest apps/worker -- \
  --framework hono --no-deploy --no-git
```

**Option B — manual:** create `apps/worker`, add `wrangler.jsonc`, `package.json`,
`src/index.ts`, and install `hono`.

If C3 ran `npm install`, delete any `apps/worker/package-lock.json` and
`apps/worker/node_modules` afterwards so the root workspace owns installs.

### 3.2 Dependencies

```bash
npm install -w apps/worker hono @hono/zod-openapi zod
npm install -w apps/worker -D wrangler typescript @cloudflare/workers-types
```

### 3.3 `apps/worker/wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "numbat-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-19",
  "observability": { "enabled": true },
  "routes": [
    { "pattern": "foonix.net/api/*", "zone_name": "foonix.net" }
  ]
}
```

### 3.4 Suggested `src/` shape

```
apps/worker/src/
├── index.ts            # Hono app; mounts routes at /api; exports default app
├── api/
│   ├── routes/         # one file per resource
│   ├── middleware/     # requestId, logger, error handling
│   └── openapi.ts      # @hono/zod-openapi document
└── db/                 # (later) Drizzle schema, queries, migrations
```

Health endpoint for smoke tests: `GET /api/health` → `{ "ok": true }`.

### 3.5 Scripts (`apps/worker/package.json`)

```jsonc
{
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "types": "wrangler types",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## 4. `packages/shared` — contracts

`packages/shared/package.json`:

```json
{
  "name": "@numbat/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^3.24.0" }
}
```

- Put Zod schemas + inferred types in `src/` and re-export from `src/index.ts`.
- Consumers import `@numbat/shared`; both Vite and Wrangler bundle TypeScript, so
  **no build step is required** for this package.
- Add workspace deps:
  ```bash
  npm install -w apps/worker @numbat/shared
  npm install -w apps/web    @numbat/shared
  ```

> **Zod caution:** pin a single Zod major used by `@numbat/shared`,
> `@hono/zod-openapi`, and `@hookform/resolvers`. Check each library's peer range
> before upgrading; Zod v3 is the safest common denominator today.

---

## 5. `apps/web` — Web Worker (Vite + React SPA)

### 5.1 Scaffold

**Option A — C3 React template (recommended):**

```bash
npm create cloudflare@latest apps/web -- \
  --framework react --platform workers --no-deploy --no-git --lang ts
```

**Option B — Vite directly, then Cloudflare-ify:**

```bash
npm create vite@latest apps/web -- --template react-ts
cd apps/web && npx wrangler setup
```

Clean up any per-app lockfile/node_modules as in §3.1.

### 5.2 Add the frontend stack

```bash
npm install -w apps/web react-router @tanstack/react-query react-hook-form @hookform/resolvers zod
npm install -w apps/web tailwindcss @tailwindcss/vite
npx shadcn@latest init -c apps/web
```

- **Tailwind v4:** add the `@tailwindcss/vite` plugin in `vite.config.ts` and
  `@import "tailwindcss";` in the main CSS file. No `tailwind.config.js` needed.
- **shadcn:** requires a path alias. In `apps/web/tsconfig.json` (and
  `tsconfig.app.json`) set `"baseUrl": "."` and `"paths": { "@/*": ["./src/*"] }`,
  and mirror it in `vite.config.ts` under `resolve.alias`
  (`@` → `/src`, using `node:path` and `@types/node`).
- **React Router v7:** the package is `react-router` (library mode); use
  `createBrowserRouter` + `RouterProvider`.

### 5.3 `vite.config.ts` essentials

```ts
// illustrative
server: { proxy: { "/api": "http://localhost:8787" } }
// plugins: [react(), tailwindcss()]
// resolve.alias: { "@": "/src" }
```

The dev proxy is what hides the two-Worker split locally: Vite serves the SPA,
and `/api/*` is forwarded to the API Worker.

### 5.4 `apps/web/wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "numbat-web",
  "compatibility_date": "2026-10-19",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  },
  "routes": [
    { "pattern": "foonix.net", "custom_domain": true }
  ]
}
```

- `not_found_handling: "single-page-application"` makes client-side deep links fall
  through to `index.html`.
- If the C3 template generated a Worker entry (`main`) you don't need, remove it —
  a pure static SPA needs only `assets`. Keep it only if you want per-request logic
  in the web Worker.
- The **custom domain** supplies the apex DNS record + certificate; the API Worker
  is attached with the more specific `/api/*` **route**.

### 5.5 Scripts (`apps/web/package.json`)

```jsonc
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "deploy": "npm run build && wrangler deploy",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## 6. Wire the domain (first deploy)

Deploy order does not matter (route specificity decides), but deploying the web
Worker creates the apex DNS record.

```bash
npm run deploy:api     # registers foonix.net/api/* -> numbat-api
npm run deploy:web     # builds SPA, registers foonix.net (custom domain)
```

Verify:

```bash
wrangler deployments list --name numbat-api
wrangler deployments list --name numbat-web
dig +short foonix.net
curl -s https://foonix.net/api/health
curl -sI https://foonix.net/
```

Expected: apex resolves; `/api/health` returns JSON from the API Worker; `/`
returns the SPA; a deep link like `/some/client/route` also returns the SPA shell.

> **Coexistence check (do this once):** confirm a Workers **custom domain** at
> `foonix.net` and a **path route** `foonix.net/api/*` to a *different* Worker can
> coexist. If the platform rejects it, fall back to a single Worker or a
> service-binding proxy (see `architecture.md` D1 alternatives).

Staging/preview: keep the default `*.workers.dev` hostnames available for
non-production environments so `foonix.net` stays production-only.

---

## 7. Local development

Two processes (or use the root `npm run dev` with `concurrently`):

```bash
# terminal 1 — API Worker on :8787
npm run dev:api

# terminal 2 — Vite SPA on :5173, /api proxied to :8787
npm run dev:web
```

Open http://localhost:5173. Secrets go in each app's `.dev.vars` (gitignored).

---

## 8. Testing

### 8.1 Worker integration tests (Vitest + Workers pool)

```bash
npm install -w apps/worker -D vitest @cloudflare/vitest-pool-workers
```

`apps/worker/vitest.config.ts`:

```ts
// illustrative
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: { wrangler: { configPath: "./wrangler.jsonc" } }
    }
  }
});
```

Tests run inside `workerd` with real bindings, so Hono routes and (later) D1 are
exercised for real.

> **Version caution:** `@cloudflare/vitest-pool-workers` pins a compatible Vitest
> range. Install Vitest at a version that satisfies it, not necessarily the very
> latest.

### 8.2 End-to-end (Playwright)

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

`playwright.config.ts` (repo root) with a `webServer` array that starts both the
API Worker and the web preview, then run tests in `tests/e2e/`.

---

## 9. CI/CD (GitHub Actions)

`.github/workflows/ci.yml` outline:

- **On PR / push:** checkout → `setup-node` (cache npm) → `npm ci` →
  `npm run typecheck` → `npm test` → `npm run build`.
- **On push to `main`:** after tests, deploy both Workers with
  `cloudflare/wrangler-action@v3` using a **matrix** over `worker` and `web`,
  setting `workingDirectory: apps/<app>` and `command: deploy`.

Required repo secrets:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | A scoped API token (see below) |
| `CLOUDFLARE_ACCOUNT_ID` | `<cloudflare-account-id>` |

**Create the CI token** (Cloudflare dashboard → My Profile → API Tokens → Create
Token) with:
- Account → **Workers Scripts: Edit**
- Zone (`foonix.net`) → **Workers Routes: Edit**
- Zone (`foonix.net`) → **Zone: Read**
- (add D1/KV/R2 perms later, when those bindings exist)

> The CI token is **separate** from the interactive `wrangler` OAuth session. Never
> reuse the local OAuth credentials in CI, and never commit them.

**Alternative:** **Workers Builds** can connect the repo and deploy on push
without a custom workflow — adopt it only if it covers the test gates you want.

---

## 10. Verification checklist

- [ ] `npm run typecheck` clean across workspaces
- [ ] Unit/integration tests pass (`npm test`)
- [ ] `npm run build` produces `apps/web/dist`
- [ ] `wrangler deploy --dry-run` succeeds in both apps
- [ ] `dig +short foonix.net` resolves
- [ ] `https://foonix.net/` serves the SPA
- [ ] `https://foonix.net/<client-route>` serves the SPA (fallback works)
- [ ] `https://foonix.net/api/health` returns the API response
- [ ] `wrangler tail numbat-api` shows live requests
- [ ] CI workflow is green and deploys both Workers on `main`

---

## 11. Rollback & teardown

- **Rollback a Worker:** `wrangler rollback --name numbat-web` (and `numbat-api`).
- **List deployments:** `wrangler deployments list --name <worker>`.
- **Remove routes / custom domain:** detach via the dashboard (or the Workers
  domains API). Deleting the `foonix.net` custom domain also removes its DNS
  record, as happened when detaching `ungozenji`.
- **Remove a Worker:** `wrangler delete --name <worker>` (leaves routes/domain
  cleanup to you).

---

## 12. Notes & cautions

- **Do not commit** per-app `package-lock.json` files created by C3; one lockfile
  at the root is the workspace source of truth.
- **Keep `compatibility_date` identical** in both `wrangler.jsonc` files and bump
  them together.
- **Zod major** and **Vitest pool** versions are the two most likely sources of
  install friction (§4, §8.1) — resolve those first if `npm ci` complains.
- **Auth stays deferred** (see `architecture.md` §10); `/api/*` is intentionally
  public until then.
- **`ungozenji`** remains deployed but unbound; delete it separately when ready.
