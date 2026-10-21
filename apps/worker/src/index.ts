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
import type { AppEnv } from "./api/types";
import { createAuth } from "./auth";
import { runCatalogSync } from "./catalog";
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

  // Rate limit the whole API surface (generous: 120 req/min/IP per location).
  api.use("*", rateLimit);

  // Better Auth handler (library-owned routes; not part of our OpenAPI spec).
  api.all("/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

  api.route("/health", health);
  api.route("/credentials", credentials);
  api.route("/models", models);
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
  /** Nightly free-model catalog refresh (KAN-44). */
  scheduled(event, env, ctx) {
    ctx.waitUntil(
      runCatalogSync(env, { trigger: event.cron ?? "cron" }).then((summary) => {
        console.log("catalog sync run finished", {
          runId: summary.runId,
          status: summary.status,
          providers: summary.providers.length,
        });
      }),
    );
  },
} satisfies ExportedHandler<Env>;
