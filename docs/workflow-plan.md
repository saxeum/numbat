# numbat — Engineering Workflow Plan

- **Status:** Proposed (awaiting approval)
- **Date:** 2026-10-20
- **Scope:** Branch/PR/merge policy, CI/CD guardrails, and deploy safety for a
  team of ~5 engineers.
- **Companions:** [`architecture.md`](architecture.md) (D7 CI/CD, D11 previews,
  D12), [`scaffold-runbook.md`](scaffold-runbook.md) (§9–§12),
  [`frontend.md`](frontend.md).

This document proposes hardening the current developer flow. It separates what an
agent can implement directly from what requires a human with elevated access
(repo admin, Cloudflare dashboard, or a product/eng decision).

---

## 1. Current flow (as of 2026-10-20)

The day-to-day loop is:

1. Create a branch off `main`.
2. Make a change (e.g. a UI tweak).
3. Open a pull request.
4. CI runs (`verify`: typecheck → tests → build → E2E).
5. Merge to `main`.
6. `deploy` job auto-deploys **both** Workers to production.

This is **trunk-based development with PR review and deploy-on-merge** — the
correct default shape. The gaps are about *enforcement* and *reviewability*, not
the overall model.

## 2. Gaps

| # | Gap | Why it matters at 5 engineers |
|---|-----|-------------------------------|
| G1 | `main` is unprotected | Direct/force pushes bypass CI; the gate is honor-system |
| G2 | `verify` is not a *required* check | Red CI can still merge |
| G3 | No preview deployments (D11 deferred) | UI PRs are reviewed blind — reviewer must run the branch locally |
| G4 | Deploy-on-merge → prod, no staging | Fine early, but no isolation once real data lands |
| G5 | Lint/format not gated in CI | Only `apps/web` has `oxlint`; CI doesn't run it. No formatter. Diff noise + review churn |
| G6 | Every push to `main` redeploys prod | Docs-only commits rebuild and ship both Workers |
| G7 | No `CODEOWNERS` / review norms | Ownership and reviewer expectations are undefined |
| G8 | Broad CI token, no per-env secret story | One token has Account Workers Scripts:Edit + zone Routes:Edit |

## 3. Principles

- **Make the safe path the easy path.** If it isn't enforced, it isn't a policy.
- **Small, short-lived branches; squash-merge to `main`.** Linear history.
- **Every change is reviewable and reproducible.** Preview URLs for UI, pinned
  deps, deterministic `npm ci`.
- **Prod deploys are boring and reversible.** Known rollback command; staging
  before data exists in prod.
- **Automate gates, not opinions.** Lint/format/typecheck/tests in CI.

---

## 4. Workstreams

### W1 — Protect `main` (G1, G2) — **deferred; adopting Option C**

> **Decision (2026-10-20):** GitHub Free does not enforce rulesets / branch
> protection on **private** org repositories — that requires GitHub **Team** (or a
> public repo). We are **not** upgrading, so W1's hard gate is deferred. This is
> an accepted risk.
>
> We adopt **Option C — honor-system + compensating controls**:
> - CI (`verify`) still runs on every PR and is visible; review discipline is the
>   effective gate.
> - Merge settings kept manual: squash-merge, delete the branch after merge.
> - Candidate follow-up: a **"main guard" workflow** that runs on `push` to
>   `main`, flags commits not originating from a merged PR, and opens an issue
>   (advisory only — it cannot block a merge).
>
> Revisit if the org moves to GitHub Team or the repo becomes public. The desired
> ruleset config is recorded below for that point.

**Target config (when enforceable):** GitHub **Rulesets** targeting `main`:

- Require a pull request before merging.
- Require status checks `typecheck · test · build` (the `verify` job); branch
  **up to date** before merge.
- Require **≥ 1 approval**; dismiss stale approvals on new commits.
- Require conversation resolution.
- Block force-push and branch deletion; require linear history.

Repository merge settings: enable **squash merge**, disable merge/rebase commits,
auto-delete head branches.

### W2 — Full CI gate (G5, G6)

- Add **lint** and **format-check** to `verify`. Choose one formatter
  (**Biome** recommended: single fast tool covering lint + format, or
  **Prettier** if we keep `oxlint`). Add root scripts and run them in CI.
- Add `paths-ignore: ["docs/**", "**/*.md"]` to the `push` trigger so doc-only
  commits don't redeploy prod. Keep PRs running the full `verify`.
- Consider splitting `verify` so E2E is a separate required check (faster
  signal) once the suite grows.

**Approver:** none — agent-implementable, normal PR review.

### W3 — Preview deployments (G3, un-defers D11)

Goal: every PR gets a live URL for the web Worker (and, later, an isolated API +
preview D1).

Options (to be decided when implementing):

1. **Per-version Preview URLs** — enable `preview_urls`, and on PR run
   `wrangler versions upload` (via `cloudflare/wrangler-action`), then comment the
   generated preview URL on the PR. Least infrastructure.
2. **Named `preview` environment** in `wrangler.jsonc` (`env.preview`) with its
   own Worker name + route (e.g. `pr-<n>.preview.foonix.net`); requires dynamic
   route management.
3. **Cloudflare Workers Builds** — Git-integrated preview builds; adopt only if it
   covers the test gates (it would partly duplicate our workflow).

Recommendation: start with **option 1** (cheapest, no new DNS), and add an
isolated preview D1 when persistence lands.

**Approver:** Cloudflare dashboard/API (enable previews; possibly widen token).
Implementation is agent-doable once approved.

### W4 — Deploy safety & staging (G4)

- Document and rehearse rollback: `wrangler rollback --name numbat-web|numbat-api`
  and `wrangler deployments list`.
- Once persistence exists, add a **staging** environment (separate Worker env +
  separate D1) and deploy `main` to staging before prod, or gate prod on a manual
  approval.
- Keep the production origin (`foonix.net`) production-only; staging on
  `*.workers.dev` / a preview subdomain.

**Approver:** eng decision on whether/when to add staging; Cloudflare for env +
D1. Runbook text is agent-doable.

### W5 — Ownership & review norms (G7)

- Add `CODEOWNERS`; start broad, split by area as domains emerge.
- Adopt a review SLA (e.g. first response < 1 business day) and a norm that the
  author merges only after checks are green.
- Lightweight `CONTRIBUTING.md`: branch naming, PR template (what/why/how
  tested), screenshots/preview link for UI changes.

**Approver:** eng decision on norms; files agent-doable.

### W6 — Secrets & token scoping (G8)

- Keep the CI token scoped to Workers Scripts:Edit + zone Routes:Edit + Zone:Read.
  Add D1:Edit / KV / R2 only when those bindings exist, and per environment.
- Never reuse the interactive `wrangler` OAuth session in CI.
- Consider separate tokens per environment (prod vs preview) for blast-radius.

**Approver:** Cloudflare dashboard (token creation); `gh secret set` for the repo.

### W7 — Data/migrations discipline (when D4/§16 lands)

- Drizzle migrations versioned in-repo; forward-only; one migration per PR.
- CI applies migrations to a throwaway local D1 and runs integration tests.
- Prod migrations run as an explicit, reviewed step — not implicitly on deploy.
- Preview/staging get isolated D1; never point test runs at prod data.

**Approver:** eng decision + Cloudflare for D1 databases. Implementation
agent-doable.

---

## 5. Phased rollout

| Phase | Contents | Effort | Blocked on |
|-------|----------|--------|-----------|
| **P0** | W1 ruleset — **deferred** (GitHub Free; Option C adopted, §4). W6 token scopes already set | — | plan upgrade or public repo |
| **P1** | W2 lint/format + `paths-ignore`; W5 `CODEOWNERS` + PR template + `CONTRIBUTING.md`; W4 rollback runbook | 1–2 days | normal review |
| **P2** | W3 per-PR preview URLs (+ comment on PR) | 1–2 days | previews enabled + token |
| **P3** | W4 staging env; W7 D1/migrations when persistence starts | with D4 | eng + Cloudflare |

## 6. Approval matrix

| Item | Owner of approval |
|------|-------------------|
| Rulesets / `main` protection (W1) | **Deferred** — needs GitHub Team upgrade or a public repo (Option C adopted) |
| Required status checks (W1) | **Deferred** — same |
| "main guard" workflow (W1, Option C) | None — agent-implementable, advisory only |
| Lint/format in CI (W2) | None — PR review only |
| `paths-ignore` (W2) | None — PR review only |
| Enable preview URLs / new token scopes (W3, W6) | Cloudflare dashboard |
| Staging environment + D1 (W4, W7) | Eng decision + Cloudflare |
| Review norms, `CODEOWNERS`, coverage expectations (W5) | Eng decision |
| Formatter choice: Biome vs Prettier (W2) | Eng decision |
| Preview strategy option 1/2/3 (W3) | Eng decision |

## 7. Open questions

1. Formatter: **Biome** (one tool, fast) vs **Prettier + oxlint** (status quo)?
2. Preview strategy: per-version URLs vs named `preview` env vs Workers Builds?
3. Do we require 1 approval for *all* changes, or allow solo merges for
   low-risk/docs with a longer SLA?
4. When do we introduce staging — at first persistence, or earlier?
5. Coverage thresholds now, or wait until features land?

## 8. Out of scope (for now)

- Auth (architecture D10) and persistence design (D4/§16) — separate docs.
- Release versioning/changelogs.
- On-call/incident process.
