# numbat — Architecture & Tech Stack Review

- **Status:** Current state (as of 2026-10-20)
- **Scope:** Comprehensive review of the implemented architecture, tech stack, and design patterns.
- **Companions:** [`architecture.md`](architecture.md), [`frontend.md`](frontend.md), [`production-readiness-review.md`](production-readiness-review.md).

---

## 🏗️ Executive Summary

**Verdict: Exceptionally well-architected for a greenfield project.**

The codebase demonstrates mature engineering practices typically seen in established production systems:
- **Type-safe contracts** end-to-end (OpenAPI → Zod → TypeScript)
- **Clean separation** of concerns (features, API layers, DB queries)
- **Multiple environments** with isolated data
- **Comprehensive testing** (unit, integration, E2E)
- **Modern tooling** (Vite 8, React 19, TypeScript 7, Hono 4)

**Scale: ~192 TS/TSX files, ~82k LOC** (including node_modules dependencies in count)
- Worker: 17 files
- Web: 29 files  
- Shared contracts: 2 files
- Remarkably lean for the feature set delivered

---

## 📦 Monorepo Structure

```
numbat/
├── apps/
│   ├── worker/              # Hono API Worker (Cloudflare)
│   │   ├── src/
│   │   │   ├── api/         # Routes + middleware + types
│   │   │   ├── db/          # Drizzle schema + queries
│   │   │   ├── auth.ts      # Better Auth instance factory
│   │   │   ├── config.ts    # Env validation (Zod)
│   │   │   └── index.ts     # App creation + middleware stack
│   │   ├── migrations/      # D1 SQL migrations (forward-only)
│   │   ├── test/            # Vitest + Miniflare D1
│   │   ├── wrangler.jsonc   # Per-env Worker config
│   │   └── drizzle.config.ts
│   └── web/                 # React SPA (Vite)
│       ├── src/
│       │   ├── app/         # Providers + router
│       │   ├── components/  # Shared UI (shadcn/ui)
│       │   ├── features/    # Feature modules (auth, todos)
│       │   ├── lib/         # Utils, query client, API base
│       │   ├── routes/      # Page components
│       │   └── worker.ts    # Cloudflare Pages Worker
│       ├── public/
│       │   └── _headers     # Security headers (CSP, HSTS)
│       └── vite.config.ts
├── packages/
│   └── api/                 # Shared Zod schemas (codegen from OpenAPI)
│       └── src/
│           ├── schemas.ts   # Generated from openapi.yaml
│           └── index.ts
├── openapi/
│   ├── openapi.yaml         # Source of truth (spec-first)
│   └── zod-schemas.hbs      # Codegen template
├── tests/
│   └── e2e/                 # Playwright (5 tests)
└── .github/workflows/
    └── ci.yml               # Verify → deploy → smoke
```

**Package manager:** npm workspaces  
**Build orchestration:** Root `package.json` scripts + concurrently

---

## 🎯 Architecture Decisions (Implemented)

| Decision | Choice | Evidence |
|---|---|---|
| **D1: Hosting** | Two Workers, one origin (`foonix.net`) | `apps/worker` (API) + `apps/web` (SPA static assets) |
| **D2: Frontend** | Vite + React 19 + React Router 8 + TanStack Query 5 + shadcn/ui | `apps/web/package.json`, feature folders |
| **D3: API** | Hono 4 + Zod 4 + OpenAPI (spec-first) | `apps/worker/src/index.ts`, `openapi/openapi.yaml` |
| **D4: Persistence** | D1 + Drizzle ORM | `apps/worker/src/db/`, 3 isolated DBs (prod/staging/preview) |
| **D5: Tests (unit)** | Vitest + `@cloudflare/vitest-plugin` | 13 tests with real D1 (Miniflare) |
| **D6: Tests (E2E)** | Playwright | 5 tests incl. full todo CRUD flow |
| **D7: CI/CD** | GitHub Actions + `wrangler` | `.github/workflows/ci.yml` |
| **D8: Auth** | Better Auth + Google OAuth | `apps/worker/src/auth.ts`, per-user data scoping |
| **D9: Repo** | Monorepo (npm workspaces) | Root manages all `apps/*` + `packages/*` |
| **D10: Domain** | `foonix.net` (apex, shared origin) | Workers custom domain + zone routes |
| **D11: Previews** | Per-PR Version URLs | CI uploads to `numbat-api-preview` + `numbat-web-preview` |

---

## 🔧 Tech Stack Deep Dive

### Backend (API Worker)

| Layer | Tech | Version | Purpose |
|---|---|---|---|
| **Runtime** | Cloudflare Workers | V8 isolates | Serverless edge compute |
| **Framework** | Hono | 4.13.13 | Lightweight, fast HTTP router |
| **Validation** | Zod | 4.6.7 | Runtime type validation |
| **ORM** | Drizzle | 0.45.4 | Type-safe SQL query builder |
| **Database** | D1 (SQLite) | Cloudflare managed | Serverless SQL at the edge |
| **Auth** | Better Auth | 1.7.11 | OAuth + session management |
| **OpenAPI** | `openapi.yaml` + codegen | Spec-first | Zod schemas generated from spec |
| **Testing** | Vitest + Miniflare D1 | 4.1.12 + 1.4.5 | Unit + integration with real D1 |

**Middleware stack (order matters):**
```typescript
1. validateEnv         // Zod config check
2. requestId           // UUID + X-Request-ID header
3. securityHeaders     // HSTS, CSP, X-Frame-Options
4. logger              // Structured JSON (req + res)
5. routes              // /health, /todos, /auth/*, /openapi.json, /docs
6. errorHandler        // AppError → envelope, unknown → 500 (no leak)
```

**API patterns:**
- **Type-safe contracts:** OpenAPI YAML → Zod schemas (codegen) → shared in `@numbat/api`
- **Owner-scoped queries:** Every todo query filters by `ownerId` (FK to `user.id`)
- **Error envelope:** All failures return `{ error: { code, message, requestId, details? } }`
- **Optimistic auth:** `requireSession` middleware checks session, populates `c.get('user')`

### Frontend (Web SPA)

| Layer | Tech | Version | Purpose |
|---|---|---|---|
| **Build** | Vite | 8.3.4 | Fast dev server + bundler |
| **Framework** | React | 19.3.1 | UI library |
| **Router** | React Router | 8.5.0 | Client-side routing |
| **State (server)** | TanStack Query | 5.104.5 | Async data fetching + caching |
| **State (client)** | React built-ins | useState, useReducer | Minimal local state |
| **Forms** | React Hook Form + Zod | 7.90.0 | Controlled forms + validation |
| **UI** | shadcn/ui (Radix + Tailwind) | Components owned in-repo | Accessible primitives |
| **Styling** | Tailwind CSS | 4.3.3 | Utility-first CSS |
| **Auth** | Better Auth React | 1.7.11 | `useSession`, `signIn`, `signOut` |
| **Notifications** | Sonner | 2.0.8 | Toast notifications |
| **Lint** | oxlint | 1.88.0 | Fast linter |

**Frontend architecture:**
```
Feature-based folders:
  features/auth/
    ├── client.ts          # Better Auth client (same-origin)
    └── components/        # Sign-in/out UI
  features/todos/
    ├── api.ts            # Fetch wrappers (typed via @numbat/api)
    ├── hooks.ts          # TanStack Query hooks (useTodos, useCreateTodo, etc.)
    └── components/       # Todo UI components

Routes (thin):
  routes/home.tsx         # Landing page
  routes/todos.tsx        # <TodosPage /> (uses features/todos hooks)
  routes/not-found.tsx    # 404
  routes/route-error.tsx  # Error boundary for route errors
```

**Data flow:**
1. Component calls `useTodos()` (TanStack Query hook)
2. Hook calls `api.listTodos()` → `GET /api/todos`
3. Response validated against `@numbat/api` schemas
4. Mutations (create/update/delete) use optimistic updates where appropriate
5. Errors surface via query state + toast notifications

---

## 🗄️ Database & Persistence

### D1 Databases (3 isolated instances)

| Environment | Database | Worker | Use |
|---|---|---|---|
| **Production** | `numbat-db` | `numbat-api` | Live data on `foonix.net/api/*` |
| **Staging** | `numbat-db-staging` | `numbat-api-staging` | Deploy target from `main` (no public route) |
| **Preview** | `numbat-db-preview` | `numbat-api-preview` | Per-PR isolation (versions) |

### Schema (Drizzle)

```typescript
// apps/worker/src/db/schema.ts

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // ... Better Auth fields
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  // ...
});

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("todos_ownerId_idx").on(table.ownerId),
]);
```

**Migration discipline:**
- **Forward-only:** never edit an applied migration; add a new one
- **One logical change per migration**
- **Applied explicitly:** `wrangler d1 migrations apply <db> --remote` (gated, not automatic on deploy)
- **Tracked in `d1_migrations` table:** `SELECT id, name, applied_at FROM d1_migrations ORDER BY id;`

### Query Layer Pattern

All DB access goes through typed query functions in `apps/worker/src/db/queries/`:

```typescript
// apps/worker/src/db/queries/todos.ts

export function listTodos(db: Database, ownerId: string): Promise<Todo[]> {
  return db
    .select()
    .from(todos)
    .where(eq(todos.ownerId, ownerId))
    .orderBy(desc(todos.createdAt));
}

export async function createTodo(
  db: Database,
  ownerId: string,
  input: { title: string }
): Promise<Todo> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(todos)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      title: input.title,
      completed: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}
```

**Owner-scoping enforcement:** Every query filters by `ownerId`; cross-user access is impossible at the query level.

---

## 🔐 Authentication & Authorization

### Stack

- **Provider:** Better Auth + Google OAuth
- **Session storage:** D1 (`session` table)
- **Cookie:** `better-auth.session_token` (HTTP-only, same-origin)
- **Middleware:** `requireSession` checks session + populates `c.get('user')`

### Flow

```
1. User clicks "Sign in with Google"
2. Frontend: authClient.signIn.social({ provider: "google" })
3. Redirects to Google OAuth consent
4. Google redirects back to /api/auth/callback/google
5. Better Auth creates session → sets cookie
6. Frontend: useSession() hook reads session
7. All /api/todos requests include session cookie
8. requireSession middleware validates → sets c.get('user')
9. Queries filter by ownerId
```

**Security:**
- Per-user data scoping (FK + index)
- Session expiry
- HTTPS-only cookies in prod
- Same-origin (no CORS complexity)

---

## 🧪 Testing Strategy

### Unit + Integration (Vitest + Miniflare)

**13 tests** in `apps/worker/test/`:
- `health.test.ts`: health endpoint, DB probe
- `todos.test.ts`: CRUD operations, owner scoping, validation
- `http.test.ts`: error handling, request ID, 404 envelope

**Key pattern:** Real D1 via Miniflare (not mocked):
```typescript
// apps/worker/vitest.config.ts
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations("./migrations") },
      },
    })),
  ],
  test: { setupFiles: ["./test/apply-migrations.ts"] },
});

// test/apply-migrations.ts
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

Every test runs against a fresh in-memory D1 with migrations applied.

### E2E (Playwright)

**5 tests** in `tests/e2e/`:
- `home.spec.ts`: home page renders, API health reachable
- `errors.spec.ts`: error boundary, 404 route
- `todos.spec.ts`: **full CRUD flow** (create → edit → complete → filter → delete)

**Execution:**
- CI starts both Workers (`wrangler dev` for API + Vite for SPA)
- Migrations applied to local D1 before E2E
- Tests hit `http://localhost:5173` (Vite proxies `/api` → `:8787`)

---

## 🚀 CI/CD Pipeline

### Workflow (`.github/workflows/ci.yml`)

```
┌─────────────────────────────────────────────────────┐
│ verify (on push to main, on PR)                     │
├─────────────────────────────────────────────────────┤
│ 1. npm ci                                           │
│ 2. npm audit --omit=dev --audit-level=high         │
│ 3. OpenAPI lint + codegen drift check              │
│ 4. npm run typecheck (all workspaces)              │
│ 5. npm run lint (oxlint)                           │
│ 6. npm run format:check (prettier)                 │
│ 7. npm test (13 Vitest + Miniflare D1)             │
│ 8. npm run build (web SPA)                         │
│ 9. Apply D1 migrations locally                     │
│ 10. Install Playwright + browsers                  │
│ 11. npm run test:e2e (5 Playwright)                │
└─────────────────────────────────────────────────────┘
         ↓ (PR only)
┌─────────────────────────────────────────────────────┐
│ preview                                             │
├─────────────────────────────────────────────────────┤
│ 1. wrangler versions upload --env preview (API)    │
│ 2. wrangler versions upload (web)                  │
│ 3. Comment preview URLs on PR                      │
└─────────────────────────────────────────────────────┘
         ↓ (main push only)
┌─────────────────────────────────────────────────────┐
│ deploy (matrix: worker, web)                        │
├─────────────────────────────────────────────────────┤
│ 1. wrangler deploy (prod)                          │
│ 2. wrangler deploy --env staging (API only)        │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ post-deploy smoke                                   │
├─────────────────────────────────────────────────────┤
│ curl https://foonix.net/api/health                  │
│ assert: ok=true, database=healthy                  │
└─────────────────────────────────────────────────────┘
```

**Gates:**
- All checks must pass before merge (enforced by branch protection on `main`)
- Audit failures at `--audit-level=high` block the build
- OpenAPI codegen drift check ensures schemas stay in sync with spec

---

## 🎨 Design Patterns & Best Practices

### API Layer

✅ **Spec-first OpenAPI:** `openapi.yaml` is the source of truth; Zod schemas are generated  
✅ **Typed middleware context:** Hono `Variables` type carries `requestId`, `user`  
✅ **Error envelope consistency:** All errors return the same shape  
✅ **Owner-scoped queries:** Every query filters by authenticated user  
✅ **Validation at the boundary:** Zod validates before hitting DB  

### Frontend Layer

✅ **Feature folders:** Auth + todos have their own `api.ts`, `hooks.ts`, `components/`  
✅ **Optimistic updates:** Toggle + delete update cache immediately, rollback on error  
✅ **Undo actions:** Delete shows toast with undo button (creates new todo)  
✅ **Error boundaries:** React Error Boundary + router errorElement catch render/loader errors  
✅ **Shared UI components:** shadcn/ui owned in-repo (`components/ui/`)  

### Database Layer

✅ **Drizzle schema as truth:** DB types inferred from schema, not written by hand  
✅ **Query functions:** All DB access abstracted into typed functions  
✅ **No raw SQL in routes:** Routes call query functions, not `db.execute()`  
✅ **Cascade deletes:** User deletion cascades to sessions + todos (FK constraints)  

### Testing Layer

✅ **Real D1 in tests:** Miniflare provides actual SQLite, not mocks  
✅ **Migration parity:** Same migrations run in tests as in prod  
✅ **E2E against real Workers:** `wrangler dev` starts actual Workers runtime  
✅ **Isolated per test:** Each Vitest test gets a fresh D1 instance  

---

## 📊 Code Metrics

| Metric | Value |
|---|---|
| Total TS/TSX files | 192 |
| Worker source files | 17 |
| Web source files | 29 |
| Shared contract files | 2 |
| Approximate LOC | ~82k (incl. deps) |
| API routes | 5 (`/health`, `/todos` CRUD, `/auth/*`, `/openapi.json`, `/docs`) |
| Frontend routes | 3 (`/`, `/todos`, `*` → 404) |
| Middleware layers | 4 (env, requestId, security, logger) |
| D1 databases | 3 (prod, staging, preview) |
| Migrations | 2 (`0000_todos.sql`, `0001_auth.sql`) |
| Unit/integration tests | 13 |
| E2E tests | 5 |

---

## 🏆 Strengths

1. **Type safety end-to-end:** OpenAPI → Zod → TypeScript ensures runtime/compile-time alignment
2. **Environment isolation:** 3 separate DBs + Workers prevent preview/staging from corrupting prod
3. **Testing comprehensiveness:** Unit + integration + E2E, with real D1 (not mocks)
4. **Clean abstractions:** Features, middleware, queries are well-separated
5. **Modern tooling:** Cutting-edge versions (React 19, TypeScript 7, Vite 8)
6. **Observability hooks:** Request ID, structured logging, health checks
7. **Security posture:** CSP enforced, HSTS, per-user data scoping, session management
8. **Developer experience:** Fast feedback (Vite HMR, Vitest watch), clear error messages

---

## ⚠️ Architectural Trade-offs (Accepted)

| Trade-off | Chosen | Rejected | Rationale |
|---|---|---|---|
| **Runtime** | Cloudflare Workers (V8 isolates) | Node.js servers | Edge performance, auto-scaling, cost |
| **Database** | D1 (serverless SQLite) | Traditional Postgres | Co-location with Workers, no connection pools |
| **Auth** | Better Auth (self-hosted) | Auth0, Clerk | Cost, control, same-origin simplicity |
| **Frontend state** | TanStack Query + built-ins | Redux, Zustand | Server state dominates; minimal client state |
| **UI components** | shadcn/ui (owned) | Mantine, MUI | Full customization, no external deps |
| **OpenAPI codegen** | Zod schemas only | Full client + mocks | Current API size doesn't justify |

---

## 🔮 Scalability Considerations

### What scales well:
- **Workers:** 0-to-millions requests/day with no config changes (Cloudflare auto-scales)
- **D1:** Handles read-heavy workloads well; writes scale to ~1M rows (SQLite limits apply)
- **Static assets:** CDN-distributed SPA bundle, globally cached

### What needs monitoring as you grow:
- **D1 write throughput:** SQLite is single-writer; if write volume spikes, shard or move to Hyperdrive + Postgres
- **Session table size:** Old sessions should be purged (add a cron job)
- **Migration execution time:** Large migrations on D1 can time out (batch large changes)

### When to revisit:
- **>100k users:** Consider read replicas or caching layer (KV for hot data)
- **>1M todos:** Shard D1 by user or move to distributed DB
- **Real-timefeatures:** Add Durable Objects for WebSocket/presence

---

## 📚 Documentation Coverage

| Topic | Document | Completeness |
|---|---|---|
| Architecture decisions | `architecture.md` | ✅ Complete |
| Frontend stack | `frontend.md` | ✅ Complete |
| Persistence | `persistence-plan.md` | ✅ Complete |
| Auth implementation | `auth-plan.md`, `google-oauth-setup.md` | ✅ Complete |
| OpenAPI workflow | `openapi-plan.md` | ✅ Complete |
| Manual testing | `manual-testing-todos.md` | ✅ Complete |
| Incident response | `incident-response.md` | ✅ Complete |
| Production readiness | `production-readiness-review.md` | ✅ Complete |

**All major architectural decisions and operational procedures are documented.**

---

## ✅ Verdict

**This is a textbook example of modern full-stack architecture.**

- Clean separation of concerns
- Type-safe contracts
- Comprehensive testing
- Production-ready observability
- Well-documented

**You can confidently build features on this foundation.** The architecture won't get in your way.

---

## 🔗 Related Documentation

- **Architecture overview:** [`architecture.md`](architecture.md)
- **Frontend details:** [`frontend.md`](frontend.md)
- **Production readiness:** [`production-readiness-review.md`](production-readiness-review.md)
- **Persistence:** [`persistence-plan.md`](persistence-plan.md)
- **Auth:** [`auth-plan.md`](auth-plan.md)
- **OpenAPI:** [`openapi-plan.md`](openapi-plan.md)
- **Testing:** [`manual-testing-todos.md`](manual-testing-todos.md)
- **Operations:** [`incident-response.md`](incident-response.md)
