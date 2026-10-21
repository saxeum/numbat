import { describe, expect, it } from "vitest";

import { geminiStreamToOpenAI } from "../src/gateway/gemini";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe("geminiStreamToOpenAI", () => {
  it("emits a trailing usage chunk (with reasoning tokens)", async () => {
    const sse = [
      'data: {"candidates":[{"content":{"parts":[{"text":"pong"}]}}]}\n\n',
      'data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2,"thoughtsTokenCount":3,"totalTokenCount":10}}\n\n',
    ];

    const out = await collect(geminiStreamToOpenAI(streamOf(sse), "gemini-x"));

    expect(out).toContain('"content":"pong"');
    expect(out).toContain('"finish_reason":"stop"');
    expect(out).toContain('"usage"');
    expect(out).toContain('"prompt_tokens":5');
    expect(out).toContain('"completion_tokens":2');
    expect(out).toContain('"reasoning_tokens":3');
  });
});
