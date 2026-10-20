import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { HealthResponse } from "@numbat/shared";

import type { AppEnv } from "../types";

export const health = new OpenAPIHono<AppEnv>();

const healthRoute = createRoute({
  method: "get",
  path: "/",
  summary: "Service health",
  responses: {
    200: {
      description: "Service is healthy",
      content: { "application/json": { schema: HealthResponse } },
    },
  },
});

health.openapi(healthRoute, (c) =>
  c.json(
    {
      ok: true,
      timestamp: new Date().toISOString(),
      version: c.env.APP_VERSION,
      // When D1 lands, add a `database` check here and return 503 on failure.
    } satisfies HealthResponse,
    200,
  ),
);
