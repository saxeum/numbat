import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";

import openapi from "../openapi.json";
import { requireSessionPage } from "./api/middleware/auth";
import { errorHandler, notFoundHandler } from "./api/middleware/error";
import { logger } from "./api/middleware/logger";
import { rateLimit } from "./api/middleware/rate-limit";
import { requestId } from "./api/middleware/request-id";
import { securityHeaders } from "./api/middleware/security";
import { catalog } from "./api/routes/catalog";
import { chat } from "./api/routes/chat";
import { conversations } from "./api/routes/conversations";
import { credentials } from "./api/routes/credentials";
import { health } from "./api/routes/health";
import { keys } from "./api/routes/keys";
import { models } from "./api/routes/models";
import { reports } from "./api/routes/reports";
import type { AppEnv } from "./api/types";
import { createAuth } from "./auth";
import { validateEnv } from "./config";
import { executeReport } from "./reports/execute";

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

  // Rate limit the whole API surface (generous: 120 req/min/IP per location).
  api.use("*", rateLimit);

  // Better Auth handler (library-owned routes; not part of our OpenAPI spec).
  api.all("/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

  api.route("/health", health);
  api.route("/credentials", credentials);
  api.route("/models", models);
  api.route("/reports", reports);
  api.route("/chat", chat);
  api.route("/conversations", conversations);
  api.route("/keys", keys);
  // Internal ops route (shared-token gated); not part of the public API.
  api.route("/catalog", catalog);
  // Generated from openapi/openapi.yaml (source of truth) — see docs/openapi-plan.md.
  // Authenticated only: browser navigations are redirected to sign-in.
  api.use("/openapi.json", requireSessionPage);
  api.use("/docs", requireSessionPage);
  api.get("/openapi.json", (c) => c.json(openapi));
  api.get("/docs", swaggerUI({ url: "/api/openapi.json" }));

  app.route("/api", api);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
  // Probe reports run here rather than in the request path: a report lists and
  // probes every model, which can exceed the response-lifetime waitUntil cap.
  async queue(batch: MessageBatch<{ runId: string }>, env: Env) {
    for (const message of batch.messages) {
      try {
        await executeReport(env, message.body.runId);
        message.ack();
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            type: "report-consumer",
            runId: message.body.runId,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, { runId: string }>;
