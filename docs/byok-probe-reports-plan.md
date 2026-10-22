# numbat — BYOK probe reports + availability-driven chat

- **Status:** In progress — phases 1–6 implemented (KAN-47…52); phase 7
  (rate-limit/retention/observability) remains
- **Date:** 2026-10-22
- **Ticket:** Jira **KAN** (epic + subtasks; see §11)
- **Source:** `soper/manual-curl` — `src/domain/*`, `src/probe/*`,
  `src/providers/*` (provider-agnostic probe engine + report)
- **Companions:** [`architecture.md`](architecture.md),
  [`free-model-discovery-cron.md`](free-model-discovery-cron.md) (KAN-44),
  [`free-llm-provider-report.md`](free-llm-provider-report.md),
  [`persistence-plan.md`](persistence-plan.md),
  [`openapi-plan.md`](openapi-plan.md)

---

## 0. Goal

Each signed-in user runs a **report** against their own encrypted provider
credentials (probe every model the provider lists with that key), views the full
report, and the **chat playground lists only models a recent report flagged
available**.

**Guiding principle:** keep numbat's multi-tenant plumbing (Better Auth sessions,
`provider_credentials` envelope encryption, owner scoping, OpenAPI codegen). Port
only manual-curl's *provider-agnostic engine*. Do **not** port manual-curl's
single-key AES-GCM, its `runs` schema, or its auth/security middleware.

---

## 1. Evidence from the two repos

| Concern | numbat (target) | manual-curl (source) |
|---|---|---|
| Providers | `gateway/providers.ts`: gemini, groq, nvidia, openrouter | `providers/configs.ts`: those 4 + openai, cloudflare, llm7, ollama |
| Probe | `catalog/probe.ts` → `ProbeStatus` (usable/billing/…) | `probe/engine.ts` + `providers/openai-compatible.ts` → rich `ProbeOutcome` (TTFT, TPS, reasoning, quota, evidence) |
| Catalog | global `free_models`, nightly cron with **ops** keys (KAN-44) | none (per-key, on demand) |
| Keys | per-user `provider_credentials` (envelope-encrypted) | single `api_keys` (AES-GCM) |
| Execution | request/`scheduled` only — **no Queue binding** | Cloudflare Queue (`RUN_QUEUE`) |
| API | spec-first `openapi/openapi.yaml` → `packages/api` codegen, CI `api:check` | ad-hoc Hono |
| Chat picker | `Composer.tsx` → `GET /api/models` → global `free_models`, filtered by connected providers | n/a |
| Gateway | `prepareCompletion` resolves provider via **global** `listFreeModels` | n/a |

KAN-44 §8 explicitly listed *"per-user catalog filtering"* as out of scope —
this plan delivers exactly that.

---

## 2. Decisions (recommendations)

- **D1 — Engine as a workspace package**: extract manual-curl `domain/` +
  `probe/` + `providers/` into **`packages/probe`**. One engine for the user
  reports and (later) the catalog cron. *Recommended yes.*
- **D2 — Availability is materialized** per owner in `model_availability`,
  written when a run finishes, read by the picker.
- **D3 — Execute on Cloudflare Queues** (`PROBE_QUEUE` producer+consumer in
  `apps/worker`). A run probes ~40–80 models; `ctx.waitUntil` is capped ~30s.
- **D4 — Provider scope v1 = the 4 numbat providers** (credentials already
  exist). openai/cloudflare/llm7/ollama = phase 9.
- **D5 — Chat picker is owner-scoped**; `/api/models` returns the caller's
  availability. The gateway also validates (defense in depth).
- **D6 — API name `/api/reports`** (user-facing) to avoid colliding with the
  internal `/api/catalog`.

---

## 3. Data model — migration `0011_probe_reports.sql` (+ Drizzle in `db/schema.ts`)

```sql
CREATE TABLE probe_runs (
  id            text PRIMARY KEY,
  owner_id      text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  credential_id text REFERENCES provider_credentials(id) ON DELETE SET NULL,
  provider      text NOT NULL,
  label         text,
  status        text NOT NULL,          -- queued | running | succeeded | failed
  trigger       text NOT NULL,          -- manual (cron later)
  created_at    text NOT NULL,
  started_at    text,
  finished_at   text,
  duration_ms   integer,
  progress_done integer NOT NULL DEFAULT 0,
  progress_total integer NOT NULL DEFAULT 0,
  totals_json   text NOT NULL DEFAULT '{}',
  error         text
);
CREATE INDEX probe_runs_owner_created_idx ON probe_runs(owner_id, created_at DESC);

CREATE TABLE probe_run_models (
  id              text PRIMARY KEY,
  run_id          text NOT NULL REFERENCES probe_runs(id) ON DELETE CASCADE,
  owner_id        text NOT NULL,                    -- denormalized for scoping
  provider        text NOT NULL,
  model_id        text NOT NULL,
  resolved_model  text,
  kind            text NOT NULL,
  attempted       integer NOT NULL,
  ok              integer NOT NULL,
  status          integer,
  status_text     text,
  duration_ms     integer,
  ttft_ms         integer,
  completion_tokens integer,
  reasoning_tokens  integer,
  tps             real,
  thinking        integer,
  content         text,
  error_name      text,
  error_message   text,
  body            text,            -- response evidence (never request auth headers)
  request_body    text,
  headers_json    text,
  quota_state     text,
  quota_limits_json text,
  quota_retry_after_ms integer,
  created_at      text NOT NULL
);
CREATE INDEX probe_run_models_run_idx ON probe_run_models(run_id);
CREATE INDEX probe_run_models_owner_model_idx
  ON probe_run_models(owner_id, provider, model_id, created_at DESC);

-- Materialized per-user availability read by the chat picker.
CREATE TABLE model_availability (
  owner_id       text NOT NULL,
  provider       text NOT NULL,
  model_id       text NOT NULL,
  resolved_model text,
  available      integer NOT NULL,
  last_status    integer,
  last_ok_at     text,
  last_checked_at text NOT NULL,
  source_run_id  text,
  PRIMARY KEY (owner_id, provider, model_id)
);
CREATE INDEX model_availability_owner_available_idx
  ON model_availability(owner_id, available, provider);
```

**Availability write rule** (one transaction per run): upsert one row per probed
model with `available = ok`, `last_status`, and `last_ok_at = now()` when `ok`.
"Recent" = `last_ok_at >= now - AVAILABILITY_TTL_DAYS` (default 7, env var).
Availability rows persist beyond a run/credential delete until TTL or an explicit
reset, so the picker does not flicker empty.

---

## 4. `packages/probe` (engine extraction)

Port from `manual-curl/app/src/`:

```
packages/probe/src/
  domain/{model,provider,probe}.ts        # ModelInfo, ProviderAdapter, ProbeOutcome, QuotaInfo
  probe/{engine,stream,sse,outcome,quota,util}.ts
  providers/{openai-compatible,configs,registry}.ts
  index.ts
```

- Public API: `createOpenAiCompatibleAdapter(config)`, `runProbes(adapter, ctx,
  hooks)`, `PROBE_CONCURRENCY`, and the domain types.
- Configs for v1: `gemini`, `groq`, `nvidia`, `openrouter`. Gemini via the OpenAI
  shim (as manual-curl does) keeps one code path; a native adapter can come later.
- Keep `ProviderMeta.concurrency`; map it to numbat's per-spec concurrency.
- Depends only on `fetch` (injectable) + WebCrypto — Workers-safe.
- Add `typecheck`/`test` scripts so root `--workspaces` picks them up.

**Catalog relationship:** leave `catalog/probe.ts` on the cron for now (tuned with
a reject cache and ops keys). Phase 8 optionally refactors it onto
`packages/probe`.

---

## 5. Execution path

- `apps/worker/wrangler.jsonc` (prod/staging/preview):

```jsonc
"queues": {
  "producers": [{ "binding": "PROBE_QUEUE", "queue": "numbat-probe-runs" }],
  "consumers": [{ "queue": "numbat-probe-runs", "max_batch_size": 1, "max_retries": 2 }]
}
```

- `apps/worker/src/reports/execute.ts`:
  1. load `probe_runs` (owner, provider, credential_id) →
     `getSealedCredential` + `openSecret` (reuse `crypto/vault.ts`);
  2. `adapter.listModels` → `runProbes` with per-provider `concurrency`;
  3. `hooks.onResult` → batch-insert `probe_run_models` + bump `progress_done`
     (chunk ≤ ~11 rows/stmt for D1's 100-param cap);
  4. on finish → upsert `model_availability`, write `totals_json`, set
     `succeeded`/`failed`.
- One active run per user: `POST /api/reports` returns `409 RUN_IN_PROGRESS` if a
  `queued|running` row exists.
- Add `export default { fetch, queue } satisfies ExportedHandler<Env>` in
  `apps/worker/src/index.ts`.

---

## 6. API surface (spec-first — CI enforces it)

Edit `openapi/openapi.yaml`, then `npm run api:gen`; `api:check` must pass.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/reports` | `{ credentialId, label? }` → `202 { report }`; validates ownership + one-active-run |
| GET | `/api/reports` | list summaries (`limit`, `cursor`) |
| GET | `/api/reports/{id}` | detail: run + models + quota |
| PATCH | `/api/reports/{id}` | rename `{ label }` |
| DELETE | `/api/reports/{id}` | `204` |
| GET | `/api/models` | **change**: owner-scoped available models; add `x-available`, `x-last-checked`, and `?scope=availability\|catalog` |

New schemas: `Report`, `ReportSummary`, `ReportModel`, `ReportTotals`,
`QuotaInfo`. All routes `requireUser` + owner-scoped.

**Gateway change** (`gateway/completions.ts`): resolve the provider from the
owner's availability, not the global `listFreeModels`; reject models not
available to the caller (`MODEL_NOT_AVAILABLE`); keep `providerHint` for
programmatic `/v1` use.

---

## 7. Web UI (`apps/web`)

- Routes: `/gateway/reports` (list + **Run report** + rename/delete) and
  `/gateway/reports/:id` (detail). Add "Reports" to
  `components/app-sidebar.tsx` and `app/router.tsx`.
- Port manual-curl components into numbat's UI kit: `TotalsCards`, `QuotaTable`,
  `PassedTable`, `FailedList`, `SkippedList`, `ModelFilter` — wired with
  react-query hooks (`features/reports/{api,hooks}.ts`).
- Poll `GET /api/reports/:id` every 2s while `queued|running`; navigate on
  completion.
- `Composer.tsx`: no change needed once `/api/models` is scoped — add an empty
  state when the user has no availability yet: *"Run a report to discover which
  models your keys can use."*

---

## 8. Security, limits, retention

- Every query owner-scoped by `owner_id`; reuse the vault — plaintext key lives
  only in the consumer isolate during a run, never logged.
- Evidence stores the **response** body/headers and the JSON request body only;
  auth headers are never persisted.
- Rate-limit `POST /api/reports`; cap probes per run via `REPORT_PROBE_LIMIT`.
- Retention: prune `probe_runs`/`probe_run_models` older than N days to bound D1
  size; denormalized `owner_id` makes deletes cheap.

---

## 9. Testing & CI

- `packages/probe`: port manual-curl unit tests (classification, quota parsing,
  SSE parsing, `finalizeOutcome`, `mapLimit`); adapter contract fixtures per
  provider with a stubbed `ctx.fetch`.
- `apps/worker`: vitest-pool-workers — report CRUD, owner isolation, one-active-run
  guard, availability upsert, `/api/models` scoping, gateway rejection. Stub
  provider `fetch`.
- E2E (Playwright): add credential → run report → detail renders → picker shows
  only available models.
- CI: `typecheck && test && build` + `api:check`.

---

## 10. Open questions (product calls)

1. **Availability with no run yet:** strict (empty picker + CTA) or fall back to
   the global `free_models`? *Recommend fallback until the first report.*
   **Resolved (KAN-51):** fallback to the global catalog until the user has any
   `model_availability` rows; after that only fresh available models route.
2. **Recency window:** latest run per provider, or a TTL (7 days)? *Recommend TTL.*
   **Resolved (KAN-51):** TTL via `AVAILABILITY_TTL_DAYS` (default 7); reads use
   `last_ok_at >= now - TTL`.
3. **Provider scope v1:** confirm gemini/groq/nvidia/openrouter.
4. **Evidence retention:** keep raw bodies 30/90 days, or summarize only?
5. **Does `free_models` (global) stay** for the guide/status/gateway, or is it
   superseded by availability?
6. **Queue naming / preview envs:** own queue for staging+preview, or producer-only?

---

## 11. Phased rollout (PR-sized)

| Phase | Deliverable | Depends |
|---|---|---|
| 0 | Confirm §10 decisions; Jira epic + subtasks | — |
| 1 | `packages/probe` extraction + tests (no numbat behavior change) | — |
| 2 | Migration `0011` + Drizzle schema | — |
| 3 | Queue binding + `reports/execute.ts` + `queue` handler | 1,2 |
| 4 | `/api/reports` routes + openapi.yaml + codegen + worker tests | 2,3 |
| 5 | Owner-scoped `/api/models` + gateway enforcement | 4 |
| 6 | Reports UI (list + detail) + nav + composer CTA | 4 |
| 7 | Rate-limit/retention/observability + docs; CI green | 6 |
| 8 | *(optional)* refactor catalog cron onto `packages/probe` | 1 |
| 9 | *(optional)* add openai/cloudflare/llm7/ollama | 1 |

Rollback for phases 3–5 is config (disable the queue / revert the `/api/models`
scope).
