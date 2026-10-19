# AGENTS.md

Guidance for AI agents working in this repository.

## Rules

1. **Do not write code unless explicitly asked to do so.** No new files, edits, refactors, or generated code beyond what was requested.
2. **Do not commit code unless explicitly asked to do so.** Never run `git commit`, `git push`, or create commits/branches on your own.

## Additional Expectations

- Prefer read-only exploration (reading files, searching) before making any change.
- Ask for clarification when a request is ambiguous rather than assuming.
- If a task requires code changes, confirm the scope first and wait for explicit approval.
- Keep responses concise and show file paths clearly when referencing files.

## Project

`cf-e2e` — (project description pending).

- **Source of truth:** GitHub. Code lives under the personal account `gmtreacy`
  or the `saxeum` organization.
- **Deployment target:** Cloudflare Workers (via Wrangler).

## Verified CLI Access

### GitHub — `gh`
- `gh` at `~/.local/bin/gh` (version 2.102.0).
- Authenticated as **`gmtreacy`** (Git operations over SSH).
- Token scopes: `gist`, `read:org`, `repo`.
- Confirmed access to the **`saxeum`** org and its private repos.

### Cloudflare — `wrangler`
- `wrangler` v4.151.2 installed globally (`npm install -g wrangler`).
- Authenticated via OAuth as **<redacted-email>**.
- Account: `<redacted-email>'s Account` (`<cloudflare-account-id>`).
- Credentials stored in `~/.config/.wrangler/config/default.toml`; the access
  token refreshes automatically via the stored refresh token.
- Confirmed `workers:write`, `workers_scripts:write`, `d1:write`, `pages:write`,
  `workers_kv:write`, and more.

> Secrets (OAuth/refresh tokens) live only in the config file above. Never print,
> commit, or paste them; reference them by path.
