import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runCatalogSync, type RunSummary } from "../src/catalog";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const LISTINGS: Record<string, () => Response> = {
  "generativelanguage.googleapis.com/v1beta/models": () =>
    json({
      models: [
        {
          name: "models/gemini-3-flash",
          displayName: "Gemini 3 Flash",
          inputTokenLimit: 1048576,
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/text-embedding-004",
          supportedGenerationMethods: ["embedContent"],
        },
      ],
    }),
  "api.groq.com/openai/v1/models": () =>
    json({
      data: [
        { id: "openai/gpt-oss-120b", context_window: 131072 },
        { id: "whisper-large-v3" },
      ],
    }),
  "integrate.api.nvidia.com/v1/models": () =>
    json({
      data: [{ id: "meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B" }],
    }),
  "openrouter.ai/api/v1/models": () =>
    json({
      data: [
        {
          id: "meta/llama:free",
          name: "Llama Free",
          pricing: { prompt: "0", completion: "0" },
          architecture: { modality: "text->text" },
        },
      ],
    }),
};

/** Routes listings by URL and answers every probe with a real-looking 200. */
function catalogFetch(
  overrides: Record<string, () => Response> = {},
): typeof fetch {
  const routes = { ...LISTINGS, ...overrides };
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if ((init?.method ?? "GET") === "POST") {
      return url.includes("generativelanguage")
        ? json({ candidates: [{ content: { parts: [{ text: "pong" }] } }] })
        : json({ choices: [{ message: { content: "pong" } }] });
    }

    for (const [needle, handler] of Object.entries(routes)) {
      if (url.includes(needle)) return handler();
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

function testEnv(overrides: Record<string, string> = {}): Env {
  return {
    ...env,
    // Every catalog variable is set explicitly so the tests do not depend on
    // whatever happens to be in `.dev.vars`.
    CATALOG_ENABLED: "1",
    CATALOG_DRY_RUN: "0",
    CATALOG_ALLOW_SHRINK: "0",
    CATALOG_PROBE_LIMIT: "25",
    CATALOG_GEMINI_API_KEY: "test-gemini",
    CATALOG_GROQ_API_KEY: "test-groq",
    CATALOG_NVIDIA_API_KEY: "test-nvidia",
    CATALOG_OPENROUTER_API_KEY: "test-openrouter",
    ...overrides,
  } as unknown as Env;
}

async function catalogRows(): Promise<
  { provider: string; model_id: string; sort: number; note: string | null }[]
> {
  const result = await env.DB.prepare(
    "SELECT provider, model_id, sort, note FROM free_models ORDER BY provider, sort",
  ).all<{
    provider: string;
    model_id: string;
    sort: number;
    note: string | null;
  }>();
  return result.results;
}

interface RunRow {
  status: string;
  trigger: string;
  finished_at: string | null;
  providers: string;
  error: string | null;
}

async function runRow(id: string): Promise<RunRow | undefined> {
  const result = await env.DB.prepare(
    "SELECT status, trigger, finished_at, providers, error FROM catalog_runs WHERE id = ?",
  )
    .bind(id)
    .all<RunRow>();
  return result.results[0];
}

async function countRuns(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM catalog_runs",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

describe("catalog sync", () => {
  it("is a no-op when CATALOG_ENABLED is not set", async () => {
    const before = await countRuns();
    const summary = await runCatalogSync(testEnv({ CATALOG_ENABLED: "" }), {
      trigger: "cron",
    });

    expect(summary.status).toBe("skipped");
    expect(summary.providers).toEqual([]);
    expect(await countRuns()).toBe(before);
  });

  it("refreshes every provider, probes new models and records the run", async () => {
    await env.DB.prepare("DELETE FROM free_models").run();

    const summary = await runCatalogSync(testEnv(), {
      trigger: "cron",
      fetchImpl: catalogFetch(),
      now: () => new Date("2026-01-01T03:17:00.000Z"),
    });

    expect(summary.status).toBe("ok");
    expect(summary.providers.map((provider) => provider.provider)).toEqual([
      "gemini",
      "groq",
      "nvidia",
      "openrouter",
    ]);
    expect(
      summary.providers.every((provider) => provider.status === "ok"),
    ).toBe(true);
    // Non-chat models (embeddings, audio, guard) are filtered before probing,
    // so only one candidate per provider reaches the probe stage.
    expect(summary.providers.map((provider) => provider.listed)).toEqual([
      1, 1, 1, 1,
    ]);
    expect(summary.providers.every((provider) => provider.probed === 1)).toBe(
      true,
    );

    const rows = await catalogRows();
    expect(rows.map((row) => `${row.provider}/${row.model_id}`)).toEqual([
      "gemini/gemini-3-flash",
      "groq/openai/gpt-oss-120b",
      "nvidia/meta/llama-3.1-8b-instruct",
      "openrouter/meta/llama:free",
    ]);
    expect(rows.map((row) => row.sort)).toEqual([10, 100, 200, 300]);
    expect(rows[2]?.note).toBe("probe: usable");

    const run = await runRow(summary.runId);
    expect(run?.status).toBe("ok");
    expect(run?.trigger).toBe("cron");
    expect(run?.finished_at).toBe("2026-01-01T03:17:00.000Z");
    expect(run?.error).toBeNull();
    expect(JSON.parse(run?.providers ?? "[]")).toHaveLength(4);
  });

  it("records and re-throws a failure that escapes provider isolation", async () => {
    // A provider listing failure is contained; this simulates the D1 write
    // itself failing, which must be recorded on the run and surfaced.
    const brokenDb = new Proxy(env.DB, {
      get(target, property, receiver) {
        if (property === "batch") {
          return () => {
            throw new Error("batch exploded");
          };
        }
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    await expect(
      runCatalogSync({ ...testEnv(), DB: brokenDb } as unknown as Env, {
        trigger: "cron",
        fetchImpl: catalogFetch(),
      }),
    ).rejects.toThrow(/catalog sync failed: batch exploded/);

    const latest = await env.DB.prepare(
      "SELECT status, error FROM catalog_runs ORDER BY started_at DESC LIMIT 1",
    ).all<{ status: string; error: string | null }>();
    expect(latest.results[0]?.status).toBe("failed");
    expect(latest.results[0]?.error).toContain("batch exploded");
  });

  it("does not re-probe models that are already in the catalog", async () => {
    await env.DB.prepare("DELETE FROM free_models").run();

    const first = await runCatalogSync(testEnv(), {
      trigger: "cron",
      fetchImpl: catalogFetch(),
    });
    expect(first.providers.reduce((sum, p) => sum + p.probed, 0)).toBe(4);

    const second = await runCatalogSync(testEnv(), {
      trigger: "cron",
      fetchImpl: catalogFetch(),
    });
    expect(second.status).toBe("ok");
    expect(second.providers.every((provider) => provider.probed === 0)).toBe(
      true,
    );
    expect(second.providers.every((provider) => provider.added === 0)).toBe(
      true,
    );
    expect((await catalogRows()).length).toBe(4);
  });

  it("remembers rejects so later runs can reach the models behind them", async () => {
    await env.DB.prepare("DELETE FROM free_models").run();
    await env.DB.prepare("DELETE FROM catalog_probes").run();

    // Groq lists three chat models; the first two are gone (404).
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      if ((init?.method ?? "GET") === "POST") {
        const body = JSON.parse(String(init?.body)) as { model: string };
        return body.model.includes("broken")
          ? new Response("model is gone", { status: 404 })
          : json({ choices: [{ message: { content: "pong" } }] });
      }
      if (new URL(url).hostname === "api.groq.com") {
        return json({
          data: [{ id: "a-broken" }, { id: "b-broken" }, { id: "c-works" }],
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const first = await runCatalogSync(testEnv(), {
      trigger: "cron",
      provider: "groq",
      fetchImpl,
    });
    expect(first.providers[0]?.probed).toBe(3);
    expect(first.providers[0]?.dropped).toBe(2);
    expect((await catalogRows()).map((row) => row.model_id)).toEqual([
      "c-works",
    ]);

    const second = await runCatalogSync(testEnv(), {
      trigger: "cron",
      provider: "groq",
      fetchImpl,
    });
    // The two rejects are remembered, so nothing is probed again.
    expect(second.providers[0]?.listed).toBe(3);
    expect(second.providers[0]?.probed).toBe(0);
    expect(second.providers[0]?.added).toBe(0);
    expect((await catalogRows()).map((row) => row.model_id)).toEqual([
      "c-works",
    ]);

    const probes = await env.DB.prepare(
      "SELECT model_id, status FROM catalog_probes WHERE provider = 'groq' ORDER BY model_id",
    ).all<{ model_id: string; status: string }>();
    expect(probes.results).toEqual([
      { model_id: "a-broken", status: "not_available" },
      { model_id: "b-broken", status: "not_available" },
    ]);
  });

  it("keeps a provider's rows when its listing fails", async () => {
    await env.DB.prepare("DELETE FROM free_models").run();
    await runCatalogSync(testEnv(), {
      trigger: "cron",
      fetchImpl: catalogFetch(),
    });
    const before = await catalogRows();

    const failing = catalogFetch({
      "generativelanguage.googleapis.com/v1beta/models": () =>
        json({ error: "boom" }, 500),
    });
    const summary = await runCatalogSync(testEnv(), {
      trigger: "cron",
      fetchImpl: failing,
    });

    const gemini = summary.providers.find(
      (provider) => provider.provider === "gemini",
    );
    expect(gemini?.status).toBe("failed");
    expect(gemini?.note).toContain("500");
    expect(summary.status).toBe("partial");

    const after = await catalogRows();
    expect(after.filter((row) => row.provider === "gemini")).toEqual(
      before.filter((row) => row.provider === "gemini"),
    );
  });

  it("skips a provider whose listing would shrink the catalog", async () => {
    await env.DB.prepare("DELETE FROM free_models").run();
    await runCatalogSync(testEnv(), {
      trigger: "cron",
      fetchImpl: catalogFetch(),
    });
    const before = await catalogRows();

    const shrink = catalogFetch({
      "api.groq.com/openai/v1/models": () => json({ data: [] }),
    });
    const summary = await runCatalogSync(testEnv(), {
      trigger: "cron",
      fetchImpl: shrink,
    });

    const groq = summary.providers.find(
      (provider) => provider.provider === "groq",
    );
    expect(groq?.status).toBe("skipped");
    expect(groq?.note).toBe("empty-listing");
    expect(
      (await catalogRows()).filter((row) => row.provider === "groq"),
    ).toEqual(before.filter((row) => row.provider === "groq"));
  });

  it("skips providers without an ops key", async () => {
    const summary = await runCatalogSync(
      testEnv({ CATALOG_GROQ_API_KEY: "" }),
      { trigger: "cron", fetchImpl: catalogFetch() },
    );

    const groq = summary.providers.find(
      (provider) => provider.provider === "groq",
    );
    expect(groq?.status).toBe("skipped");
    expect(groq?.note).toBe("no key");
  });

  it("writes nothing in dry-run mode", async () => {
    await env.DB.prepare("DELETE FROM free_models").run();
    const before = await countRuns();

    const summary: RunSummary = await runCatalogSync(
      testEnv({ CATALOG_DRY_RUN: "1" }),
      { trigger: "manual", fetchImpl: catalogFetch() },
    );

    expect(summary.dryRun).toBe(true);
    expect(summary.status).toBe("ok");
    expect(await catalogRows()).toEqual([]);
    expect(await countRuns()).toBe(before);
  });
});

describe("POST /api/catalog/refresh", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a missing or wrong token", async () => {
    const missing = await SELF.fetch("https://foonix.net/api/catalog/refresh", {
      method: "POST",
    });
    expect(missing.status).toBe(401);

    const wrong = await SELF.fetch("https://foonix.net/api/catalog/refresh", {
      method: "POST",
      headers: { "x-catalog-token": "nope" },
    });
    expect(wrong.status).toBe(401);
  });

  it("rejects an unknown provider filter", async () => {
    const token = (env as unknown as Record<string, string>)
      .CATALOG_ADMIN_TOKEN;
    const res = await SELF.fetch(
      "https://foonix.net/api/catalog/refresh?provider=nope",
      { method: "POST", headers: { "x-catalog-token": token } },
    );
    expect(res.status).toBe(400);
  });

  it("runs the sync on demand with the ops token", async () => {
    // Stub the network so the route never reaches a real provider, whether or
    // not the ambient environment has catalog keys.
    vi.stubGlobal("fetch", catalogFetch());
    const token = (env as unknown as Record<string, string>)
      .CATALOG_ADMIN_TOKEN;

    const res = await SELF.fetch("https://foonix.net/api/catalog/refresh", {
      method: "POST",
      headers: { "x-catalog-token": token },
    });
    expect(res.status).toBe(200);

    const summary = (await res.json()) as RunSummary;
    expect(summary.trigger).toBe("manual");
    expect(summary.providers.map((provider) => provider.provider)).toEqual([
      "gemini",
      "groq",
      "nvidia",
      "openrouter",
    ]);
    // A provider with no ops key reports "no key"; one with a key reports a
    // real outcome. Either way the route completed and recorded the run.
    const run = await runRow(summary.runId);
    expect(run?.trigger).toBe("manual");
  });
});
