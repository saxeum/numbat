import { describe, expect, it } from "vitest";

import type { ModelInfo } from "../domain/model";
import { classifyByRules } from "../domain/model";
import type { AdapterContext, ProviderAdapter } from "../domain/provider";
import type { ProbeOutcome } from "../domain/probe";
import { runProbes } from "./engine";
import { finalizeOutcome, totalsFor } from "./outcome";
import {
  defaultQuota,
  geminiQuota,
  limitsFromHeaders,
  OPENAI_RATE_LIMIT_METRICS,
  rateLimitQuota,
} from "./quota";
import { errorMessage, parseDurationMs } from "./util";
import { ProbeAccumulator } from "./stream";

describe("classifyByRules", () => {
  it("matches the first rule and defaults to chat", () => {
    const rules = [
      ["embedding", /embedding/],
      ["image", /image/],
    ] as const;
    expect(classifyByRules("text-embedding-3", rules)).toBe("embedding");
    expect(classifyByRules("gpt-image-1", rules)).toBe("image");
    expect(classifyByRules("llama-3.1-8b", rules)).toBe("chat");
  });
});

describe("errorMessage", () => {
  it("handles OpenAI, Cloudflare and RFC 7807 shapes", () => {
    expect(errorMessage({ error: { message: "boom" } })).toBe("boom");
    expect(errorMessage({ errors: [{ message: "cf bad input" }] })).toBe(
      "cf bad input",
    );
    expect(errorMessage({ title: "Nope", detail: "detailed" })).toBe(
      "detailed",
    );
    expect(errorMessage({ message: "plain" })).toBe("plain");
    expect(errorMessage("raw text")).toBe("raw text");
    expect(errorMessage({})).toBe("unknown error");
  });
});

describe("parseDurationMs", () => {
  it("parses compound and bare values", () => {
    expect(parseDurationMs("2m59s")).toBe(179_000);
    expect(parseDurationMs("1500ms")).toBe(1500);
    expect(parseDurationMs(2)).toBe(2000);
    expect(parseDurationMs("nonsense")).toBeUndefined();
  });
});

describe("quota normalizers", () => {
  it("defaultQuota maps status to state", () => {
    expect(defaultQuota(200, {}, "").state).toBe("within-quota");
    expect(defaultQuota(429, {}, "").state).toBe("exhausted");
    expect(defaultQuota(500, {}, "").state).toBe("unavailable");
  });

  it("rateLimitQuota reads x-ratelimit headers", () => {
    const headers = {
      "x-ratelimit-limit-requests": "100",
      "x-ratelimit-remaining-requests": "42",
      "x-ratelimit-reset-requests": "12s",
    };
    const limits = limitsFromHeaders(headers, OPENAI_RATE_LIMIT_METRICS);
    expect(limits).toEqual([
      {
        metric: "requests",
        window: "RPM",
        limit: 100,
        remaining: 42,
        resetAfterMs: 12_000,
      },
    ]);
    expect(
      rateLimitQuota(OPENAI_RATE_LIMIT_METRICS)(200, headers, "").state,
    ).toBe("within-quota");
  });

  it("geminiQuota parses 429 details[]", () => {
    const body = JSON.stringify({
      error: {
        message: "quota exceeded",
        details: [
          {
            retryDelay: "8s",
            violations: [
              {
                quotaMetric: "generate_content_free_tier_requests",
                quotaId: "GenerateRequestsPerDay",
                quotaValue: 50,
              },
            ],
          },
        ],
      },
    });
    const info = geminiQuota(429, {}, body);
    expect(info.state).toBe("exhausted");
    expect(info.retryAfterMs).toBe(8000);
    expect(info.limits[0]?.limit).toBe(50);
  });
});

describe("finalizeOutcome / totalsFor", () => {
  it("derives reasoning tokens and thinking", () => {
    const model: ModelInfo = {
      id: "m",
      kind: "chat",
      capabilities: { chat: true },
    };
    const outcome = finalizeOutcome(
      model,
      {
        content: "pong",
        usage: { promptTokens: 5, completionTokens: 3, totalTokens: 20 },
        sawReasoning: true,
        sawThoughtTag: false,
        ttftMs: 50,
        quota: { state: "within-quota", limits: [] },
        evidence: { url: "u", method: "POST", requestBody: "{}", status: 200 },
      },
      Date.now() - 120,
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.thinking).toBe(true);
    expect(outcome.usage.reasoningTokens).toBe(12);
    expect(totalsFor([outcome]).passed).toBe(1);
  });
});

describe("runProbes", () => {
  it("skips non-chat models, honors concurrency and reports progress", async () => {
    const models: ModelInfo[] = [
      { id: "a", kind: "chat", capabilities: { chat: true } },
      { id: "b", kind: "chat", capabilities: { chat: true } },
      { id: "c", kind: "embedding", capabilities: { chat: false } },
    ];

    let inFlight = 0;
    let peak = 0;
    const adapter: ProviderAdapter = {
      meta: {
        id: "fake",
        label: "Fake",
        transport: "openai-compatible",
        concurrency: 1,
      },
      async listModels() {
        return models;
      },
      async probeChat(_ctx, model) {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return {
          modelId: model.id,
          kind: model.kind,
          attempted: true,
          ok: true,
          usage: {},
          quota: { state: "within-quota", limits: [] },
          evidence: { url: "u", method: "POST", requestBody: "{}" },
        } satisfies ProbeOutcome;
      },
    };

    const ctx: AdapterContext = {
      apiKey: "k",
      timeoutMs: 1000,
      fetch: (() =>
        Promise.reject(new Error("unused"))) as unknown as typeof fetch,
    };

    const seen: string[] = [];
    const results = await runProbes(adapter, ctx, {
      onStart: (total) => {
        expect(total).toBe(3);
      },
      onResult: (outcome) => {
        seen.push(outcome.modelId);
      },
    });

    expect(results).toHaveLength(3);
    expect(peak).toBe(1); // concurrency: 1 on the adapter meta
    expect(seen.sort()).toEqual(["a", "b", "c"]);
    const skipped = results.find((r) => r.modelId === "c");
    expect(skipped?.attempted).toBe(false);
  });
});

describe("ProbeAccumulator", () => {
  it("records ttft on first content", () => {
    const acc = new ProbeAccumulator(Date.now() - 30);
    expect(acc.ttftMs).toBeUndefined();
    acc.pushContent("hi");
    expect(acc.ttftMs).toBeGreaterThanOrEqual(0);
    acc.pushContent(" there");
    expect(acc.content).toBe("hi there");
  });
});
