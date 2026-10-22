import type { AdapterContext } from "../domain/provider";
import type {
  Evidence,
  ProbeDraft,
  QuotaNormalizer,
  Usage,
} from "../domain/probe";
import { defaultQuota } from "./quota";
import { errorMessage, safeJson } from "./util";

const RAW_BODY_LIMIT = 8000;

/** Accumulates a streaming probe; provider translators push into it. */
export class ProbeAccumulator {
  content = "";
  resolvedModel?: string;
  usage: Usage = {};
  sawReasoning = false;
  raw = "";
  ttftMs?: number;

  constructor(private readonly startedAt: number) {}

  pushContent(text: string): void {
    if (this.ttftMs === undefined) this.ttftMs = Date.now() - this.startedAt;
    this.content += text;
  }

  appendRaw(text: string): void {
    if (this.raw.length < RAW_BODY_LIMIT) this.raw += text;
  }

  setUsage(usage: Usage): void {
    this.usage = { ...this.usage, ...stripUndefined(usage) };
  }
}

export interface SseProbeSpec {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: string;
  /** Provider-specific SSE event → accumulator mapping. */
  translate: (event: unknown, acc: ProbeAccumulator) => void;
  quota?: QuotaNormalizer;
}

/**
 * Performs a streaming request and captures timing + evidence. Used by every
 * adapter; only `translate` differs per provider.
 */
export async function sseProbe(
  ctx: AdapterContext,
  spec: SseProbeSpec,
  startedAt: number,
): Promise<ProbeDraft> {
  const evidence: Evidence = {
    url: spec.url,
    method: spec.method ?? "POST",
    requestBody: spec.body,
  };

  try {
    const timeout = AbortSignal.timeout(ctx.timeoutMs);
    const signal = ctx.signal
      ? AbortSignal.any([ctx.signal, timeout])
      : timeout;
    const response = await ctx.fetch(spec.url, {
      method: spec.method ?? "POST",
      headers: spec.headers,
      body: spec.body,
      signal,
    });

    evidence.status = response.status;
    evidence.statusText = response.statusText;
    const headers = Object.fromEntries(response.headers.entries());
    evidence.headers = headers;

    const normalize = spec.quota ?? defaultQuota;

    if (!response.ok) {
      const body = await response.text();
      evidence.body = body;
      return {
        content: "",
        usage: {},
        sawReasoning: false,
        sawThoughtTag: false,
        quota: normalize(response.status, headers, body),
        evidence,
        error: {
          name: `HTTP ${response.status}`,
          message: errorMessage(safeJson(body)),
        },
      };
    }

    const acc = new ProbeAccumulator(startedAt);
    if (response.body)
      await readSse(response.body, (event) => spec.translate(event, acc), acc);

    evidence.body = acc.raw;
    return {
      content: acc.content,
      resolvedModel: acc.resolvedModel,
      usage: acc.usage,
      sawReasoning: acc.sawReasoning,
      sawThoughtTag: acc.content.includes("<thought>"),
      ttftMs: acc.ttftMs,
      quota: normalize(response.status, headers, acc.raw),
      evidence,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const cause =
      err.cause instanceof Error
        ? err.cause.message
        : err.cause !== undefined
          ? String(err.cause)
          : undefined;
    return {
      content: "",
      usage: {},
      sawReasoning: false,
      sawThoughtTag: false,
      quota: { state: "unknown", limits: [] },
      evidence,
      error: {
        name: err.name,
        message:
          err.name === "TimeoutError"
            ? `timed out after ${ctx.timeoutMs}ms`
            : err.message,
        cause,
      },
    };
  }
}

async function readSse(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: unknown) => void,
  acc: ProbeAccumulator,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      acc.appendRaw(text);
      buffer += text;

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data && data !== "[DONE]") onEvent(safeJson(data));
        }
        newline = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function stripUndefined(usage: Usage): Usage {
  const out: Usage = {};
  if (usage.promptTokens !== undefined) out.promptTokens = usage.promptTokens;
  if (usage.completionTokens !== undefined)
    out.completionTokens = usage.completionTokens;
  if (usage.reasoningTokens !== undefined)
    out.reasoningTokens = usage.reasoningTokens;
  if (usage.totalTokens !== undefined) out.totalTokens = usage.totalTokens;
  return out;
}
