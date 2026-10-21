// Provider request/response tracing for the inference gateway.
//
// Off by default. Enable with `GATEWAY_LLM_LOGGING="1"` (a Worker var). When
// on, every outbound provider call emits structured JSON: the request metadata
// + a truncated payload, and the response status/headers + a truncated body
// (or an SSE preview for streamed replies).
//
// Provider credentials are NEVER logged. The auth header is derived from the
// decrypted key in `prepareCompletion` and is deliberately not part of any
// trace context.
//
// NOTE: request/response bodies contain user message content. Cloudflare
// Workers observability retains logs, so treat these entries as PII and keep
// the flag off outside deliberate debugging windows.

/** Bodies are truncated to this many characters in the log line. */
export const MAX_TRACE_BODY_CHARS = 8_000;

export interface ProviderTraceContext {
  requestId?: string;
  provider: string;
  model: string;
  stream: boolean;
}

/** Reads the `GATEWAY_LLM_LOGGING` flag ("1" = on). */
export function llmLoggingEnabled(env: Env): boolean {
  const vars = env as unknown as Record<string, string | undefined>;
  return vars.GATEWAY_LLM_LOGGING === "1";
}

interface Truncated {
  value: string;
  chars: number;
  truncated: boolean;
}

function truncate(value: string): Truncated {
  return value.length <= MAX_TRACE_BODY_CHARS
    ? { value, chars: value.length, truncated: false }
    : {
        value: value.slice(0, MAX_TRACE_BODY_CHARS),
        chars: value.length,
        truncated: true,
      };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Logs the outbound provider request (URL + redacted, truncated payload). */
export function logProviderRequest(
  enabled: boolean,
  context: ProviderTraceContext,
  request: { url: string; payload: unknown },
): void {
  if (!enabled) return;
  const payload = truncate(safeJson(request.payload));
  console.log(
    JSON.stringify({
      level: "info",
      type: "provider-request",
      requestId: context.requestId,
      provider: context.provider,
      model: context.model,
      stream: context.stream,
      url: request.url,
      payload: payload.value,
      payloadChars: payload.chars,
      payloadTruncated: payload.truncated,
    }),
  );
}

export interface ProviderResponseLog {
  status: number;
  contentType?: string | null;
  upstreamRequestId?: string | null;
  durationMs?: number;
  /** Non-streamed body or a streamed preview; omitted when nothing was read. */
  body?: string;
  /** Total streamed bytes (streams only). */
  bytes?: number;
  ttftMs?: number | null;
  error?: string;
}

/** Logs the provider response. `status >= 400` is logged at warn/error. */
export function logProviderResponse(
  enabled: boolean,
  context: ProviderTraceContext,
  response: ProviderResponseLog,
): void {
  if (!enabled) return;
  const level =
    response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info";
  const body =
    response.body === undefined ? undefined : truncate(response.body);
  console.log(
    JSON.stringify({
      level,
      type: "provider-response",
      requestId: context.requestId,
      provider: context.provider,
      model: context.model,
      stream: context.stream,
      status: response.status,
      contentType: response.contentType ?? undefined,
      upstreamRequestId: response.upstreamRequestId ?? undefined,
      durationMs: response.durationMs,
      bytes: response.bytes,
      ttftMs: response.ttftMs,
      body: body?.value,
      bodyChars: body?.chars,
      bodyTruncated: body?.truncated,
      error: response.error,
    }),
  );
}

/**
 * Wraps a byte stream so a bounded preview is logged when it flushes. Bytes
 * pass through untouched; only the first `MAX_TRACE_BODY_CHARS` are retained.
 */
export function tapForTrace(
  enabled: boolean,
  context: ProviderTraceContext,
  stream: ReadableStream<Uint8Array>,
  meta: {
    status: number;
    contentType?: string | null;
    upstreamRequestId?: string | null;
  },
): ReadableStream<Uint8Array> {
  if (!enabled) return stream;
  const decoder = new TextDecoder();
  const startedAt = Date.now();
  let preview = "";
  let bytes = 0;
  let ttftMs: number | null = null;

  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (bytes === 0) ttftMs = Date.now() - startedAt;
        bytes += chunk.byteLength;
        if (preview.length < MAX_TRACE_BODY_CHARS) {
          preview += decoder.decode(chunk, { stream: true });
        }
        controller.enqueue(chunk);
      },
      flush() {
        logProviderResponse(enabled, context, {
          status: meta.status,
          contentType: meta.contentType,
          upstreamRequestId: meta.upstreamRequestId,
          durationMs: Date.now() - startedAt,
          bytes,
          ttftMs,
          body: preview,
        });
      },
    }),
  );
}
