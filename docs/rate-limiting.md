# Testing rate limiting

How the API rate limit works and how to test it, with Cloudflare console links.
Companion to [`production-readiness-plan.md`](production-readiness-plan.md) P1.2
and [`incident-response.md`](incident-response.md).

---

## 1. How it works

- **Mechanism:** Cloudflare's **Workers Rate Limiting API** binding (configured in
  `apps/worker/wrangler.jsonc` as `ratelimits`), not an in-memory map.
- **Binding:** `API_RATE_LIMITER`, **120 requests / 60 s**, keyed by the client
  IP (`cf-connecting-ip`), applied to the whole `/api` surface.
- **Counting is per Cloudflare location** (colo), so a distributed client across
  many colos gets more than 120 total — by design.
- **Response when exceeded:**
  ```json
  { "error": { "code": "RATE_LIMITED", "message": "Too many requests — slow down", "requestId": "…" } }
  ```
- **Per environment** (separate namespaces so one env can't exhaust another):

  | Env | Namespace | Worker |
  |-----|-----------|--------|
  | prod | `1001` | `numbat-api` |
  | staging | `1002` | `numbat-api-staging` |
  | preview | `1003` | `numbat-api-preview` |

- Code: `apps/worker/src/api/middleware/rate-limit.ts`. The middleware **skips
  when the binding is absent** (local `wrangler dev` and tests) — so local dev is
  never limited.

> The Workers Rate Limiting API is **config-only** — there is no dashboard page
> for the binding; edit `wrangler.jsonc` and redeploy to change it. (Cloudflare's
> separate zone-level *WAF Rate limiting rules* do have a dashboard page — see §5.)

### 1.1 Per-user report limit (KAN-53)

On top of the IP-based global limit, `POST /api/reports` enforces a **per-user**
cap: at most `REPORT_RATE_LIMIT_PER_HOUR` (default **10**) report starts in a
rolling hour, counted from `probe_runs`. Exceeding it returns `429`:

```json
{ "error": { "code": "RATE_LIMITED", "message": "Report limit reached (10 per hour); try again later", "requestId": "…" } }
```

This is application-level (a D1 count), not the Rate Limiting binding, because it
is per-account rather than per-IP and should be consistent across colos. Code:
`apps/worker/src/api/routes/reports.ts`; knob: `apps/worker/src/reports/limits.ts`.

Related knobs: `REPORT_PROBE_LIMIT` (models per run, default 200) and
`REPORT_RETENTION_DAYS` (daily prune, default 30). See
[`byok-probe-reports-plan.md`](byok-probe-reports-plan.md) §8.

---

## 2. Test on a PR preview (recommended — isolated, safe)

1. Open a PR; the bot comments the preview URLs. Use the **API** one, e.g.
   `https://pr-<n>-numbat-api-preview.<account-subdomain>.workers.dev`.
2. Fire more than 120 requests and count statuses:

```bash
BASE=https://pr-<n>-numbat-api-preview.<account-subdomain>.workers.dev

# single request should be 200
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/openapi.json"

# 140 rapid requests: expect ~120x 200 then 429
for i in $(seq 1 140); do
  curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/openapi.json"
done | sort | uniq -c

# see the 429 body
for i in $(seq 1 140); do
  b=$(curl -s "$BASE/api/openapi.json"); case "$b" in *RATE_LIMITED*) echo "$b"; break;; esac
done
```

Expected (verified on PR #26): `120` × `200` and `20` × `429`.

## 3. Test on staging

Same as above against `https://numbat-api-staging.<account-subdomain>.workers.dev`
(namespace `1002`). Staging is isolated from prod.

## 4. Test on production (use sparingly)

```bash
BASE=https://foonix.net
for i in $(seq 1 140); do curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/openapi.json"; done | sort | uniq -c
```

⚠️ This **blocks your own IP** for up to 60 s (and you share the egress IP with
anyone on the same network/machine). Prefer preview/staging. The window resets
after 60 s — just wait.

## 5. Cloudflare console links

Account ID: `<cloudflare-account-id>` · Zone: `foonix.net`
(`<cloudflare-zone-id>`).

| What | Link / path |
|------|-------------|
| Account home | https://dash.cloudflare.com/<cloudflare-account-id> |
| Workers & Pages (list) | https://dash.cloudflare.com/<cloudflare-account-id>/workers-and-pages |
| API Worker (`numbat-api`) → Metrics / Logs | Workers & Pages → **numbat-api** → **Metrics** / **Logs** (or the URL `…/workers/services/view/numbat-api/production`) |
| Preview Worker (`numbat-api-preview`) | Workers & Pages → **numbat-api-preview** |
| Staging Worker (`numbat-api-staging`) | Workers & Pages → **numbat-api-staging** |
| Zone → Security → **WAF / Rate limiting rules** (zone-level alternative) | https://dash.cloudflare.com/<cloudflare-account-id>/foonix.net/security/waf/rate-limiting-rules |
| Zone → Analytics | https://dash.cloudflare.com/<cloudflare-account-id>/foonix.net/analytics |

> Dashboard URL paths occasionally change — if a link 404s, navigate from the
> account home via the labels above.

## 6. Automated tests

- `apps/worker/test/rate-limit.test.ts` — unit tests: limiter denies → `429`
  envelope; limiter allows → passes through (stub binding).
- No E2E covers the burst (it would poison the shared IP); enforcement is proven
  manually on previews (above).

## 7. Changing the limit

Edit `ratelimits` in `apps/worker/wrangler.jsonc` (per env), then deploy. Valid
`period` values are **10** or **60** seconds; `limit` is an integer. Re-run §2 to
confirm.
