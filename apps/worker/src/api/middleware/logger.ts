import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../types";

export const logger = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const start = Date.now();
  const requestId = c.get("requestId");
  const method = c.req.method;
  const path = c.req.path;

  console.log(
    JSON.stringify({
      level: "info",
      type: "request",
      requestId,
      method,
      path,
      cfRay: c.req.header("cf-ray"),
      userAgent: c.req.header("user-agent"),
    }),
  );

  await next();

  const status = c.res.status;
  const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

  console.log(
    JSON.stringify({
      level,
      type: "response",
      requestId,
      method,
      path,
      status,
      durationMs: Date.now() - start,
    }),
  );
};
