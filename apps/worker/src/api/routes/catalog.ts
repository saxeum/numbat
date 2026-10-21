import { Hono } from "hono";

import { runCatalogSync } from "../../catalog";
import { isProviderId, type ProviderId } from "../../gateway/providers";
import { AppError } from "../middleware/error";
import type { AppEnv } from "../types";

export const catalog = new Hono<AppEnv>();

/** Constant-time string compare (a length mismatch short-circuits). */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

/**
 * Internal ops trigger for the catalog sync: used to dry-run and validate a
 * refresh during rollout, and to re-sync on demand. Guarded by a shared token
 * (`CATALOG_ADMIN_TOKEN`) rather than a session because it is not part of the
 * public API — it is intentionally absent from `openapi.yaml`.
 *
 * `?provider=<id>` restricts the run to a single provider.
 */
catalog.post("/refresh", async (c) => {
  const vars = c.env as unknown as Record<string, string | undefined>;
  const expected = vars.CATALOG_ADMIN_TOKEN;

  if (!expected) {
    throw new AppError(
      503,
      "CATALOG_DISABLED",
      "CATALOG_ADMIN_TOKEN is not configured",
    );
  }
  if (!timingSafeEqual(c.req.header("x-catalog-token") ?? "", expected)) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid catalog token");
  }

  const requested = c.req.query("provider");
  let provider: ProviderId | undefined;
  if (requested) {
    if (!isProviderId(requested)) {
      throw new AppError(400, "BAD_REQUEST", `Unknown provider: ${requested}`);
    }
    provider = requested;
  }

  const summary = await runCatalogSync(c.env, {
    trigger: "manual",
    // A manual run must work while the cron is still switched off.
    force: true,
    provider,
  });

  return c.json(summary, 200);
});
