# numbat — Incident Response & Rollback Runbook

Practical steps for detecting, mitigating, and rolling back incidents. Companion
to [`architecture.md`](architecture.md) §13, [`scaffold-runbook.md`](scaffold-runbook.md)
§11, and [`manual-testing-todos.md`](manual-testing-todos.md).

> Run `wrangler` from `apps/worker` (or `apps/web` for the web Worker), or pass
> `-c apps/<app>/wrangler.jsonc`. Running it at the repo root fails (workspace).

---

## 1. Severity

| Sev | Meaning | Examples | Response |
|-----|---------|----------|----------|
| **SEV1** | Production down / data loss / security breach | `foonix.net` 5xx for all users; DB corruption; auth bypass | Immediate; mitigate first |
| **SEV2** | Major feature broken, workaround exists | Todos 500 for some users; sign-in failing | Same day |
| **SEV3** | Minor/degraded | Slow requests; one endpoint misbehaving | Next business day |

## 2. Detect

- **Uptime:** `/api/health` (`database: healthy`), the CI **post-deploy smoke**
  job, Cloudflare dashboard alerts.
- **Errors/logs:** Workers Logs (dashboard) and `wrangler tail numbat-api`
  (structured JSON with `requestId`; quote it when debugging).
- **Signals:** spike in 5xx, auth failures, D1 errors, or the `smoke` job failing
  on `main`.

## 3. First response

1. **Acknowledge & size it** (severity above).
2. **Stop the bleeding** — prefer **rollback** (§4) over live debugging.
3. **Communicate** (see §6).
4. **Triage** with `wrangler tail`, Workers Logs, D1 queries (§5).
5. **Post-incident:** add a regression test, update this doc, fix forward.

## 4. Rollback (preferred mitigation)

**Workers** — revert to the last good version (fast, no rebuild):

```bash
# list recent versions/deployments, pick the last good one
cd apps/web    && npx wrangler versions list && npx wrangler rollback --name numbat-web
cd apps/worker && npx wrangler versions list && npx wrangler rollback --name numbat-api
```

`wrangler rollback` re-points the Worker to the previous version. Verify after:

```bash
curl -s https://foonix.net/api/health
curl -s -o /dev/null -w '%{http_code}\n' https://foonix.net/
```

**Deploy a specific version** (when the bad one isn't simply "previous"):

```bash
npx wrangler versions deploy <version-id>@100%
```

**Staging/preview** (isolated, lower risk):

```bash
cd apps/worker
npx wrangler rollback --name numbat-api-staging
# preview Worker is per-PR/rebuilt on demand; just re-run the PR job
```

## 5. Data (D1)

Migrations are **forward-only** (`persistence-plan.md` §7) — you don't roll a
migration back; you ship a corrective one. For bad data:

- **Inspect:** `npx wrangler d1 execute numbat-db --remote --command "SELECT …"`.
- **D1 Time Travel** (point-in-time restore, ~30 days) is the recovery tool for
  data loss. Get info / restore via the dashboard (D1 → database → Time Travel)
  or the D1 Time Travel API; **this overwrites the database**, so capture the
  current state first.
- Never run ad-hoc destructive SQL against prod without a snapshot/backup.

## 6. Comms

- Single **incident owner**; one **status thread** (issue or channel) with updates
  at a regular cadence (e.g. every 30 min for SEV1).
- Post an initial notice ("investigating / mitigating / resolved"), then a short
  **post-mortem** (timeline, impact, root cause, actions) within a few days.

## 7. Access & secrets

- Interactive `wrangler` (OAuth) for rollbacks; the CI token is for deploys.
- Secrets: `wrangler secret put` per environment (`.dev.vars` local only). If a
  secret is suspected leaked: rotate it, redeploy, invalidate sessions if needed
  (rotate `BETTER_AUTH_SECRET` → all sessions invalidated).

## 8. Rehearsal log

| Date | What | Result |
|------|------|--------|
| 2026-10-20 | `wrangler rollback --name numbat-api-staging` | ✅ rolled back to the previous version (`ff070908…`); `/api/health` healthy afterwards. Reverted to latest on the next `main` deploy. |

> Rehearsed once (staging). Re-run after major changes — an untested rollback is
> not a rollback.

## 9. Checklist (copy into the incident issue)

- [ ] Severity assigned; incident owner named
- [ ] Status thread opened; first update posted
- [ ] Mitigation chosen (rollback / corrective deploy / config)
- [ ] Rollback executed and verified (`/api/health`, `/`)
- [ ] Data impact assessed (D1)
- [ ] Comms cadence maintained
- [ ] Post-mortem scheduled; regression test added
