import type { HealthResponse } from "@numbat/shared";
import { Hono } from "hono";

export const health = new Hono<{ Bindings: Env }>();

health.get("/", (c) => c.json({ ok: true } satisfies HealthResponse));
