import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../types";

/**
 * Security headers for the API Worker. The web Worker (static assets) sets its
 * own via `apps/web/public/_headers`.
 */
export const securityHeaders =
  (): MiddlewareHandler<AppEnv> => async (c, next) => {
    await next();

    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    c.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  };
