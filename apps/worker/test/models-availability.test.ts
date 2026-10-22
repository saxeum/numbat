import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

const base = "https://foonix.net/api";
const json = { "content-type": "application/json" };

async function signUp(email: string): Promise<string> {
  const res = await SELF.fetch(base + "/auth/sign-up/email", {
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

async function userIdFor(email: string): Promise<string> {
  const row = await env.DB.prepare("SELECT id FROM user WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  return row!.id;
}

async function createCredential(
  cookie: string,
  provider: string,
  apiKey: string,
): Promise<void> {
  const res = await SELF.fetch(base + "/credentials", {
    method: "POST",
    headers: { ...json, cookie },
    body: JSON.stringify({ provider, apiKey }),
  });
  expect(res.status).toBe(201);
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

function stubUpstream() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes(":generateContent")) {
        return new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: "pong" }] }, finishReason: "STOP" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/chat/completions")) {
        return new Response(
          JSON.stringify({
            id: "c",
            object: "chat.completion",
            model: "m",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "pong" },
                finish_reason: "stop",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200 });
    }),
  );
}

interface Seed {
  provider: string;
  modelId: string;
  available: boolean;
  lastOkAt: string | null;
}

async function seedAvailability(ownerId: string, rows: Seed[]): Promise<void> {
  const checkedAt = new Date().toISOString();
  for (const row of rows) {
    await env.DB.prepare(
      "INSERT INTO model_availability (owner_id, provider, model_id, resolved_model, available, last_status, last_ok_at, last_checked_at, source_run_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)",
    )
      .bind(
        ownerId,
        row.provider,
        row.modelId,
        row.modelId,
        row.available ? 1 : 0,
        row.available ? 200 : 500,
        row.lastOkAt,
        checkedAt,
      )
      .run();
  }
}

interface ModelEntry {
  id: string;
  "x-provider": string;
  "x-available"?: boolean;
  "x-last-checked"?: string;
}

async function listModels(
  cookie: string,
  scope?: string,
): Promise<ModelEntry[]> {
  const url = base + "/models" + (scope ? "?scope=" + scope : "");
  const res = await SELF.fetch(url, { headers: { cookie } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: ModelEntry[] }).data;
}

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/models", () => {
  it("returns the global catalog before the first report", async () => {
    const cookie = await signUp("models1@example.com");

    const data = await listModels(cookie);
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((m) => m["x-available"] === undefined)).toBe(true);

    const availability = await listModels(cookie, "availability");
    expect(availability).toEqual([]);
  });

  it("scopes to fresh, available models once a report exists", async () => {
    const cookie = await signUp("models2@example.com");
    const ownerId = await userIdFor("models2@example.com");

    const catalog = await env.DB.prepare(
      "SELECT provider, model_id FROM free_models GROUP BY model_id ORDER BY model_id LIMIT 3",
    ).all<{ provider: string; model_id: string }>();
    const good = catalog.results[0]!;
    const bad = catalog.results[1]!;
    const stale = catalog.results[2]!;
    const fresh = new Date().toISOString();
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();

    await seedAvailability(ownerId, [
      {
        provider: good.provider,
        modelId: good.model_id,
        available: true,
        lastOkAt: fresh,
      },
      {
        provider: bad.provider,
        modelId: bad.model_id,
        available: false,
        lastOkAt: null,
      },
      {
        provider: stale.provider,
        modelId: stale.model_id,
        available: true,
        lastOkAt: old,
      },
    ]);

    const availability = await listModels(cookie, "availability");
    expect(availability.map((m) => m.id)).toEqual([good.model_id]);
    expect(availability[0]!["x-available"]).toBe(true);

    // Default follows availability once the user has rows.
    const dflt = await listModels(cookie);
    expect(dflt.map((m) => m.id)).toEqual([good.model_id]);

    const scoped = await listModels(cookie, "catalog");
    const total = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM free_models",
    ).first<{ n: number }>();
    expect(scoped.length).toBe(total!.n);
    expect(scoped.find((m) => m.id === good.model_id)?.["x-available"]).toBe(
      true,
    );
    expect(scoped.find((m) => m.id === bad.model_id)?.["x-available"]).toBe(
      false,
    );
    expect(scoped.find((m) => m.id === stale.model_id)?.["x-available"]).toBe(
      false,
    );
  });
});

describe("gateway availability", () => {
  function completions(cookie: string, model: string, provider?: string) {
    return SELF.fetch(base + "/chat/completions", {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hi" }],
        ...(provider ? { provider } : {}),
      }),
    });
  }

  it("rejects a model outside the caller's availability", async () => {
    const cookie = await signUp("gw1@example.com");
    const ownerId = await userIdFor("gw1@example.com");
    stubUpstream();
    await createCredential(cookie, "groq", "gsk_test");
    await seedAvailability(ownerId, [
      {
        provider: "groq",
        modelId: "some/available-model",
        available: true,
        lastOkAt: new Date().toISOString(),
      },
    ]);

    const res = await completions(cookie, "not/available");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("MODEL_NOT_AVAILABLE");
  });

  it("routes an available model", async () => {
    const cookie = await signUp("gw2@example.com");
    const ownerId = await userIdFor("gw2@example.com");
    stubUpstream();
    await createCredential(cookie, "groq", "gsk_test");
    await seedAvailability(ownerId, [
      {
        provider: "groq",
        modelId: "openai/gpt-oss-20b",
        available: true,
        lastOkAt: new Date().toISOString(),
      },
    ]);

    const res = await completions(cookie, "openai/gpt-oss-20b");
    expect(res.status).toBe(200);
  });

  it("falls back to the catalog before the first report", async () => {
    const cookie = await signUp("gw3@example.com");
    const row = await env.DB.prepare(
      "SELECT provider, model_id FROM free_models LIMIT 1",
    ).first<{ provider: string; model_id: string }>();
    stubUpstream();
    await createCredential(cookie, row!.provider, "test-key");

    const res = await completions(cookie, row!.model_id);
    expect(res.status).toBe(200);
  });

  it("still honours an explicit provider hint", async () => {
    const cookie = await signUp("gw4@example.com");
    const ownerId = await userIdFor("gw4@example.com");
    stubUpstream();
    await createCredential(cookie, "groq", "gsk_test");
    await seedAvailability(ownerId, [
      {
        provider: "groq",
        modelId: "irrelevant",
        available: true,
        lastOkAt: new Date().toISOString(),
      },
    ]);

    const res = await completions(cookie, "any-model-name", "groq");
    expect(res.status).toBe(200);
  });

  it("strips a stored `models/` prefix from the gemini upstream URL", async () => {
    const cookie = await signUp("gw5@example.com");
    const ownerId = await userIdFor("gw5@example.com");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = urlOf(input);
        urls.push(url);
        if (url.includes(":generateContent")) {
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: { parts: [{ text: "pong" }] },
                  finishReason: "STOP",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("{}", { status: 200 });
      }),
    );
    await createCredential(cookie, "gemini", "AQ.test");
    await seedAvailability(ownerId, [
      {
        provider: "gemini",
        modelId: "models/gemini-2.5-flash",
        available: true,
        lastOkAt: new Date().toISOString(),
      },
    ]);

    const res = await completions(cookie, "models/gemini-2.5-flash");
    expect(res.status).toBe(200);
    expect(urls.find((u) => u.includes(":generateContent"))).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
  });

  it("matches a bare request against a stored `models/` prefix", async () => {
    const cookie = await signUp("gw6@example.com");
    const ownerId = await userIdFor("gw6@example.com");
    stubUpstream();
    await createCredential(cookie, "gemini", "AQ.test");
    await seedAvailability(ownerId, [
      {
        provider: "gemini",
        modelId: "models/gemini-2.5-flash",
        available: true,
        lastOkAt: new Date().toISOString(),
      },
    ]);

    const res = await completions(cookie, "gemini-2.5-flash");
    expect(res.status).toBe(200);
  });
});
