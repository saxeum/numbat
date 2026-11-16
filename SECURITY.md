# Security policy

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private advisory channel:
**Security → Advisories → Report a vulnerability**
(<https://github.com/saxeum/numbat/security/advisories/new>).

If that page is unavailable, open an issue containing only the words
"security contact requested" and no technical detail; a maintainer will reply with a private channel.

Please include the affected route or file, the version or commit, reproduction steps, and what an
attacker gains. We aim to acknowledge within 3 working days.

## Scope

This service is a **BYOK gateway**: users store third-party provider API keys here, encrypted at rest,
and the service proxies requests on their behalf. The highest-value areas are therefore:

- **Credential handling** — envelope encryption of stored provider keys (`BYOK_KEK`), key rotation and
  versioning, any path that could return a plaintext key, and anything that could read another user's
  credential.
- **Authentication and authorisation** — session handling (Better Auth), owner-scoped queries, and any
  route that returns another user's conversations, reports, or credentials.
- **Prompt and response logging** — provider bodies are truncated and stored when
  `GATEWAY_LLM_LOGGING` is on. It is off in the deployed configuration; anything that causes a
  key or a full body to be logged is in scope.
- **The public API surface** — `/api/*`, rate limiting, and the OpenAPI spec at `/api/docs`.

Out of scope: findings that require a compromised provider account, denial of service by volume
alone, and reports produced only by an automated scanner without a demonstrated impact.

## Supported versions

The project is pre-1.0 and ships from `main`. Only the most recent deployment is supported; there are
no maintained release branches.

## What we ask

Give us a reasonable window to fix the issue before public disclosure. We will credit you in the
advisory unless you ask us not to.
