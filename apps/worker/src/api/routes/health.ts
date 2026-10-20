import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { HealthResponse } from "@numbat/shared";

import { defaultHook } from "../openapi";
import type { AppEnv } from "../types";

export const health = new OpenAPIHono<AppEnv>({ defaultHook });

const healthRoute = createRoute({
  method: "get",
  path: "/",
  summary: "Service health",
  responses: {
    200: {
      description: "Service is healthy",
      content: { "application/json": { schema: HealthResponse } },
    },
    503: {
      description: "Service is unhealthy",
      content: { "application/json": { schema: HealthResponse } },
    },
  },
});

health.openapi(healthRoute, async (c) => {
  let database = "healthy";

  try {
    await c.env.DB.prepare("SELECT 1").first();
  } catch {
    database = "unhealthy";
  }

  const ok = database === "healthy";
  const body = {
    ok,
    timestamp: new Date().toISOString(),
    version: c.env.APP_VERSION,
    database,
  };

  return ok ? c.json(body, 200) : c.json(body, 503);
});
