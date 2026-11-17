import { createMiddleware } from "hono/factory";

import type { AppEnv } from "../types";
import { AppError } from "./error";

/**
 * Rate limits use Cloudflare's Rate Limiting API bindings, counted per
 * Cloudflare location. All three layers are **disabled when
 * `ENVIRONMENT=development`** — that covers local `wrangler dev` and the
 * Playwright suite, where every request shares one client address and a
 * production budget would throttle the tests themselves. Tests inject stubs
 * against a production env to exercise the rejection path.
 *
 * `cf-connecting-ip` is set by Cloudflare for every production request. There
 * is deliberately no `x-forwarded-for` fallback: that header is client
 * controlled and would let a caller choose its own bucket.
 */
function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? "unknown";
}

/** Local development and E2E are never rate limited. */
function skip(env: Env): boolean {
  return env.ENVIRONMENT === "development";
}

/** Generous per-IP limit for the whole API surface. */
export const rateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const limiter = c.env.API_RATE_LIMITER;
  if (skip(c.env) || !limiter) {
    await next();
    return;
  }

  const { success } = await limiter.limit({ key: clientIp(c.req.raw.headers) });
  if (!success) {
    throw new AppError(429, "RATE_LIMITED", "Too many requests — slow down");
  }

  await next();
});

/**
 * Stricter per-IP limit for `/api/auth/*`. Sign-in is the credential-stuffing
 * surface, and it is cheap to retry, so it gets its own bucket instead of the
 * generous global one.
 */
export const authRateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const limiter = c.env.AUTH_RATE_LIMITER;
  if (skip(c.env) || !limiter) {
    await next();
    return;
  }

  const { success } = await limiter.limit({
    key: `auth:${clientIp(c.req.raw.headers)}`,
  });
  if (!success) {
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Too many sign-in attempts — slow down",
    );
  }

  await next();
});

/**
 * Per-user limit for routes that spend provider quota. Must run after auth has
 * set `userId`; it is a no-op when the requester is not authenticated yet.
 */
export const userRateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const limiter = c.env.USER_RATE_LIMITER;
  const userId = c.get("userId");
  if (skip(c.env) || !limiter || !userId) {
    await next();
    return;
  }

  const { success } = await limiter.limit({ key: `user:${userId}` });
  if (!success) {
    throw new AppError(429, "RATE_LIMITED", "Too many requests — slow down");
  }

  await next();
});
