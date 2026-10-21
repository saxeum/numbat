# Creating the Google OAuth client (numbat)

Step-by-step guide to create the Google Cloud OAuth client that numbat uses for
sign-in (Better Auth's Google provider). Companion to
[`auth-plan.md`](auth-plan.md).

- **Redirect URIs are exact — no wildcards.** They must match character-for-character.
- Scopes used are **non-sensitive** (`openid`, `email`, `profile`), so no Google
  verification review is required.
- Per-PR preview hosts (`pr-<n>-…workers.dev`) are dynamic and **cannot** be
  registered — auth runs on **local + production** only.

---

## 1. Create (or pick) a Google Cloud project

1. Go to <https://console.cloud.google.com/>.
2. Top bar → project selector → **New project** (e.g. `numbat`) → **Create**.
3. Make sure the new project is selected.

## 2. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. **User type:** **External** → **Create**.
3. Fill in:
   - **App name:** `numbat`
   - **User support email:** your email
   - **Developer contact information:** your email
   - Logo/domain optional.
4. **Scopes → Add or remove scopes:** add `openid`, `email`, `profile`
   (`.../auth/userinfo.email`, `.../auth/userinfo.profile`).
5. **Test users:** while the app is in **Testing**, only listed users can sign in.
   Add your own Google account now (add teammates later as needed).
6. Save. (You can leave the app in **Testing**; it works for up to 100 test users.
   **Publish** it when you want anyone to sign in — still no verification needed
   for these scopes.)

## 3. Create the OAuth client ID

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type:** **Web application**.
3. **Name:** `numbat web`.
4. **Authorized JavaScript origins** (add both):
   ```
   http://localhost:5173
   https://foonix.net
   ```
5. **Authorized redirect URIs** (add both, exact):
   ```
   http://localhost:5173/api/auth/callback/google
   https://foonix.net/api/auth/callback/google
   ```
6. **Create**. Copy the **Client ID** and **Client secret** (the secret is shown
   then; you can also re-view it later from the credentials page).

> The callback path `/api/auth/callback/google` is Better Auth's default and
> matches where we mount the auth handler (`apps/worker`).

## 4. Wire the values into numbat

Values needed (all environments):

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from step 3 |
| `GOOGLE_CLIENT_SECRET` | from step 3 |
| `BETTER_AUTH_SECRET` | a random secret — `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | the app origin: `http://localhost:5173` (local) / `https://foonix.net` (prod) |

**Local** (`apps/worker/.dev.vars`, gitignored — copy from `.dev.vars.example`):

```
BETTER_AUTH_URL=http://localhost:5173
BETTER_AUTH_SECRET=<random>
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
```

**Production / staging** (never committed):

```bash
cd apps/worker
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
# BETTER_AUTH_URL is a plain var per environment (wrangler.jsonc), not a secret.
```

> Do **not** paste secrets into chat, commits, or docs. Put them in `.dev.vars`
> (local) and `wrangler secret` (remote) only.

## 5. Verify

After the auth feature is wired up:

1. `npm run dev`, open <http://localhost:5173>, click **Sign in with Google**.
2. You should be redirected to Google, then back to the app signed in.
3. If not, see troubleshooting below.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `redirect_uri_mismatch` | The redirect URI isn't registered **exactly**. Check scheme/host/port/path against step 3 (e.g. `127.0.0.1` vs `localhost`, trailing slash). |
| "Access blocked: app not verified" / user not allowed | App is in **Testing** and the account isn't a **Test user** → add it, or **Publish** the app. |
| `invalid_client` | Wrong/rotated client secret, or the secret wasn't set for that environment. |
| Works locally, fails on `foonix.net` | Production redirect URI or `BETTER_AUTH_URL` wrong; secrets not set via `wrangler secret`. |
| Preview (`pr-<n>…`) login fails | Expected — preview hosts can't be registered. Test on local/prod. |

## 7. Adding more environments/domains later

Add the new origin + `<origin>/api/auth/callback/google` to the same OAuth client
(steps 3.4–3.5), then set `BETTER_AUTH_URL` for that environment. Redirect URIs
can be edited any time; no re-verification for these scopes.
