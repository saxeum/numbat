import { afterEach, describe, expect, it, vi } from "vitest";

import {
  llmLoggingEnabled,
  logProviderRequest,
  logProviderResponse,
  MAX_TRACE_BODY_CHARS,
  tapForTrace,
  type ProviderTraceContext,
} from "../src/gateway/trace";

const ctx: ProviderTraceContext = {
  requestId: "req-1",
  provider: "gemini",
  model: "gemini-3-flash-preview",
  stream: false,
};

const asEnv = (vars: Record<string, string>): Env => vars as unknown as Env;
const lastLog = (log: ReturnType<typeof vi.spyOn>): Record<string, unknown> =>
  JSON.parse(String(log.mock.calls.at(-1)?.[0])) as Record<string, unknown>;

describe("gateway provider tracing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the GATEWAY_LLM_LOGGING flag", () => {
    expect(llmLoggingEnabled(asEnv({ GATEWAY_LLM_LOGGING: "1" }))).toBe(true);
    expect(llmLoggingEnabled(asEnv({ GATEWAY_LLM_LOGGING: "0" }))).toBe(false);
    expect(llmLoggingEnabled(asEnv({}))).toBe(false);
  });

  it("emits nothing when disabled", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logProviderRequest(false, ctx, {
      url: "https://upstream",
      payload: { a: 1 },
    });
    logProviderResponse(false, ctx, { status: 200, body: "hello" });
    expect(log).not.toHaveBeenCalled();
  });

  it("logs a structured, correlated request", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logProviderRequest(true, ctx, {
      url: "https://generativelanguage.googleapis.com/v1beta/models/x:generateContent",
      payload: { contents: [{ parts: [{ text: "hi" }] }] },
    });

    const entry = lastLog(log);
    expect(entry).toMatchObject({
      level: "info",
      type: "provider-request",
      requestId: "req-1",
      provider: "gemini",
      model: "gemini-3-flash-preview",
      stream: false,
    });
    expect(JSON.parse(String(entry.payload))).toEqual({
      contents: [{ parts: [{ text: "hi" }] }],
    });
  });

  it("truncates long response bodies", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const long = "a".repeat(MAX_TRACE_BODY_CHARS + 25);
    logProviderResponse(true, ctx, { status: 200, body: long });

    const entry = lastLog(log);
    expect(entry.bodyTruncated).toBe(true);
    expect(entry.bodyChars).toBe(long.length);
    expect(String(entry.body).length).toBe(MAX_TRACE_BODY_CHARS);
  });

  it("logs provider failures at error level", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logProviderResponse(true, ctx, {
      status: 502,
      error: "Gemini returned 429",
    });

    const entry = lastLog(log);
    expect(entry.level).toBe("error");
    expect(entry.error).toBe("Gemini returned 429");
  });

  it("passes a stream through untouched and logs a preview on flush", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const encoder = new TextEncoder();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: hello\n\n"));
        controller.close();
      },
    });

    const tapped = tapForTrace(true, { ...ctx, stream: true }, source, {
      status: 200,
      contentType: "text/event-stream",
    });
    const reader = tapped.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }

    expect(text).toBe("data: hello\n\n");
    const entry = lastLog(log);
    expect(entry.type).toBe("provider-response");
    expect(entry.stream).toBe(true);
    expect(entry.status).toBe(200);
    expect(String(entry.body)).toContain("hello");
    expect(entry.bytes).toBeGreaterThan(0);
  });
});
