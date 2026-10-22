import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { executeReport } from "../src/reports/execute";

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

function stubProvider() {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = urlOf(input);
    if (url.endsWith("/models")) {
      return new Response(
        JSON.stringify({
          object: "list",
          data: [{ id: "m1", object: "model" }],
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
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

async function waitForReport(cookie: string, id: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const res = await SELF.fetch(base + "/reports/" + id, {
      headers: { cookie },
    });
    const body = (await res.json()) as { report: { status: string } };
    if (body.report.status === "succeeded" || body.report.status === "failed") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("report did not finish");
}

describe("reports", () => {
  it("creates, lists, renames and deletes a report", async () => {
    const cookie = await signUp("reports1@example.com");
    stubProvider();
    const cred = await createCredential(cookie, "groq", "gsk_test");

    const created = await SELF.fetch(base + "/reports", {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({ credentialId: cred.id, label: "nightly" }),
    });
    expect(created.status).toBe(202);
    const body = (await created.json()) as {
      report: { id: string; status: string; provider: string; label: string };
    };
    expect(body.report.status).toBe("queued");
    expect(body.report.provider).toBe("groq");
    expect(body.report.label).toBe("nightly");

    const list = (await (
      await SELF.fetch(base + "/reports", { headers: { cookie } })
    ).json()) as { reports: unknown[] };
    expect(list.reports).toHaveLength(1);

    await waitForReport(cookie, body.report.id);
    const detail = (await (
      await SELF.fetch(base + "/reports/" + body.report.id, {
        headers: { cookie },
      })
    ).json()) as { report: { models: { modelId: string }[] } };
    expect(detail.report.models).toHaveLength(1);
    expect(detail.report.models[0]!.modelId).toBe("m1");

    const patched = await SELF.fetch(base + "/reports/" + body.report.id, {
      method: "PATCH",
      headers: { ...json, cookie },
      body: JSON.stringify({ label: "renamed" }),
    });
    expect(patched.status).toBe(200);
    expect(
      ((await patched.json()) as { report: { label: string } }).report.label,
    ).toBe("renamed");

    const deleted = await SELF.fetch(base + "/reports/" + body.report.id, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(deleted.status).toBe(204);

    const gone = await SELF.fetch(base + "/reports/" + body.report.id, {
      headers: { cookie },
    });
    expect(gone.status).toBe(404);
  });

  it("rejects unauthenticated and unknown-credential requests", async () => {
    const anon = await SELF.fetch(base + "/reports", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ credentialId: "x" }),
    });
    expect(anon.status).toBe(401);

    const cookie = await signUp("reports2@example.com");
    const missing = await SELF.fetch(base + "/reports", {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({ credentialId: "does-not-exist" }),
    });
    expect(missing.status).toBe(404);

    const bad = await SELF.fetch(base + "/reports", {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({ label: "no credential" }),
    });
    expect(bad.status).toBe(400);
  });

  it("blocks a second run while one is active", async () => {
    const cookie = await signUp("reports3@example.com");
    stubProvider();
    const cred = await createCredential(cookie, "groq", "gsk_test");
    const ownerId = await userIdFor("reports3@example.com");

    // Insert an active run directly so the queue consumer never drains it.
    await env.DB.prepare(
      "INSERT INTO probe_runs (id, owner_id, credential_id, provider, label, status, trigger, created_at) VALUES (?, ?, ?, 'groq', NULL, 'queued', 'manual', ?)",
    )
      .bind(crypto.randomUUID(), ownerId, cred.id, new Date().toISOString())
      .run();

    const second = await SELF.fetch(base + "/reports", {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({ credentialId: cred.id }),
    });
    expect(second.status).toBe(409);
  });

  it("does not expose another user's report", async () => {
    const owner = await signUp("reports4@example.com");
    stubProvider();
    const cred = await createCredential(owner, "groq", "gsk_test");
    const ownerId = await userIdFor("reports4@example.com");

    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO probe_runs (id, owner_id, credential_id, provider, label, status, trigger, created_at) VALUES (?, ?, ?, 'groq', NULL, 'queued', 'manual', ?)",
    )
      .bind(id, ownerId, cred.id, new Date().toISOString())
      .run();

    const other = await signUp("reports5@example.com");
    const read = await SELF.fetch(base + "/reports/" + id, {
      headers: { cookie: other },
    });
    expect(read.status).toBe(404);

    const del = await SELF.fetch(base + "/reports/" + id, {
      method: "DELETE",
      headers: { cookie: other },
    });
    expect(del.status).toBe(404);
  });
});

describe("executeReport", () => {
  it("probes the provider and records availability", async () => {
    const cookie = await signUp("reports6@example.com");
    stubProvider();
    const cred = await createCredential(cookie, "groq", "gsk_test");
    const ownerId = await userIdFor("reports6@example.com");

    const runId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO probe_runs (id, owner_id, credential_id, provider, label, status, trigger, created_at) VALUES (?, ?, ?, ?, ?, 'queued', 'manual', ?)",
    )
      .bind(runId, ownerId, cred.id, "groq", null, new Date().toISOString())
      .run();

    await executeReport(env as unknown as Env, runId);

    const run = await env.DB.prepare(
      "SELECT status, progress_done, progress_total FROM probe_runs WHERE id = ?",
    )
      .bind(runId)
      .first<{
        status: string;
        progress_done: number;
        progress_total: number;
      }>();
    expect(run!.status).toBe("succeeded");
    expect(run!.progress_done).toBe(1);
    expect(run!.progress_total).toBe(1);

    const model = await env.DB.prepare(
      "SELECT model_id, ok, content FROM probe_run_models WHERE run_id = ?",
    )
      .bind(runId)
      .first<{ model_id: string; ok: number; content: string }>();
    expect(model!.model_id).toBe("m1");
    expect(model!.ok).toBe(1);
    expect(model!.content).toBe("pong");

    const avail = await env.DB.prepare(
      "SELECT available FROM model_availability WHERE owner_id = ? AND provider = ? AND model_id = ?",
    )
      .bind(ownerId, "groq", "m1")
      .first<{ available: number }>();
    expect(avail!.available).toBe(1);
  });
});
