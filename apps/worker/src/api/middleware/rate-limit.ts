import { createMiddleware } from "hono/factory";

import type { AppEnv } from "../types";
import { AppError } from "./error";

/**
 * Rate limits `/api/*` using Cloudflare's Rate Limiting API binding (counted per
 * Cloudflare location). The binding is absent locally and in tests, so we skip
 * when it's missing — tests inject a stub to exercise the 429 path.
 */
export const rateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const limiter = c.env.API_RATE_LIMITER as RateLimit | undefined;
  if (!limiter) {
    await next();
    return;
  }

  const key =
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for") ??
    "unknown";

  const { success } = await limiter.limit({ key });
  if (!success) {
    throw new AppError(429, "RATE_LIMITED", "Too many requests — slow down");
  }

  await next();
});
