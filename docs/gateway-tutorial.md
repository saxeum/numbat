# Gateway POC — validation tutorial

How to verify the BYOK gateway works: connect a provider key, list free models,
and get a real completion through one OpenAI-compatible endpoint. Keys are stored
**encrypted at rest in D1**, and the GUI is reachable **only after sign-in**.

> Scope: POC. Providers are **Google Gemini** and **Groq** only. The free-tier
> model catalog is **static** (seeded in D1, not live-probed). Routing is
> per-request provider resolution — no scoring/failover yet.

## What exists

| Surface | Route | Auth | Notes |
|---|---|---|---|
| Health | `GET /api/health` | public | DB probe |
| Models | `GET /api/models` | session | OpenAI `ModelList`, seeded catalog |
| Credentials | `GET/POST /api/credentials`, `DELETE /api/credentials/{id}` | session | verify → seal → store; masked list |
| Chat | `POST /api/chat/completions` | session | Groq passthrough; Gemini translated; `stream` = SSE |
| GUI | `/gateway` | session | sign-in gate + credentials + models + chat |

Keys are encrypted with envelope encryption: an AES-256-KW **KEK** (Worker
secret) wraps a per-record AES-256-GCM **DEK**; only ciphertext is written to D1.

---

## 1. Prerequisites

- Node 20+ and `npm ci` already run in the repo root.
- At least one provider key to test with: **Groq** (<https://console.groq.com/keys>)
  or **Google Gemini** (<https://aistudio.google.com/app/apikey>). Both are free-tier.
- No Cloudflare account needed for local validation.

## 2. Configure local secrets

```bash
cd apps/worker
cp .dev.vars.example .dev.vars   # gitignored
```

`.dev.vars` needs (at minimum):

```ini
ENVIRONMENT=development
# 32-byte base64 KEK — generate your own:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
BYOK_KEK=<paste-generated-value>
BYOK_KEK_VERSION=1

# Better Auth (any values are fine locally)
BETTER_AUTH_URL=http://localhost:5173
BETTER_AUTH_SECRET=dev-secret-dev-secret-dev-secret
GOOGLE_CLIENT_ID=dev
GOOGLE_CLIENT_SECRET=dev
```

`ENVIRONMENT=development` enables dev **email/password** sign-in, so you can test
without configuring Google OAuth. Google sign-in only works once real OAuth
credentials are set (see `docs/google-oauth-setup.md`).

> **Changing `.dev.vars` needs a restart.** `wrangler dev` hot-reloads source but
> not env — stop `npm run dev` and start it again after editing `.dev.vars`.
>
> **Forked an older local DB?** If `npm run dev` was ever started before this
> fork, the local D1 has the old tables. Reset and re-migrate:
> ```bash
> rm -rf apps/worker/.wrangler/state/v3/d1
> (cd apps/worker && npx wrangler d1 migrations apply numbat-db --local)
> ```

## 3. Run it

```bash
npm run dev        # API on :8787, web on :5173 (web proxies /api → :8787)
```

Open **<http://localhost:5173/gateway>**. Signed out, you should see the
**Sign in** screen — that is the gate working.

---

## 4. Validate through the GUI

1. On `/gateway`, use the **dev credentials** form (email + password ≥ 8 chars) →
   **Sign in**. You land on the Gateway page.
2. **Provider credentials** → choose *Groq*, paste a real key → **Add key**.
   - Success → the key appears as `groq · default`.
   - Failure → `The groq key could not be verified` (bad key, or no network).
3. **Chat** → pick a model (e.g. `openai/gpt-oss-20b`) → prompt "Say pong" → **Send**.
   You should see the completion and `served by groq · openai/gpt-oss-20b`.
4. Repeat with *Google Gemini* + `gemini-flash-lite-latest`.
5. **Remove** a key → it disappears from the list.

---

## 5. Validate through the API (curl)

Everything goes through the web origin (`:5173`), which proxies `/api`.

```bash
BASE=http://localhost:5173

# (a) unauthenticated access is rejected
curl -s -o /dev/null -w "models without session -> %{http_code}\n" $BASE/api/models
# expect 401

# (b) sign in (dev email/password) and keep the cookie
curl -s -c /tmp/cookies.txt -X POST $BASE/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password1234","name":"You"}'

# (c) the seeded catalog
curl -s -b /tmp/cookies.txt $BASE/api/models | head -c 400; echo

# (d) connect a key (verification calls the provider — use a real key)
curl -s -b /tmp/cookies.txt -X POST $BASE/api/credentials \
  -H 'content-type: application/json' \
  -d '{"provider":"groq","apiKey":"gsk_...your real key..."}'
# -> 201 {"id":"...","provider":"groq","label":"","fingerprint":"..."}

# (e) the list is masked (no secret / ciphertext fields)
curl -s -b /tmp/cookies.txt $BASE/api/credentials; echo

# (f) a real completion (Groq)
curl -s -b /tmp/cookies.txt -X POST $BASE/api/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"openai/gpt-oss-20b","messages":[{"role":"user","content":"Reply with exactly: pong"}],"max_tokens":64}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);console.log('content:',JSON.stringify(b.choices?.[0]?.message?.content))})"

# (g) Gemini (translated to the OpenAI shape)
curl -s -b /tmp/cookies.txt -X POST $BASE/api/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"gemini-flash-lite-latest","messages":[{"role":"user","content":"Reply with exactly: pong"}],"max_tokens":32}'

# (h) streaming (Groq) — OpenAI SSE chunks
curl -sN -b /tmp/cookies.txt -X POST $BASE/api/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"openai/gpt-oss-20b","stream":true,"messages":[{"role":"user","content":"Count: one two three"}],"max_tokens":64}' | head -4
```

Error cases worth confirming: unknown model → `404 MODEL_NOT_FOUND`; a model
whose provider has no key → `400 NO_CREDENTIAL`; malformed JSON → `400`.

### Programmatic access — API tokens

The session cookie is browser-only. For scripts/SDKs, create an **API token** in
the GUI: **API tokens** → name it → **Create token**. The token (`nbk_…`) is shown
**once**; copy it (the copy button, and a ready-made curl snippet using the model
you selected below it).

```bash
curl https://<your-origin>/api/chat/completions \
  -H "authorization: Bearer nbk_…" \
  -H 'content-type: application/json' \
  -d '{"model":"openai/gpt-oss-20b","messages":[{"role":"user","content":"pong"}]}'
```

OpenAI SDK compatible:

```python
from openai import OpenAI
client = OpenAI(base_url="https://<your-origin>/api", api_key="nbk_…")
print(
    client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[{"role": "user", "content": "pong"}],
    ).choices[0].message.content
)
```

- Only a **SHA-256 hash** of the token is stored (shown once, never retrievable).
- Bearer auth is accepted on `/api/models` and `/api/chat/completions`.
- `/api/credentials` and `/api/keys` stay **session-only** — a leaked inference
  token cannot add or revoke your provider keys.
- Revoke from the same section; a revoked token → `401 UNAUTHENTICATED`.

---

## 6. Confirm keys are encrypted at rest

Inspect the local D1 database — you should see ciphertext, never the key:

```bash
cd apps/worker
npx wrangler d1 execute numbat-db --local \
  --command "SELECT provider, label, key_version, substr(wrapped_dek,1,16) AS dek, substr(ciphertext,1,24) AS ct FROM provider_credentials;"
```

Expected: `wrapped_dek` / `ciphertext` are base64 blobs; the plaintext key never
appears. Deleting a credential removes the wrapped DEK (crypto-shred).

---

## 7. Automated checks (the repo's own evidence)

```bash
npm run typecheck        # types
npm test                 # 29 unit/integration tests (vault, credentials, models, chat, health, rate limit)
npm run lint             # oxlint
npm run format:check     # prettier
npm run api:check        # OpenAPI codegen drift (spec is source of truth)
npm run build            # web build
npx playwright test tests/e2e/gateway.spec.ts   # sign-in gate + private /api/models
```

The unit tests already assert the important security properties: ciphertext-only
at rest, AAD/owner binding, wrong-KEK failure, cross-user isolation, and that no
plaintext key appears in responses.

## 8. Acceptance checklist

- [ ] `/gateway` shows the sign-in screen when signed out (no GUI access).
- [ ] After sign-in, a Groq key and a Gemini key can be added and appear masked.
- [ ] `GET /api/models` returns the seeded Gemini + Groq catalog.
- [ ] `POST /api/chat/completions` returns a real completion for **Groq**.
- [ ] `POST /api/chat/completions` returns a real completion for **Gemini**.
- [ ] Streaming returns `chat.completion.chunk` SSE frames.
- [ ] An API token is shown once; a `Bearer` call to `chat/completions` succeeds; a revoked token returns `401`.
- [ ] D1 contains ciphertext only; removing a key deletes the row.
- [ ] `npm run typecheck && npm test && npm run api:check` all pass.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Server is missing BYOK_KEK` | `BYOK_KEK` is absent or was added after the server started — set it in `.dev.vars` and **restart** `npm run dev` |
| `The <provider> key was rejected by the provider (HTTP 401)` | You pasted the wrong key, the wrong provider's key (Groq = `gsk_…`, Gemini = `AIza…`), or a whole `.env` line. Paste only the value — the server strips a leading `NAME=` but a valid key must start with `gsk_`/`AIza` |
| `Could not reach <provider> to verify the key` | No network egress from the Worker to the provider (502) |
| SQLite error `table \`provider_credentials\` does not exist` / migration error | Local D1 predates the fork — reset it (see §2 note above) |
| `401 UNAUTHENTICATED` | No session cookie — sign in first |
| `400 NO_CREDENTIAL` | You haven't connected a key for that model's provider |
| `404 MODEL_NOT_FOUND` | Model not in the seeded catalog — use an id from `GET /api/models` |
| Empty completion content | Reasoning models may spend the `max_tokens` budget on hidden reasoning — raise `max_tokens` or use `gemini-flash-lite-latest` |

## Not in this POC

Live free-tier probing, routing/scoring, failover, request-scoped (no-store)
keys, external vaults, other providers, and per-tool/binary parts. See the
`byokfree` ADRs 0001/0002 for the custody roadmap.
