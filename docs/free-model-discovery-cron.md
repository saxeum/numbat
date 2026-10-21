# numbat — Free-model discovery as a cron job (D1-backed catalog)

- **Status:** Implemented (rollout steps 2–6 pending operator)
- **Date:** 2026-10-21
- **Ticket:** Jira **KAN-44**
- **Source:** `saxeum/byokfree` — `src/free-models.ts`, `src/providers.ts`,
  `scripts/check-free-models.mjs`, `test/free-models.test.ts`
- **Supersedes:** `scripts/generate-free-models-migration.mjs` (deleted in the
  same PR — it emitted a SQL migration that had to be applied by hand on three
  databases)
- **Companions:** [`architecture.md`](architecture.md),
  [`free-token-onboarding.md`](free-token-onboarding.md)

---

## 0. Progress

| Piece | Where |
| ----- | ----- |
| Additive migration + Drizzle schema | `migrations/0009_catalog_sync.sql`, `src/db/schema.ts` |
| Discovery / probe / reconcile / sync | `src/catalog/*` |
| Cron entrypoint | `src/index.ts` (`scheduled`), `wrangler.jsonc` (`triggers`) |
| Ops trigger | `POST /api/catalog/refresh` (`src/api/routes/catalog.ts`) |
| Tests | `test/catalog-discovery.test.ts`, `test/catalog-sync.test.ts` |
| Probe cache (`catalog_probes`) | `src/catalog/sync.ts`, migration |
| Ops secrets + prod rollout | ⏳ operator (see §6) |

---

## 1. Problem

The free-model catalog is **static schema**. Today it is refreshed by hand:

1. run `scripts/generate-free-models-migration.mjs` (lists `/models` for four
   providers, sends one real completion per model, keeps survivors),
2. it writes `apps/worker/migrations/000N_drop_and_reseed_free_models.sql`,
3. someone commits it, waits for the deploy, then runs
   `wrangler d1 migrations apply … --remote` on **prod, staging and preview**.

Consequences:

- The catalog only changes when a human remembers to regenerate it — provider
  catalogs move weekly, so we drift.
- Every refresh is a **schema migration** (`DROP TABLE` + reseed). It cannot be
  rolled back independently of the code, and forgetting the manual
  `migrations apply` leaves prod stale.
- `0002`, `0004`, `0005`, `0006`, `0008` are five generations of the same seed.

**The catalog is data, not schema.** It should be refreshed by a scheduled job
that writes rows to D1, with no deploy and no migration.

---

## 2. Target design

### 2.1 Runtime: a `scheduled` handler in the existing API Worker

Add a Cloudflare Cron Trigger to `apps/worker` (not a new Worker):

```jsonc
// apps/worker/wrangler.jsonc (top level = production only)
"triggers": { "crons": ["17 3 * * *"] }
```

```ts
// apps/worker/src/index.ts
const app = createApp();

export default {
  fetch: app.fetch,
  scheduled: (event, env, ctx) =>
    ctx.waitUntil(runCatalogSync(env, { trigger: event.cron })),
} satisfies ExportedHandler<Env>;
```

Why the existing Worker: it already owns the `DB` binding, the provider specs
and the deploy pipeline. No new artefact, no cross-Worker auth.

Staging/preview get **no** cron (top-level `triggers` is prod-only), so we do
not triple the provider quota spend.

### 2.2 Module layout

```
apps/worker/src/catalog/
  providers.ts   # per-provider discovery spec (modelsUrl, dialect, freeStrategy, keyEnv)
  discover.ts    # GET /models -> DiscoveredModel[]  (port of byokfree free-models.ts)
  probe.ts       # one tiny chat per model -> ProbeStatus (port of probeModel/applyProbe)
  reconcile.ts   # diff vs D1 -> chunked delete/insert statements
  sync.ts        # orchestrator: per provider discover -> probe -> reconcile -> record run
  index.ts       # runCatalogSync(env, opts)
```

`providers.ts` composes the existing `src/gateway/providers.ts` specs rather than
duplicating URLs/auth — it only adds what discovery needs:

```ts
export type FreeStrategy = "pricing" | "free-tier" | "probe";

export interface DiscoverySpec {
  id: ProviderId;
  modelsUrl: string;
  /** Gemini uses the native models payload; the rest are OpenAI-shaped. */
  dialect: "openai" | "gemini";
  free: FreeStrategy;
  /** Secret holding the ops key used for discovery (never a user key). */
  keyEnv: string;
  sortBase: number;
}
```

| Provider   | `free`      | Rationale                                                        |
| ---------- | ----------- | ---------------------------------------------------------------- |
| `gemini`   | `free-tier` | rate-limited free tier, not model-gated → listed chat models are free |
| `groq`     | `free-tier` | same; drop `whisper`/`orpheus`/`prompt-guard`/`tts`              |
| `openrouter` | `pricing` | `/models` carries `pricing`; free ⇔ prompt=0 **and** completion=0 **and** `architecture.modality` ends `->text` |
| `nvidia`   | `probe`     | no price metadata; NIM lists ~58 models, only some are usable    |

### 2.3 Data model

New migration `0009_catalog_sync.sql` — additive, no `DROP`:

```sql
CREATE TABLE `catalog_probes` (
  `provider`   text NOT NULL,
  `model_id`   text NOT NULL,
  `status`     text NOT NULL,           -- probe status that caused the rejection
  `checked_at` text NOT NULL,
  PRIMARY KEY (`provider`, `model_id`)
);

CREATE TABLE `catalog_runs` (
  `id`          text PRIMARY KEY,
  `started_at`  text NOT NULL,
  `finished_at` text,
  `trigger`     text NOT NULL,          -- "cron" | "manual"
  `status`      text NOT NULL,          -- "ok" | "partial" | "skipped" | "failed"
  `providers`   text NOT NULL,          -- JSON: per-provider {listed,added,removed,probed,dropped,note}
  `error`       text
);

ALTER TABLE `free_models` ADD COLUMN `last_checked_at` text;
ALTER TABLE `free_models` ADD COLUMN `updated_at` text;
ALTER TABLE `free_models` ADD COLUMN `note` text;
```

`free_models` keeps its shape and `(provider, model_id)` primary key, so
`/api/models` and the `@numbat/api` types are unchanged.

`catalog_probes` is the **probe cache**: a model a provider lists but that the
probe rejected (404 "no longer available to new users", 402/403 billing,
non-chat models that answer 400/empty). Without it, every run would re-probe
the same rejects, burn the probe budget, and starve the models behind them —
NVIDIA lists 83 models of which only a fraction work on a free key.

### 2.4 Algorithm

Per provider, independently (a failure is contained to that provider):

```
1. LIST     GET {modelsUrl} with the ops key
            -> parse -> DiscoveredModel[] {id,label,context,free,note}
            -- on non-2xx / network error: skip provider, keep existing rows

2. LOAD     rows for this provider from free_models, plus its catalog_probes
            entries (the remembered rejections)

3. PROBE    only "fresh" ids: not already in free_models, and not a remembered
            rejection inside the cooldown (default 7 days).
            Bounded concurrency (default 6), one tiny request each,
            timeout 12s, 1 retry on 429/5xx, then one relaxed-payload retry
            for 400/empty (reasoning models need more tokens, some reject
            temperature or want max_completion_tokens).
              200      -> usable   (admit)      429 -> rate-limited (admit)
              402/403  -> billing_required (drop, cache)
              401      -> unauthorized    (drop, cache)
              404/410  -> not_available   (drop, cache)
              400      -> bad_request     (drop, cache)
              200 w/o content -> empty    (drop, cache)
              5xx / network   -> error    (drop, NOT cached -> retried)

4. GUARD    if listing succeeded but produced 0 rows, or the surviving set is
            smaller than 50% of the current set -> skip this provider
            (status "skipped-implausible") unless CATALOG_ALLOW_SHRINK=1

5. WRITE    db.batch([                       -- atomic, per provider
               DELETE FROM free_models   WHERE provider = ?,
               INSERT INTO free_models   (...) VALUES (...),   -- chunked
               DELETE FROM catalog_probes WHERE provider = ?,
               INSERT INTO catalog_probes(...) VALUES (...)    -- chunked
            ])
            D1 allows 100 bound parameters per statement: free_models writes 9
            columns (11 rows/INSERT) and catalog_probes writes 4 (25 rows).
```

`sort` is assigned as `sortBase + index` (gemini 10, groq 100, nvidia 200,
openrouter 300) preserving today's ordering.

**Why probe incrementally:** a no-change day costs 4 HTTP requests + 4 D1
queries per provider and probes nothing. Only a genuinely new model is ever
probed, and a rejected one is not probed again for `CATALOG_REPROBE_DAYS`, so
the ops key spends almost no free-tier quota.

The `catalog_probes` cache is **reconciled, not replaced**: entries survive
while their model is still listed and still not admitted, and are pruned once
it is admitted or disappears from the listing.

### 2.5 Keys and configuration

Discovery must **not** touch user credentials: they are per-user, envelope
encrypted, and using someone's key to enumerate a catalog is wrong. The job uses
dedicated ops keys, added per environment:

```bash
wrangler secret put CATALOG_GEMINI_API_KEY      # prod, staging, preview
wrangler secret put CATALOG_GROQ_API_KEY
wrangler secret put CATALOG_NVIDIA_API_KEY
wrangler secret put CATALOG_OPENROUTER_API_KEY
wrangler secret put CATALOG_ADMIN_TOKEN         # manual trigger
```

| Var / secret              | Default | Purpose                                  |
| ------------------------- | ------- | ---------------------------------------- |
| `CATALOG_ENABLED`         | `0`     | master switch; `1` arms the cron          |
| `CATALOG_DRY_RUN`         | `0`     | discover + log, write nothing             |
| `CATALOG_PROBE_LIMIT`     | `25`    | max probes per run (quota guard)          |
| `CATALOG_CONCURRENCY`     | `6`     | probe parallelism                         |
| `CATALOG_ALLOW_SHRINK`    | `0`     | bypass the 50% shrink guard               |
| `CATALOG_REPROBE_DAYS`    | `7`     | cooldown before a cached rejection is retried |

A provider without its ops key is skipped with `note: "no key"` — the job never
fails because one key is missing.

### 2.6 Manual trigger

`POST /api/catalog/refresh` in the API Worker, guarded by
`x-catalog-token: $CATALOG_ADMIN_TOKEN` (constant-time compare), returning the
run summary. Internal ops route: not in `openapi.yaml`, not session-gated.

Locally: `wrangler dev --test-scheduled` then
`curl "http://localhost:8787/__scheduled?cron=17+3+*+*+*"`.

### 2.7 Observability

- `catalog_runs` row per provider-group run (counts + status) — this feeds the
  SLO work in KAN-7 later.
- One structured `console.log` per run: `{ runId, providers: [{id, listed,
  added, removed, probed, failed, status}] }`. No keys, no raw provider bodies.
- Non-2xx from a provider is logged as `warn` with status only.

---

## 3. What is ported vs. rewritten

| byokfree                                   | Action |
| ------------------------------------------ | ------ |
| `PROVIDERS` specs (14 providers)           | **Not ported.** numbat supports 4; reuse `src/gateway/providers.ts` and add the discovery fields. |
| `fromOpenAI` / `fromGemini` / `classifyPricing` / `isGroqChatModel` | **Ported** into `discover.ts` (adds OpenRouter `architecture.modality` text-out filter). |
| `probeModel` / `classifyProbe` / `applyProbe` | **Ported** into `probe.ts`. |
| `listModels` fan-out + in-isolate 60s cache | **Replaced** by `sync.ts` (cron has no shared isolate cache; incremental probing replaces it). |
| `x-free` / `x-context` / `x-status` annotations | Kept in the D1 row (`free`, `context`, `note`). |
| `test/free-models.test.ts`                 | **Ported** parsing/classification cases + new reconcile tests. |
| `scripts/check-free-models.mjs`            | Not ported (superseded). |

`scripts/generate-free-models-migration.mjs` is **deleted** in the same PR;
`0002/0004/0005/0006/0008` stay as history.

---

## 4. Deliverables

1. `0009_catalog_sync.sql` (+ Drizzle schema for `free_models` columns and
   `catalog_runs`).
2. `apps/worker/src/catalog/*` (discover, probe, reconcile, sync, providers).
3. `scheduled` export in `src/index.ts`; cron trigger in `wrangler.jsonc`.
4. `POST /api/catalog/refresh` (token-gated).
5. `env.d.ts` additions; `docs/free-token-onboarding.md` note that the catalog
   is refreshed nightly.
6. Unit tests; delete the old script; update `README`/docs where the manual
   process is described.

---

## 5. Testing

`test/catalog-discovery.test.ts` (pure units) and `test/catalog-sync.test.ts`
(D1 + route integration, with a stubbed `fetch`):

- **Parsing** (ported from byokfree): OpenRouter zero-priced only + text-out;
  Groq chat-only (drops `whisper`/`orpheus`/`prompt-guard`/`tts`); Gemini
  `generateContent` only; NVIDIA left unclassified; malformed payloads survive.
- **Probe classification**: 200→usable, 200-empty→empty, 429→rate-limited,
  402/403→billing, 401→unauthorized, 404/410→not-available, 400→bad-request,
  5xx→error; the relaxed-payload retry, the transient retry, and a network
  failure that must not throw. `isCacheableRejection` covers the cache policy.
- **Reconcile**: adds/keeps/removes with stable sort bands, empty-listing guard,
  shrink guard (and its override), and chunk sizes under D1's parameter cap.
- **Sync**: no-op when disabled; a full run writes `free_models` + one
  `catalog_runs` row; a second run probes nothing; a failed listing keeps the
  provider's rows; an empty listing is skipped; a missing ops key is skipped;
  dry-run writes nothing; **rejects are remembered** so the next run probes 0
  and reaches the models behind them.
- **Route**: 401 without/with a wrong token, 400 for an unknown provider, and a
  successful on-demand run with the ops token.

E2E is unchanged — the `/api/models` contract is untouched.

---

## 6. Rollout

| Step | Action |
| ---- | ------ |
| 1 | Merge migration + code with `CATALOG_ENABLED=0` (cron fires, exits immediately) |
| 2 | Apply `0009` to prod / staging / preview |
| 3 | `wrangler secret put` the four ops keys + `CATALOG_ADMIN_TOKEN` |
| 4 | `POST /api/catalog/refresh` with `CATALOG_DRY_RUN=1`; compare counts vs. current 34 |
| 5 | `POST /api/catalog/refresh` for real; verify `/api/models` and `catalog_runs` |
| 6 | Set `CATALOG_ENABLED=1`; confirm the next 03:17 UTC run |

Rollback: `CATALOG_ENABLED=0`. The catalog stays whatever the last run wrote;
seed rows can be restored by re-applying `0008` if ever needed.

### 6.1 Local validation (done)

Run against the real provider keys on a local D1 with the migration applied:

| | before | after |
| --- | --- | --- |
| gemini | 12 | 35 |
| groq | 5 | 5 |
| nvidia | 9 | 16 |
| openrouter | 8 | 18 |
| **total** | **34** | **74** |

`GET /api/models` returns all 74 with `x-free: true`. The probe budget made the
first run resolve gemini (46 listed → 23 admitted, 11 rejected) and left NVIDIA
for later runs; by the seventh run the cache had accumulated 59 NVIDIA rejects
and the provider had converged. Steady state probes nothing. Rejects are real:
`gemini-2.5-flash`/`-pro`/`-flash-lite` answer 404 *"no longer available to new
users"*, `antigravity-preview-*` answer 400 *"only supports Interactions API"*,
and `gemini-3.5-transcribe` returns an empty completion.

---

## 7. Risks

| Risk | Mitigation |
| ---- | ---------- |
| Provider `/models` changes shape and we wipe a provider's rows | 0-row and >50% shrink guards; per-provider isolation |
| Probing spends ops quota | `CATALOG_PROBE_LIMIT`, incremental probes only |
| Groq 429 storms during a full re-probe | concurrency 6, 429 treated as free, 1 retry |
| D1 100-bound-parameter limit | chunk inserts to 16 rows |
| A bad catalog ships unattended | dry-run + admin trigger + `catalog_runs` audit |
| Ops keys leak in logs | keys only in headers; never logged; `warn` logs carry status only |

---

## 8. Out of scope

- Adding providers beyond gemini/groq/nvidia/openrouter.
- Auto-generating `@numbat/api` types or `/api/models` shape changes.
- Per-user catalog filtering (user only has keys for some providers).
- Pricing/billing metadata (only the free/not-free bit).
- Sentry (KAN-9) and SLO dashboards (KAN-7) — `catalog_runs` is designed to feed
  them later.

---

## 9. Acceptance criteria

- [ ] A daily Cron Trigger writes `free_models` for all four providers with no
      deploy and no migration.
- [ ] A provider outage leaves that provider's existing rows intact.
- [ ] New models appear in `/api/models` within one cron cycle.
- [ ] Each run records a `catalog_runs` row with per-provider counts.
- [ ] Discovery uses only `CATALOG_*` ops secrets; no user credential is read.
- [ ] `CATALOG_ENABLED=0` makes the job a no-op.
- [ ] The old migration-generating script is gone and the manual reseed process
      is removed from the docs.
- [ ] Unit tests cover parsing, probe classification, reconcile and the
      scheduled handler; CI green.
