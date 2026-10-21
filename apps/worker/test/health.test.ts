import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const json = { "content-type": "application/json" };

async function signUp(email: string): Promise<string> {
  const res = await SELF.fetch("https://foonix.net/api/auth/sign-up/email", {
    method: "POST",
    headers: json,
    body: JSON.stringify({
      email,
      password: "password1234",
      name: "Test User",
    }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
}

describe("GET /api/health", () => {
  it("responds 200 with health details", async () => {
    const res = await SELF.fetch("https://foonix.net/api/health");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      version: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it("does not expose the API outside /api", async () => {
    const res = await SELF.fetch("https://foonix.net/health");

    expect(res.status).toBe(404);
  });
});

describe("API docs (authenticated)", () => {
  it("rejects unauthenticated spec access", async () => {
    const res = await SELF.fetch("https://foonix.net/api/openapi.json");

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("redirects unauthenticated browser navigations to sign-in", async () => {
    const res = await SELF.fetch("https://foonix.net/api/docs", {
      headers: { accept: "text/html" },
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/gateway");
  });

  it("serves the OpenAPI document when authenticated", async () => {
    const cookie = await signUp("docs-spec@example.com");
    const res = await SELF.fetch("https://foonix.net/api/openapi.json", {
      headers: { cookie },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ openapi: "3.1.0" });
  });

  it("serves Swagger UI when authenticated", async () => {
    const cookie = await signUp("docs-ui@example.com");
    const res = await SELF.fetch("https://foonix.net/api/docs", {
      headers: { cookie },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
