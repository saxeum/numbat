import { openSecret } from "../crypto/vault";
import type { Database } from "../db/client";
import { getSealedCredential } from "../db/queries/credentials";
import { listFreeModels } from "../db/queries/models";
import { getAvailableModel, ownerHasAvailability } from "../db/queries/reports";
import { availabilitySince } from "../reports/availability";
import { AppError } from "../api/middleware/error";
import {
  fromGeminiResponse,
  geminiStreamToOpenAI,
  toGeminiRequest,
} from "./gemini";
import type { ChatCompletionRequest } from "./openai";
import {
  getProvider,
  isProviderId,
  stripModelsPrefix,
  type ProviderId,
  type ProviderSpec,
} from "./providers";
import {
  llmLoggingEnabled,
  logProviderRequest,
  logProviderResponse,
  tapForTrace,
  type ProviderTraceContext,
} from "./trace";

export const UPSTREAM_TIMEOUT_MS = 60_000;

/** Rough character budget for replayed history (~12k tokens). */
export const DEFAULT_MAX_HISTORY_CHARS = 48_000;

export interface CompletionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface TokenUsage {
  prompt: number | null;
  completion: number | null;
  reasoning: number | null;
}

export interface PreparedCompletion {
  provider: ProviderId;
  spec: ProviderSpec;
  model: string;
  stream: boolean;
  upstream: Response;
  /** Correlates provider traces with the request log. */
  requestId?: string;
  /** Whether `GATEWAY_LLM_LOGGING` was on for this request. */
  logging: boolean;
  /** When the upstream call started (for trace durations). */
  startedAt: number;
}

export interface PrepareInput {
  model: string;
  messages: CompletionMessage[];
  stream: boolean;
  providerHint?: string;
  requestId?: string;
}

function upstreamRequestId(upstream: Response): string | null {
  return upstream.headers.get("x-request-id") ?? upstream.headers.get("cf-ray");
}

function requireProvider(provider: string): ProviderId {
  if (!isProviderId(provider)) {
    throw new AppError(
      501,
      "UNSUPPORTED_PROVIDER",
      `Provider \`${provider}\` is not supported`,
    );
  }
  return provider;
}

/**
 * Resolves the provider for a bare model id from the caller's availability.
 * The global catalog is only a fallback for users who have never run a report;
 * once a user has availability rows, models outside it are rejected.
 */
async function resolveProvider(
  env: Env,
  db: Database,
  ownerId: string,
  model: string,
): Promise<ProviderId> {
  const sinceIso = availabilitySince(env);
  // Availability may hold either form (older Gemini rows were stored with the
  // shim's `models/` prefix), so try the exact id and both normalizations.
  const bare = stripModelsPrefix(model);
  const candidates = model === bare ? [model, `models/${bare}`] : [model, bare];
  for (const candidate of candidates) {
    const available = await getAvailableModel(db, ownerId, candidate, sinceIso);
    if (available) {
      return requireProvider(available.provider);
    }
  }

  if (await ownerHasAvailability(db, ownerId)) {
    throw new AppError(
      404,
      "MODEL_NOT_AVAILABLE",
      `Model \`${model}\` is not available for your account; run a report to check your keys`,
    );
  }

  const match = (await listFreeModels(db)).find((m) => m.modelId === bare);
  if (!match) {
    throw new AppError(
      404,
      "MODEL_NOT_FOUND",
      `Model \`${model}\` is not in the catalog`,
    );
  }
  return requireProvider(match.provider);
}

/**
 * Resolves the provider, decrypts the caller's credential, and calls the
 * upstream chat API. Shared by the stateless `/chat/completions` proxy and the
 * conversation-scoped `/conversations/{id}/completions` endpoint.
 */
export async function prepareCompletion(
  env: Env,
  db: Database,
  ownerId: string,
  input: PrepareInput,
): Promise<PreparedCompletion> {
  const { model, messages, stream, providerHint } = input;

  let provider: ProviderId;
  if (providerHint) {
    provider = requireProvider(providerHint);
  } else {
    provider = await resolveProvider(env, db, ownerId, model);
  }

  if (!env.BYOK_KEK) {
    throw new AppError(
      500,
      "SERVER_MISCONFIGURED",
      "Server is missing BYOK_KEK (the envelope-encryption key). Set it in .dev.vars / as a Worker secret.",
    );
  }

  const sealed = await getSealedCredential(db, ownerId, provider);
  if (!sealed) {
    throw new AppError(
      400,
      "NO_CREDENTIAL",
      `No ${provider} credential is connected`,
    );
  }
  const apiKey = await openSecret(
    env,
    { ownerId, provider, label: sealed.label },
    sealed,
  );

  const spec = getProvider(provider);
  const headers = { ...spec.auth(apiKey), "content-type": "application/json" };
  const body: ChatCompletionRequest = { model, messages, stream };

  let url: string;
  let payload: unknown;
  if (spec.dialect === "gemini") {
    const method = stream ? "streamGenerateContent" : "generateContent";
    url = `${spec.chatUrl}/models/${stripModelsPrefix(model)}:${method}${stream ? "?alt=sse" : ""}`;
    payload = toGeminiRequest(body);
  } else {
    url = spec.chatUrl;
    payload = {
      ...body,
      // Ask OpenAI-compatible providers for a final `usage` chunk while
      // streaming, so token counts are exact. Ignored by Gemini.
      ...(stream ? { stream_options: { include_usage: true } } : {}),
    };
  }

  const trace: ProviderTraceContext = {
    requestId: input.requestId,
    provider,
    model,
    stream,
  };
  const logging = llmLoggingEnabled(env);
  logProviderRequest(logging, trace, { url, payload });
  const startedAt = Date.now();

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: stream ? undefined : AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    logProviderResponse(logging, trace, {
      status: 502,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "request failed",
    });
    throw new AppError(502, "UPSTREAM_ERROR", `The ${provider} request failed`);
  }

  if (!upstream.ok) {
    logProviderResponse(logging, trace, {
      status: upstream.status,
      contentType: upstream.headers.get("content-type"),
      upstreamRequestId: upstreamRequestId(upstream),
      durationMs: Date.now() - startedAt,
      error: `${spec.label} returned ${upstream.status}`,
    });
    throw new AppError(
      502,
      "UPSTREAM_ERROR",
      `${spec.label} returned ${upstream.status}`,
    );
  }

  return {
    provider,
    spec,
    model,
    stream,
    upstream,
    requestId: input.requestId,
    logging,
    startedAt,
  };
}

/** Shapes the upstream response into the OpenAI-compatible client response. */
export async function clientCompletionResponse(
  prepared: PreparedCompletion,
): Promise<Response> {
  const {
    provider,
    spec,
    model,
    stream,
    upstream,
    requestId,
    logging,
    startedAt,
  } = prepared;
  const meta = {
    "x-byokfree-provider": provider,
    "x-byokfree-model": model,
  };
  const trace: ProviderTraceContext = { requestId, provider, model, stream };

  if (spec.dialect === "gemini") {
    if (stream) {
      if (!upstream.body) {
        throw new AppError(502, "UPSTREAM_ERROR", "Empty upstream stream");
      }
      const contentType = "text/event-stream; charset=utf-8";
      return new Response(
        tapForTrace(
          logging,
          trace,
          geminiStreamToOpenAI(upstream.body, model),
          {
            status: 200,
            contentType,
            upstreamRequestId: upstreamRequestId(upstream),
          },
        ),
        {
          status: 200,
          headers: {
            ...meta,
            "content-type": contentType,
            "cache-control": "no-cache",
          },
        },
      );
    }
    const json = (await upstream.json()) as Record<string, unknown>;
    logProviderResponse(logging, trace, {
      status: 200,
      contentType: "application/json",
      upstreamRequestId: upstreamRequestId(upstream),
      durationMs: Date.now() - startedAt,
      body: JSON.stringify(json),
    });
    return new Response(JSON.stringify(fromGeminiResponse(json, model)), {
      status: 200,
      headers: { ...meta, "content-type": "application/json" },
    });
  }

  // OpenAI-compatible: pass JSON / SSE through untouched.
  const outHeaders = new Headers(meta);
  const contentType = upstream.headers.get("content-type");
  if (contentType) outHeaders.set("content-type", contentType);
  if (stream) outHeaders.set("cache-control", "no-cache");

  if (stream && upstream.body) {
    return new Response(
      tapForTrace(logging, trace, upstream.body, {
        status: upstream.status,
        contentType,
        upstreamRequestId: upstreamRequestId(upstream),
      }),
      { status: upstream.status, headers: outHeaders },
    );
  }

  // Non-streamed OpenAI body: clone so the client stream is left untouched.
  const logBody = logging ? await upstream.clone().text() : undefined;
  logProviderResponse(logging, trace, {
    status: upstream.status,
    contentType,
    upstreamRequestId: upstreamRequestId(upstream),
    durationMs: Date.now() - startedAt,
    body: logBody,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}

export interface AccumulatedCompletion {
  content: string;
  model: string;
  usage: TokenUsage | null;
  /** Time to first content token (ms); null for non-streamed replies. */
  ttftMs: number | null;
  /** Extended-thinking text (Gemini thoughts / OpenAI `reasoning_content`). */
  reasoning: string;
  /** How long the model thought before the answer started (ms); null if unknown. */
  reasoningMs: number | null;
}

function parseUsage(raw: unknown): TokenUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const usage = raw as {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  return {
    prompt:
      typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
    completion:
      typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : null,
    reasoning:
      typeof usage.completion_tokens_details?.reasoning_tokens === "number"
        ? usage.completion_tokens_details.reasoning_tokens
        : null,
  };
}

/** Accumulates an OpenAI-shaped SSE stream (used to persist the turn). */
export function createSseAccumulator(startedAt: number) {
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let model = "";
  let usage: TokenUsage | null = null;
  let ttftMs: number | null = null;
  let reasoning = "";
  let reasoningStartedAt: number | null = null;
  let reasoningMs: number | null = null;

  return {
    push(chunk: Uint8Array) {
      buffer += decoder.decode(chunk, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload) as {
            model?: string;
            usage?: unknown;
            choices?: {
              delta?: {
                content?: string;
                reasoning_content?: string;
                reasoning?: string;
              };
            }[];
          };
          if (typeof json.model === "string") model = json.model;
          if (json.usage) usage = parseUsage(json.usage);
          const delta = json.choices?.[0]?.delta;
          const reasoningDelta =
            typeof delta?.reasoning_content === "string"
              ? delta.reasoning_content
              : typeof delta?.reasoning === "string"
                ? delta.reasoning
                : "";
          if (reasoningDelta) {
            if (reasoningStartedAt === null) reasoningStartedAt = Date.now();
            reasoning += reasoningDelta;
          }
          const contentDelta = delta?.content;
          if (typeof contentDelta === "string" && contentDelta.length > 0) {
            const now = Date.now();
            if (ttftMs === null) ttftMs = now - startedAt;
            if (reasoningMs === null && reasoningStartedAt !== null) {
              reasoningMs = now - reasoningStartedAt;
            }
            content += contentDelta;
          }
        } catch {
          // ignore malformed SSE line
        }
      }
    },
    result(): AccumulatedCompletion {
      const finalReasoningMs =
        reasoningMs ?? (reasoning ? Date.now() - startedAt : null);
      return {
        content,
        model,
        usage,
        ttftMs,
        reasoning,
        reasoningMs: finalReasoningMs,
      };
    },
  };
}

/** Extracts content/model/usage from a non-streaming completion body. */
export function extractCompletion(json: unknown): AccumulatedCompletion {
  const body = (json ?? {}) as {
    model?: string;
    usage?: unknown;
    choices?: {
      message?: { content?: string; reasoning_content?: string };
    }[];
  };
  return {
    content: body.choices?.[0]?.message?.content ?? "",
    model: typeof body.model === "string" ? body.model : "",
    usage: parseUsage(body.usage),
    ttftMs: null,
    reasoning: body.choices?.[0]?.message?.reasoning_content ?? "",
    reasoningMs: null,
  };
}

/**
 * Keeps the most recent messages that fit the character budget (oldest dropped
 * first). Always keeps at least the final message.
 */
export function trimHistory(
  messages: CompletionMessage[],
  maxChars: number = DEFAULT_MAX_HISTORY_CHARS,
): { messages: CompletionMessage[]; omitted: number } {
  const kept: CompletionMessage[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    const cost = message.content.length;
    if (kept.length > 0 && total + cost > maxChars) break;
    kept.unshift(message);
    total += cost;
  }
  return { messages: kept, omitted: messages.length - kept.length };
}
