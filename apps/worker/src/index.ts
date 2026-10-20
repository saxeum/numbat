import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";

import openapi from "../openapi.json";
import { errorHandler, notFoundHandler } from "./api/middleware/error";
import { logger } from "./api/middleware/logger";
import { requestId } from "./api/middleware/request-id";
import { securityHeaders } from "./api/middleware/security";
import { health } from "./api/routes/health";
import { todos } from "./api/routes/todos";
import type { AppEnv } from "./api/types";
import { validateEnv } from "./config";

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    validateEnv(c.env);
    await next();
  });
  app.use("*", requestId());
  app.use("*", securityHeaders());
  app.use("*", logger());

  const api = new Hono<AppEnv>();
  api.route("/health", health);
  api.route("/todos", todos);
  // Generated from openapi/openapi.yaml (source of truth) — see docs/openapi-plan.md.
  api.get("/openapi.json", (c) => c.json(openapi));
  api.get("/docs", swaggerUI({ url: "/api/openapi.json" }));

  app.route("/api", api);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}

export default createApp();
