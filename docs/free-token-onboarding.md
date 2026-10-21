# Getting free provider keys (Gemini, NVIDIA, Groq)

> **Published in-app at <https://foonix.net/guide>** — that public page is the
> user-facing version (the repo is private, so a GitHub link is not reachable by
> visitors). Keep the two in sync; this file is the developer/operator copy.

Foonix is a gateway for **free AI tokens**: you bring your own free-tier
provider keys, and Foonix puts them behind one OpenAI-compatible endpoint. This
guide shows how to create a free key for each supported provider and connect it.

> Free tiers and quotas change over time. Check each provider's own pricing and
> terms — Foonix does not sell tokens and cannot guarantee free quota.

## At a glance

| Provider | Create a key | Key looks like | Free tier |
|---|---|---|---|
| **Google Gemini** | <https://aistudio.google.com/app/apikey> | `AIza…` | Free daily request limits in Google AI Studio |
| **NVIDIA** | <https://build.nvidia.com> | `nvapi-…` | Free developer credits on NVIDIA NIM |
| **Groq** | <https://console.groq.com/keys> | `gsk_…` | Free, rate-limited inference on open models |

---

## 1. Google Gemini

1. Go to **Google AI Studio** → <https://aistudio.google.com/app/apikey> and sign
   in with a Google account.
2. Accept the terms if prompted (a Google Cloud project is created for you).
3. Click **Create API key**, then copy the value — it starts with `AIza`.
4. Free tier: the Gemini Flash / Flash-Lite / Pro models have free daily request
   limits. If you hit `429`, wait for the daily reset or use a different provider.

## 2. NVIDIA (NVIDIA NIM)

1. Go to **<https://build.nvidia.com>** and sign up / sign in (NVIDIA Developer
   account).
2. Open any model (for example `meta/llama-3.3-70b-instruct`) and click
   **Get API Key** (or the code sample's key button).
3. Copy the key — it starts with `nvapi-`. New developer accounts get a pool of
   free inference credits.
4. The model catalog rotates. List what your key can use:

   ```bash
   curl -s https://integrate.api.nvidia.com/v1/models \
     -H "authorization: Bearer $NVIDIA_API_KEY" |
     node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.map(m=>m.id).join('\n')))"
   ```

## 3. Groq

1. Go to **<https://console.groq.com/keys>** and sign up / sign in.
2. Click **Create API Key**, name it, and copy the value — it starts with `gsk_`.
3. Free tier: Groq is free but rate-limited (requests/tokens per minute). See the
   console for current limits.

---

## 4. Connect a key to Foonix

### Through the dashboard (easiest)

1. Open **<https://foonix.net/gateway>** and sign in.
2. Under **Provider credentials**, pick the provider, paste the key, and click
   **Add key**.
3. Foonix verifies the key against the provider, then stores it **encrypted at
   rest**. It is never shown again.

Repeat for each provider you want — you can connect all three and switch models
per request.

### Through the API

```bash
BASE=https://foonix.net
# 1) sign in and keep the session cookie (dev email/password sign-up shown)
curl -s -c /tmp/foonix.txt -X POST $BASE/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password1234","name":"You"}'

# 2) connect a key (repeat per provider)
curl -s -b /tmp/foonix.txt -X POST $BASE/api/credentials \
  -H 'content-type: application/json' \
  -d '{"provider":"nvidia","apiKey":"nvapi-…"}'
# -> 201 {"provider":"nvidia","label":"","fingerprint":"…"}
```

Valid `provider` values: `gemini`, `nvidia`, `groq`.

---

## 5. Send a request

List the seeded models, then call the gateway:

```bash
curl -s -b /tmp/foonix.txt $BASE/api/models | head -c 400; echo

curl -s -b /tmp/foonix.txt -X POST $BASE/api/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"meta/llama-3.3-70b-instruct",
       "messages":[{"role":"user","content":"Reply with exactly: pong"}],
       "max_tokens":64}'
```

For scripts and SDKs, create an **API token** in the dashboard (shown once) and
use it as `Authorization: Bearer nbk_…`. Any OpenAI client works:

```python
from openai import OpenAI

client = OpenAI(base_url="https://foonix.net/api", api_key="nbk_…")
print(
    client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[{"role": "user", "content": "pong"}],
    ).choices[0].message.content
)
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `The <provider> key was rejected by the provider (HTTP 401)` | Wrong key, wrong provider selected, or you pasted an entire `.env` line. Paste only the value (`AIza…`, `nvapi-…`, `gsk_…`). |
| `Could not reach <provider> to verify the key` | No network egress to the provider from the Worker. Retry. |
| `400 NO_CREDENTIAL` | No key connected for that model's provider — add one first. |
| `404 MODEL_NOT_FOUND` | Model id not in the seeded catalog. Use an id from `GET /api/models`, or pass an explicit `"provider"` alongside the model. |
| `429` from a provider | You hit that provider's free-tier rate limit. Wait, or switch to another connected provider/model. |
| NVIDIA model 404s | NVIDIA rotates its catalog — list ids with the `curl` command in §2 and use one of those (pass `"provider":"nvidia"` if it isn't seeded). |

## Notes

- Keys are **per provider** and stored **encrypted** (envelope encryption); only
  ciphertext is written to the database.
- Connect more than one provider so you can fall back when one is rate-limited.
- The catalog is refreshed **nightly** by a cron job that lists each provider's
  models, probes anything new, and writes the result to `free_models` — see
  [`free-model-discovery-cron.md`](free-model-discovery-cron.md). The
  `"provider"` field on a chat request still lets you use any model id the
  provider accepts, even if the sync has not picked it up yet.
