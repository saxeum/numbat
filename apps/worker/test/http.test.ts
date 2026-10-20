import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { AppError } from "../src/api/middleware/error";
import { EnvSchema } from "../src/config";
import { createApp } from "../src/index";

const env = {
  ENVIRONMENT: "production",
  APP_VERSION: "0.0.0",
  DB: {} as D1Database,
} satisfies Env;

describe("error envelope", () => {
  it("wraps unknown routes and echoes the request id", async () => {
    const res = await SELF.fetch("https://foonix.net/api/missing");

    expect(res.status).toBe(404);
    const requestId = res.headers.get("x-request-id");
    expect(requestId).toBeTruthy();

    const body = (await res.json()) as {
      error: { code: string; requestId?: string };
    };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBe(requestId);
  });

  it("maps AppError to its status and code", async () => {
    const app = createApp();
    app.get("/api/_app-error", () => {
      throw new AppError(418, "TEAPOT", "short and stout");
    });

    const res = await app.request(
      "https://foonix.net/api/_app-error",
      undefined,
      env,
    );

    expect(res.status).toBe(418);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "TEAPOT", message: "short and stout" },
    });
  });

  it("does not leak details of unknown errors", async () => {
    const app = createApp();
    app.get("/api/_boom", () => {
      throw new Error("do-not-leak");
    });

    const res = await app.request(
      "https://foonix.net/api/_boom",
      undefined,
      env,
    );
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(text).toContain("INTERNAL_ERROR");
    expect(text).not.toContain("do-not-leak");
  });
});

describe("security headers", () => {
  it("sets hardening headers on API responses", async () => {
    const res = await SELF.fetch("https://foonix.net/api/health");

    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("strict-transport-security")).toContain(
      "max-age=31536000",
    );
  });
});

describe("environment config", () => {
  it("validates the environment enum", () => {
    expect(EnvSchema.safeParse({}).success).toBe(false);
    expect(EnvSchema.safeParse({ ENVIRONMENT: "nope" }).success).toBe(false);
    expect(EnvSchema.safeParse({ ENVIRONMENT: "production" }).success).toBe(
      true,
    );
  });
});
