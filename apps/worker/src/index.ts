import { OpenAPIHono } from "@hono/zod-openapi";
import { Hono } from "hono";

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

  const api = new OpenAPIHono<AppEnv>();
  api.route("/health", health);
  api.route("/todos", todos);
  api.doc("/openapi.json", {
    openapi: "3.0.0",
    info: { title: "Numbat API", version: "1.0.0" },
  });

  app.route("/api", api);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}

export default createApp();
