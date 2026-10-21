import { describe, expect, it } from "vitest";

import { parseModels } from "../src/catalog/discover";
import {
  classifyProbe,
  isCacheableRejection,
  probeFreeVerdict,
  probeWithRetries,
} from "../src/catalog/probe";
import { DISCOVERY_SPECS } from "../src/catalog/providers";
import {
  chunk,
  FREE_MODEL_COLUMNS,
  MAX_BOUND_PARAMS,
  MAX_PROBES_PER_INSERT,
  MAX_ROWS_PER_INSERT,
  planReconcile,
  PROBE_COLUMNS,
  type CatalogRow,
} from "../src/catalog/reconcile";

describe("catalog discovery (parseModels)", () => {
  it("keeps only zero-priced text-output OpenRouter models", () => {
    const models = parseModels(DISCOVERY_SPECS.openrouter, {
      data: [
        {
          id: "meta/llama:free",
          name: "Llama Free",
          context_length: 8192,
          pricing: { prompt: "0", completion: "0" },
          architecture: { modality: "text->text" },
        },
        {
          id: "openai/gpt-4o",
          name: "GPT-4o",
          pricing: { prompt: "0.0000025", completion: "0.00001" },
          architecture: { modality: "text->text" },
        },
        {
          // Free but audio output — not a chat model.
          id: "some/music",
          name: "Music",
          pricing: { prompt: "0", completion: "0" },
          architecture: { modality: "text->text+audio" },
        },
      ],
    });

    expect(models.map((model) => model.id)).toEqual(["meta/llama:free"]);
    expect(models[0]).toMatchObject({
      label: "Llama Free",
      context: 8192,
      free: true,
      note: "zero-priced",
    });
  });

  it("drops Groq audio and guard models but keeps chat models", () => {
    const models = parseModels(DISCOVERY_SPECS.groq, {
      data: [
        { id: "llama-3.3-70b-versatile", context_window: 131072 },
        { id: "whisper-large-v3" },
        { id: "playai-tts" },
        { id: "meta-llama/llama-prompt-guard-2-22m" },
        { id: "openai/gpt-oss-120b", context_window: 131072 },
      ],
    });

    expect(models.map((model) => model.id)).toEqual([
      "llama-3.3-70b-versatile",
      "openai/gpt-oss-120b",
    ]);
    expect(models.every((model) => model.free === true)).toBe(true);
    expect(models[1]?.context).toBe(131072);
  });

  it("keeps only Gemini models that support generateContent", () => {
    const models = parseModels(DISCOVERY_SPECS.gemini, {
      models: [
        {
          name: "models/gemini-3-flash",
          displayName: "Gemini 3 Flash",
          inputTokenLimit: 1048576,
          supportedGenerationMethods: ["generateContent", "countTokens"],
        },
        {
          name: "models/text-embedding-004",
          supportedGenerationMethods: ["embedContent"],
        },
      ],
    });

    expect(models).toEqual([
      {
        id: "gemini-3-flash",
        label: "Gemini 3 Flash",
        context: 1048576,
        free: true,
        note: "free tier (rate-limited)",
      },
    ]);
  });

  it("drops Gemini image, speech, music and research models", () => {
    const listed = [
      "antigravity-preview-latest",
      "deep-research-max-preview-04-2026",
      "gemini-2.5-flash-image",
      "gemini-2.5-pro-preview-tts",
      "gemini-3-pro-image",
      "gemini-3.5-transcribe",
      "lyria-3-pro-preview",
      "nano-banana-pro-preview",
    ];
    const models = parseModels(DISCOVERY_SPECS.gemini, {
      models: [
        ...listed.map((id) => ({
          name: `models/${id}`,
          supportedGenerationMethods: ["generateContent", "countTokens"],
        })),
        {
          name: "models/gemini-3.5-flash",
          displayName: "Gemini 3.5 Flash",
          supportedGenerationMethods: ["generateContent", "countTokens"],
        },
      ],
    });

    expect(models.map((model) => model.id)).toEqual(["gemini-3.5-flash"]);
  });

  it("drops NVIDIA safety, translation and retrieval models", () => {
    const models = parseModels(DISCOVERY_SPECS.nvidia, {
      data: [
        { id: "nvidia/llama-3.1-nemotron-safety-guard-8b-v3" },
        { id: "nvidia/nemotron-3.5-content-safety" },
        { id: "nvidia/riva-translate-4b-instruct-v2" },
        { id: "nvidia/ising-calibration-1.5-31b" },
        { id: "nvidia/nemotron-3-ultra-550b-a55b" },
        { id: "meta/llama-3.1-8b-instruct" },
      ],
    });

    expect(models.map((model) => model.id)).toEqual([
      "meta/llama-3.1-8b-instruct",
      "nvidia/nemotron-3-ultra-550b-a55b",
    ]);
  });

  it("leaves probe-strategy providers unclassified", () => {
    const models = parseModels(DISCOVERY_SPECS.nvidia, {
      data: [
        { id: "meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B" },
        { id: "no-name-model" },
      ],
    });

    expect(models).toEqual([
      {
        id: "meta/llama-3.1-8b-instruct",
        label: "Llama 3.1 8B",
        context: undefined,
        free: null,
        note: undefined,
      },
      {
        id: "no-name-model",
        label: "no-name-model",
        context: undefined,
        free: null,
        note: undefined,
      },
    ]);
  });

  it("survives an unexpected payload shape", () => {
    expect(parseModels(DISCOVERY_SPECS.groq, {})).toEqual([]);
    expect(parseModels(DISCOVERY_SPECS.gemini, null)).toEqual([]);
    expect(parseModels(DISCOVERY_SPECS.openrouter, { data: "nope" })).toEqual(
      [],
    );
  });
});

describe("catalog probing", () => {
  it("classifies provider responses", () => {
    expect(classifyProbe(200, true)).toBe("usable");
    expect(classifyProbe(200, true, true)).toBe("empty");
    expect(classifyProbe(429, false)).toBe("rate_limited");
    expect(classifyProbe(402, false)).toBe("billing_required");
    expect(classifyProbe(403, false)).toBe("billing_required");
    expect(classifyProbe(401, false)).toBe("unauthorized");
    expect(classifyProbe(404, false)).toBe("not_available");
    expect(classifyProbe(410, false)).toBe("not_available");
    expect(classifyProbe(400, false)).toBe("bad_request");
    expect(classifyProbe(500, false)).toBe("error");
  });

  it("maps verdicts to free / not-free / unchanged", () => {
    expect(probeFreeVerdict("usable")).toBe(true);
    expect(probeFreeVerdict("rate_limited")).toBe(true);
    expect(probeFreeVerdict("billing_required")).toBe(false);
    expect(probeFreeVerdict("unauthorized")).toBe(false);
    expect(probeFreeVerdict("not_available")).toBe(false);
    // Inconclusive: leave the declared classification alone.
    expect(probeFreeVerdict("bad_request")).toBeNull();
    expect(probeFreeVerdict("empty")).toBeNull();
    expect(probeFreeVerdict("error")).toBeNull();
  });

  it("only caches definitive rejections", () => {
    expect(isCacheableRejection("not_available")).toBe(true);
    expect(isCacheableRejection("billing_required")).toBe(true);
    expect(isCacheableRejection("unauthorized")).toBe(true);
    expect(isCacheableRejection("bad_request")).toBe(true);
    expect(isCacheableRejection("empty")).toBe(true);
    // Transient or free: must not be remembered as a rejection.
    expect(isCacheableRejection("error")).toBe(false);
    expect(isCacheableRejection("usable")).toBe(false);
    expect(isCacheableRejection("rate_limited")).toBe(false);
  });

  it("retries a bad request once with a relaxed payload", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return bodies.length === 1
        ? new Response("unsupported temperature", { status: 400 })
        : new Response(
            JSON.stringify({ choices: [{ message: { content: "pong" } }] }),
            { status: 200 },
          );
    }) as typeof fetch;

    const outcome = await probeWithRetries(
      DISCOVERY_SPECS.groq,
      "k",
      "openai/gpt-oss-120b",
      { fetchImpl, retries: 0 },
    );

    expect(outcome.status).toBe("usable");
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({
      model: "openai/gpt-oss-120b",
      max_tokens: 128,
      temperature: 0,
    });
    expect(bodies[1]).toMatchObject({ max_completion_tokens: 512 });
    expect(bodies[1]).not.toHaveProperty("temperature");
  });

  it("retries transient failures", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return calls === 1
        ? new Response("slow down", { status: 429 })
        : new Response(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: "pong" }] } }],
            }),
            { status: 200 },
          );
    }) as typeof fetch;

    const outcome = await probeWithRetries(
      DISCOVERY_SPECS.gemini,
      "k",
      "gemini-3-flash",
      { fetchImpl, retries: 1, sleep: async () => {} },
    );

    expect(outcome.status).toBe("usable");
    expect(calls).toBe(2);
  });

  it("reports a network failure without throwing", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("network down");
    }) as typeof fetch;

    const outcome = await probeWithRetries(
      DISCOVERY_SPECS.groq,
      "k",
      "openai/gpt-oss-120b",
      { fetchImpl, retries: 0 },
    );

    expect(outcome.status).toBe("error");
    expect(outcome.httpStatus).toBe(0);
  });

  it("treats a 200 with no content as empty", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "" } }] }),
        {
          status: 200,
        },
      )) as typeof fetch;

    const outcome = await probeWithRetries(
      DISCOVERY_SPECS.groq,
      "k",
      "openai/gpt-oss-120b",
      { fetchImpl, retries: 0 },
    );

    expect(outcome.status).toBe("empty");
    expect(outcome.detail).toBe("empty content");
  });
});

describe("catalog reconcile", () => {
  const models = [
    { id: "b-model", label: "B", free: true as const },
    { id: "a-model", label: "A", free: true as const },
  ];

  it("plans adds, keeps and removals with stable sort bands", () => {
    const plan = planReconcile({
      provider: "groq",
      existing: ["a-model", "gone-model"],
      models,
      sortBase: 100,
    });

    expect(plan.apply).toBe(true);
    if (!plan.apply) return;
    expect(plan.rows.map((row) => row.modelId)).toEqual(["a-model", "b-model"]);
    expect(plan.rows.map((row) => row.sort)).toEqual([100, 101]);
    expect(plan.added).toEqual(["b-model"]);
    expect(plan.removed).toEqual(["gone-model"]);
    expect(plan.kept).toEqual(["a-model"]);
  });

  it("refuses to wipe a provider on an empty listing", () => {
    const plan = planReconcile({
      provider: "groq",
      existing: ["a-model"],
      models: [],
      sortBase: 100,
    });
    expect(plan).toEqual({ apply: false, reason: "empty-listing" });
  });

  it("refuses an implausible shrink unless explicitly allowed", () => {
    const existing = ["m1", "m2", "m3", "m4"];

    const blocked = planReconcile({
      provider: "groq",
      existing,
      models: [{ id: "m1", label: "M1", free: true }],
      sortBase: 100,
    });
    expect(blocked).toEqual({ apply: false, reason: "implausible-shrink" });

    const allowed = planReconcile({
      provider: "groq",
      existing,
      models: [{ id: "m1", label: "M1", free: true }],
      sortBase: 100,
      allowShrink: true,
    });
    expect(allowed.apply).toBe(true);
    if (!allowed.apply) return;
    expect(allowed.removed).toEqual(["m2", "m3", "m4"]);
  });

  it("chunks inserts under D1's bound-parameter cap", () => {
    const rows: CatalogRow[] = Array.from({ length: 40 }, (_, index) => ({
      provider: "groq",
      modelId: `m${index}`,
      label: `M${index}`,
      context: null,
      free: true,
      sort: index,
      note: null,
    }));

    const chunks = chunk(rows, MAX_ROWS_PER_INSERT);
    expect(chunks.map((group) => group.length)).toEqual([11, 11, 11, 7]);
    // Every INSERT must stay under D1's bound-parameter cap.
    expect(MAX_ROWS_PER_INSERT * FREE_MODEL_COLUMNS).toBeLessThanOrEqual(
      MAX_BOUND_PARAMS,
    );
    expect(MAX_PROBES_PER_INSERT * PROBE_COLUMNS).toBeLessThanOrEqual(
      MAX_BOUND_PARAMS,
    );
    expect(chunks.every((group) => group.length <= MAX_ROWS_PER_INSERT)).toBe(
      true,
    );
  });
});
