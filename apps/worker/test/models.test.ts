import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const base = "https://foonix.net/api/models";
const authBase = "https://foonix.net/api/auth";
const json = { "content-type": "application/json" };

async function signUp(email: string): Promise<string> {
  const res = await SELF.fetch(`${authBase}/sign-up/email`, {
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

interface ModelRow {
  id: string;
  object: string;
  "x-provider": string;
  "x-free": boolean;
}

describe("models (authenticated)", () => {
  it("rejects unauthenticated access", async () => {
    const res = await SELF.fetch(base);
    expect(res.status).toBe(401);
  });

  it("returns the seeded free-tier catalog", async () => {
    const cookie = await signUp("models@example.com");
    const res = await SELF.fetch(base, { headers: { cookie } });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { object: string; data: ModelRow[] };
    expect(body.object).toBe("list");

    const providers = new Set(body.data.map((m) => m["x-provider"]));
    expect(providers.has("groq")).toBe(true);
    expect(providers.has("gemini")).toBe(true);
    expect(body.data.every((m) => m["x-free"] === true)).toBe(true);
    expect(body.data.map((m) => m.id)).toContain("openai/gpt-oss-20b");
  });
});
