import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("responds 200 with { ok: true }", async () => {
    const res = await SELF.fetch("https://foonix.net/api/health");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("does not expose the API outside /api", async () => {
    const res = await SELF.fetch("https://foonix.net/health");

    expect(res.status).toBe(404);
  });
});
