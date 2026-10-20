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
npm install -w apps/worker hono@^4.13 zod@^4.6 @hono/zod-openapi@^1.6
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
  "dependencies": { "zod": "^4.6.0" }
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

> **Zod:** standardize on **Zod 4** (`^4.6`). `@hono/zod-openapi@1.x` requires
> `zod: ^4.0.0`, and `@hookform/resolvers@6.x` accepts `^3.25.0 || ^4.0.0`, so
> Zod 4 is the current common denominator across `@numbat/shared`,
> `@hono/zod-openapi`, and `@hookform/resolvers`. (Zod 3 would now *conflict* with
> `@hono/zod-openapi@1.x`.) `@hono/zod-openapi@1.6` also needs `hono >=4.10.0`.

---

## 5. `apps/web` — Web Worker (Vite + React SPA)

### 5.1 Scaffold

**Option B — Vite directly, then wire Cloudflare by hand (used for numbat):**

```bash
npm create vite@latest apps/web -- --template react-ts
```

Then apply §5.3–§5.5 by hand. A pure static SPA needs no per-request Worker entry,
so `npx wrangler setup` is not required and its interactive prompts are avoided.
Clean up any per-app lockfile/node_modules as in §3.1 (in practice the workspace
root hoists the install, so there is usually nothing to delete).

**Option A — C3 React template (alternative):**

```bash
npm create cloudflare@latest apps/web -- \
  --framework react --platform workers --no-deploy --no-git --lang ts
```

C3 is interactive (framework/platform/variant prompts) and its template ships
extra files (assets Worker entry, `public/`) you must reconcile with
§5.3–§5.5.

### 5.2 Add the frontend stack

```bash
npm install -w apps/web react-router @tanstack/react-query react-hook-form \
  @hookform/resolvers@^5.9 zod@^4.6
npm install -w apps/web tailwindcss @tailwindcss/vite
npm install -w apps/web @numbat/shared
npx shadcn@latest init -t vite -b radix -p nova -y --no-monorepo
```

- **Tailwind v4:** add the `@tailwindcss/vite` plugin in `vite.config.ts` and
  `@import "tailwindcss";` in the main CSS file. No `tailwind.config.js` needed.
- **shadcn v4:** requires a path alias. In `apps/web/tsconfig.json` and
  `tsconfig.app.json` set `"paths": { "@/*": ["./src/*"] }` — **do not set
  `baseUrl`; TypeScript 7 removed it** (paths resolve relative to the tsconfig
  file). Mirror the alias in `vite.config.ts` under `resolve.alias` (`@` → `src`
  via `node:path` + `import.meta.dirname`, with `@types/node`). Run `init`
  non-interactively as shown; the **Nova** preset emits `style: "radix-nova"`,
  owns `src/components/ui/*` and `src/lib/utils.ts`, and pulls unified
  `radix-ui`, `cn`, `lucide-react`, `class-variance-authority`, `tw-animate-css`,
  `@fontsource-variable/geist`, and `shadcn/tailwind.css`.
- **`@hookform/resolvers` must be pinned to `^5.9`** — `6.0.0` declares
  `peerOptional effect@^4` while the transitive `@typeschema` chain pins
  `effect@3`, which npm rejects with `ERESOLVE` (see §12).
- **React Router (v8 at time of writing):** the package is `react-router`
  (library mode); use `createBrowserRouter` + `RouterProvider`.

### 5.3 `vite.config.ts` essentials

```ts
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
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
    "typecheck": "tsc -b"
  }
}
```

> **`typecheck` uses `tsc -b`, not `tsc --noEmit`.** The Vite template uses TS
> project references with a root config of `"files": []`, so `tsc --noEmit`
> checks *nothing*. `tsc -b` traverses the referenced configs and respects each
> one's `noEmit`.

---

## 6. Wire the domain (first deploy)

Deploy order does not matter (route specificity decides), but deploying the web
Worker creates the apex DNS record.

```bash
npm run deploy:api     # registers foonix.net/api/* -> numbat-api
npm run deploy:web     # builds SPA, registers foonix.net (custom domain)
```

> **Run Wrangler per app.** Because the repo root is an npm workspace, a bare
> `wrangler deploy` (or `--dry-run`) in the root fails with "the Cloudflare
> application detection logic has been run in the root of a workspace". Use the
> root scripts (`npm run deploy:api|web`), `cd` into the app, or pass
> `-c apps/<app>/wrangler.jsonc`.

> **`workers.dev` and preview URLs.** Declaring a `routes` entry disables the
> Worker's `*.workers.dev` hostname by default, so the only ingress is the zone
> route (untestable until the web Worker creates apex DNS). Set
> `"workers_dev": true` to keep a testable hostname; for this account the test
> URL is `https://numbat-api.<account-subdomain>.workers.dev` (account subdomain
> `<account-subdomain>`). Enabling `workers_dev` also enables per-version **Preview URLs**
> by default (Wrangler warns); preview deployments are deferred (architecture
> D11), so set `"preview_urls": false` explicitly.

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

> **Coexistence check — ✅ verified 2026-10-19.** A Workers **custom domain** at
> `foonix.net` (`numbat-web`) and a **path route** `foonix.net/api/*` to a
> *different* Worker (`numbat-api`) coexist on the same zone. Confirmed: apex DNS
> resolves; `/api/health` → JSON from `numbat-api`; `/` and `/some/client/route`
> → the SPA shell from `numbat-web`. The single-Worker / service-binding fallback
> (`architecture.md` D1 alternatives) is not needed.

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

### 8.1 Worker integration tests (Vitest + Workers plugin)

> **`@cloudflare/vitest-pool-workers` is deprecated** — it was renamed to
> **`@cloudflare/vitest-plugin`**, which is a plain Vite plugin (no `/config`
> subpath, no `defineWorkersConfig`). Use the new package.

```bash
npm install -w apps/worker -D @cloudflare/vitest-plugin@~1.4.5 vitest@~4.1.12
```

`apps/worker/vitest.config.ts`:

```ts
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
});
```

Also add the plugin's ambient `cloudflare:test` types to
`apps/worker/tsconfig.json`:

```jsonc
"types": ["./worker-configuration.d.ts", "node", "@cloudflare/vitest-plugin/types"]
```

Add a `"test": "vitest run"` script so root `npm test --workspaces` picks it up,
and a test using `SELF.fetch(...)` from `cloudflare:test` (e.g.
`apps/worker/test/health.test.ts`) to exercise the real Worker entry.

Tests run inside `workerd` with real bindings, so Hono routes and (later) D1 are
exercised for real.

> **Version caution:** `@cloudflare/vitest-plugin@1.4.5` declares peer
> `vitest: ^4.1.0 || ^5.0.0`. We pin `vitest@~4.1.12` (the LTS-style `V4` tag);
> Vitest 5 is allowed by the plugin if you want to move later.

### 8.2 End-to-end (Playwright)

```bash
npm install -D @playwright/test
npx playwright install chromium         # NOT --with-deps on Arch (apt-based)
```

> **Arch Linux:** `--with-deps` drives `apt-get` and fails. Playwright also warns
> the OS is unsupported and downloads the `ubuntu24.04-x64` fallback build; the
> headless shell runs if the required system libs are already present. If not,
> install them via `pacman`.

`playwright.config.ts` (repo root) starts both servers via a `webServer` array and
points tests at the Vite origin:

```ts
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:5173" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev -w apps/worker -- --port 8787",
      url: "http://localhost:8787/api/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev -w apps/web -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

Run with `npm run test:e2e` (root script → `playwright test`).

> **Deep-link fallback needs a catch-all route.** The server correctly returns the
> SPA shell (`200`) for unknown paths, but React Router renders its *default error
> boundary* unless the app declares a `path: "*"` route. Add a `NotFoundPage` +
> catch-all so the fallback test asserts real app content.

---

## 9. CI/CD (GitHub Actions)

`.github/workflows/ci.yml` (two jobs):

- **`verify`** (PR + push): checkout → `actions/setup-node@v4` (cache `npm`,
  `node-version: 24`) → `npm ci` → `npm run typecheck` → `npm test` →
  `npm run build` → `npx playwright install --with-deps chromium` →
  `npm run test:e2e`.
- **`deploy`** (push to `main` only, `needs: verify`): matrix over
  `[worker, web]` with `cloudflare/wrangler-action@v3`,
  `workingDirectory: apps/<app>`, `command: deploy`. The **web** leg runs
  `npm run build -w apps/web` first — `wrangler-action` calls `wrangler deploy`
  directly and does **not** run the npm `deploy` script (which would build).

> **npm install scripts in CI.** npm 11 blocks dependency install scripts
> (`esbuild` / `workerd` postinstall) unless approved, which breaks `npm ci` and
> the test run. `package.json` therefore carries an `allowScripts` map
> (`{ "esbuild": true, "workerd": true }`). Regenerate (unpinned) with
> `npm install-scripts approve --no-allow-scripts-pin esbuild workerd` whenever a
> dependency with a native postinstall is added.

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

Status as of the 2026-10-20 scaffold:

- [x] `npm run typecheck` clean across workspaces
- [x] Unit/integration tests pass (`npm test`) — Worker tests inside `workerd`; E2E via `npm run test:e2e`
- [x] `npm run build` produces `apps/web/dist`
- [x] `wrangler deploy --dry-run` succeeds in both apps
- [x] `dig +short foonix.net` resolves
- [x] `https://foonix.net/` serves the SPA
- [x] `https://foonix.net/<client-route>` serves the SPA (fallback works)
- [x] `https://foonix.net/api/health` returns the API response
- [x] `wrangler tail numbat-api` shows live requests — verified (`GET https://foonix.net/api/health`, `outcome: ok`)
- [x] CI workflow is green and deploys both Workers on `main` — run `39348133365`: `verify`, `deploy worker`, `deploy web` all succeeded

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
- **Zod** is standardized on v4 (`^4.6`) and **Vitest is pinned to `~4.1.12`**
  with the Workers test integration being **`@cloudflare/vitest-plugin`**
  (`@cloudflare/vitest-pool-workers` is deprecated) — see §8.1. These are the most
  likely sources of install friction (§4, §8.1) — resolve those first if `npm ci`
  complains.
- **TypeScript 7 removed `baseUrl`** — declare path aliases with `paths` alone
  (`"@/*": ["./src/*"]`), resolved relative to the tsconfig file, and mirror the
  alias in `vite.config.ts`. The runbook's older `baseUrl` guidance is superseded.
- **`@hookform/resolvers`:** pin `^5.9` (Zod 4-capable). `6.0.0` fails `npm ci`
  with an `effect` peer conflict (`effect@^4` vs the transitive `effect@3`).
- **Stack at scaffold time (2026-10):** Vite 9, React 19, TypeScript 7,
  `react-router` 8, shadcn v4 (Nova preset, unified `radix-ui`), Tailwind v4.
- **`routes` disables `workers.dev`** — add `"workers_dev": true` for a
  testable hostname and `"preview_urls": false` (preview deployments are
  deferred; §6).
- **Invoke Wrangler per app**, never at the workspace root (§6).
- **Auth stays deferred** (see `architecture.md` §10); `/api/*` is intentionally
  public until then.
- **`ungozenji`** remains deployed but unbound; delete it separately when ready.
