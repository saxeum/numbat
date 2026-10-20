import type { Health } from "@numbat/api";
import { Hono } from "hono";

import type { AppEnv } from "../types";

export const health = new Hono<AppEnv>();

health.get("/", async (c) => {
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
  } satisfies Health;

  return ok ? c.json(body, 200) : c.json(body, 503);
});
