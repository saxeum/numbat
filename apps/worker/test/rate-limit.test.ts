import { Hono, type MiddlewareHandler } from "hono";
import { describe, expect, it } from "vitest";

import { errorHandler } from "../src/api/middleware/error";
import { authRateLimit, userRateLimit } from "../src/api/middleware/rate-limit";
import type { AppEnv } from "../src/api/types";
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

function limiter(success: boolean, keys: string[] = []): RateLimit {
  return {
    limit: async ({ key }: { key: string }) => {
      keys.push(key);
      return { success };
    },
  } as unknown as RateLimit;
}

function miniApp(
  middleware: MiddlewareHandler<AppEnv>,
  before?: MiddlewareHandler<AppEnv>,
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  if (before) app.use("*", before);
  app.use("*", middleware);
  app.get("/", (c) => c.text("ok"));
  app.onError(errorHandler);
  return app;
}

describe("auth rate limiting", () => {
  it("keys by client IP and rejects with 429", async () => {
    const keys: string[] = [];
    const app = miniApp(authRateLimit);

    const res = await app.request(
      "https://foonix.net/",
      { headers: { "cf-connecting-ip": "203.0.113.9" } },
      { ...baseEnv, AUTH_RATE_LIMITER: limiter(false, keys) } as unknown as Env,
    );

    expect(res.status).toBe(429);
    expect(keys).toEqual(["auth:203.0.113.9"]);
  });

  it("ignores the spoofable x-forwarded-for header", async () => {
    const keys: string[] = [];
    const app = miniApp(authRateLimit);

    await app.request(
      "https://foonix.net/",
      { headers: { "x-forwarded-for": "198.51.100.7" } },
      { ...baseEnv, AUTH_RATE_LIMITER: limiter(true, keys) } as unknown as Env,
    );

    expect(keys).toEqual(["auth:unknown"]);
  });

  it("is a no-op without the binding", async () => {
    const res = await miniApp(authRateLimit).request(
      "https://foonix.net/",
      undefined,
      baseEnv,
    );
    expect(res.status).toBe(200);
  });

  it("is a no-op in development", async () => {
    const app = miniApp(authRateLimit);

    const res = await app.request("https://foonix.net/", undefined, {
      ...baseEnv,
      ENVIRONMENT: "development",
      AUTH_RATE_LIMITER: limiter(false),
    } as unknown as Env);

    expect(res.status).toBe(200);
  });
});

describe("per-user rate limiting", () => {
  it("keys by user id and rejects with 429", async () => {
    const keys: string[] = [];
    const withUser: MiddlewareHandler<AppEnv> = async (c, next) => {
      c.set("userId", "user-42");
      await next();
    };
    const app = miniApp(userRateLimit, withUser);

    const res = await app.request("https://foonix.net/", undefined, {
      ...baseEnv,
      USER_RATE_LIMITER: limiter(false, keys),
    } as unknown as Env);

    expect(res.status).toBe(429);
    expect(keys).toEqual(["user:user-42"]);
  });

  it("does not consume a bucket when unauthenticated", async () => {
    const keys: string[] = [];
    const app = miniApp(userRateLimit);

    const res = await app.request("https://foonix.net/", undefined, {
      ...baseEnv,
      USER_RATE_LIMITER: limiter(true, keys),
    } as unknown as Env);

    expect(res.status).toBe(200);
    expect(keys).toEqual([]);
  });
});
