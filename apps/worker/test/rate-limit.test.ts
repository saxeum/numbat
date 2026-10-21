import { describe, expect, it } from "vitest";

import { createApp } from "../src/index";

const baseEnv = {
  ENVIRONMENT: "production",
  APP_VERSION: "0.0.0",
  BETTER_AUTH_URL: "http://localhost:5173",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  DB: {} as D1Database,
} as unknown as Env;

function envWithRateLimiter(success: boolean): Env {
  return {
    ...baseEnv,
    API_RATE_LIMITER: {
      limit: async () => ({ success }),
    } as unknown as RateLimit,
  };
}

describe("rate limiting", () => {
  it("returns a 429 envelope when the limiter denies", async () => {
    const res = await createApp().request(
      "https://foonix.net/api/health",
      undefined,
      envWithRateLimiter(false),
    );

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
  });

  it("passes through when the limiter allows", async () => {
    // `/api/models` is auth-gated, so a 401 (not 429) proves the limiter let
    // the request reach the route.
    const res = await createApp().request(
      "https://foonix.net/api/models",
      undefined,
      envWithRateLimiter(true),
    );

    expect(res.status).toBe(401);
  });
});
