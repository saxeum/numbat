import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { executeReport } from "../src/reports/execute";
import { pruneOldReports } from "../src/reports/retention";

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
): Promise<{ id: string }> {
  const res = await SELF.fetch(base + "/credentials", {
    method: "POST",
    headers: { ...json, cookie },
    body: JSON.stringify({ provider, apiKey }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

/** Stubs the provider: `listModels` returns `models`, chat streams a reply. */
function stubProvider(models: string[] = ["m1"]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.endsWith("/models")) {
        return new Response(
          JSON.stringify({
            object: "list",
            data: models.map((id) => ({ id, object: "model" })),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/chat/completions")) {
        const sse =
          'data: {"model":"m1","choices":[{"delta":{"content":"pong"}}]}\n\n' +
          'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}\n\n' +
          "data:";
        return new Response(sse, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }
      return new Response("{}", { status: 200 });
    }),
  );
}

const INSERT_RUN =
  "INSERT INTO probe_runs (id, owner_id, credential_id, provider, label, status, trigger, created_at) VALUES (?, ?, ?, 'groq', NULL, 'succeeded', 'manual', ?)";

afterEach(() => vi.unstubAllGlobals());

describe("report limits (KAN-53)", () => {
  it("caps the number of probed models at REPORT_PROBE_LIMIT", async () => {
    const cookie = await signUp("limits1@example.com");
    stubProvider(["m1", "m2", "m3"]);
    const cred = await createCredential(cookie, "groq", "gsk_test");
    const ownerId = await userIdFor("limits1@example.com");

    const runId = crypto.randomUUID();
    await env.DB.prepare(INSERT_RUN)
      .bind(runId, ownerId, cred.id, new Date().toISOString())
      .run();

    await executeReport(
      { ...env, REPORT_PROBE_LIMIT: "2" } as unknown as Env,
      runId,
    );

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM probe_run_models WHERE run_id = ?",
    )
      .bind(runId)
      .first<{ n: number }>();
    expect(count!.n).toBe(2);
  });

  it("rejects report starts beyond REPORT_RATE_LIMIT_PER_HOUR", async () => {
    const cookie = await signUp("limits2@example.com");
    stubProvider(["m1"]);
    const cred = await createCredential(cookie, "groq", "gsk_test");
    const ownerId = await userIdFor("limits2@example.com");

    const now = new Date().toISOString();
    for (let i = 0; i < 10; i += 1) {
      await env.DB.prepare(INSERT_RUN)
        .bind(crypto.randomUUID(), ownerId, cred.id, now)
        .run();
    }

    const res = await SELF.fetch(base + "/reports", {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({ credentialId: cred.id }),
    });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
  });
});

describe("report retention (KAN-53)", () => {
  it("prunes runs older than the window and cascades their models", async () => {
    const cookie = await signUp("limits3@example.com");
    stubProvider(["m1"]);
    const cred = await createCredential(cookie, "groq", "gsk_test");
    const ownerId = await userIdFor("limits3@example.com");

    const oldId = crypto.randomUUID();
    const recentId = crypto.randomUUID();
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const recent = new Date().toISOString();

    await env.DB.prepare(INSERT_RUN).bind(oldId, ownerId, cred.id, old).run();
    await env.DB.prepare(INSERT_RUN)
      .bind(recentId, ownerId, cred.id, recent)
      .run();
    await env.DB.prepare(
      "INSERT INTO probe_run_models (id, run_id, owner_id, provider, model_id, kind, attempted, ok, created_at) VALUES (?, ?, ?, 'groq', 'm1', 'chat', 1, 1, ?)",
    )
      .bind(crypto.randomUUID(), oldId, ownerId, old)
      .run();

    const result = await pruneOldReports(env as unknown as Env);
    expect(result.deleted).toBe(1);

    const remaining = await env.DB.prepare(
      "SELECT id FROM probe_runs WHERE owner_id = ?",
    )
      .bind(ownerId)
      .all<{ id: string }>();
    expect(remaining.results.map((row) => row.id)).toEqual([recentId]);

    const models = await env.DB.prepare(
      "SELECT id FROM probe_run_models WHERE run_id = ?",
    )
      .bind(oldId)
      .all();
    expect(models.results).toHaveLength(0);
  });
});
