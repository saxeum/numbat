import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

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

  it("serves the OpenAPI document", async () => {
    const res = await SELF.fetch("https://foonix.net/api/openapi.json");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ openapi: "3.1.0" });
  });

  it("serves Swagger UI docs", async () => {
    const res = await SELF.fetch("https://foonix.net/api/docs");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("does not expose the API outside /api", async () => {
    const res = await SELF.fetch("https://foonix.net/health");

    expect(res.status).toBe(404);
  });
});
