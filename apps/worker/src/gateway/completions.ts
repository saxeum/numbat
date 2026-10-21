import { openSecret } from "../crypto/vault";
import type { Database } from "../db/client";
import { getSealedCredential } from "../db/queries/credentials";
import { listFreeModels } from "../db/queries/models";
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
  type ProviderId,
  type ProviderSpec,
} from "./providers";

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
}

export interface PrepareInput {
  model: string;
  messages: CompletionMessage[];
  stream: boolean;
  providerHint?: string;
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
    if (!isProviderId(providerHint)) {
      throw new AppError(
        501,
        "UNSUPPORTED_PROVIDER",
        `Provider \`${providerHint}\` is not supported`,
      );
    }
    provider = providerHint;
  } else {
    const match = (await listFreeModels(db)).find((m) => m.modelId === model);
    if (!match) {
      throw new AppError(
        404,
        "MODEL_NOT_FOUND",
        `Model \`${model}\` is not in the catalog`,
      );
    }
    if (!isProviderId(match.provider)) {
      throw new AppError(
        501,
        "UNSUPPORTED_PROVIDER",
        `Provider \`${match.provider}\` is not supported`,
      );
    }
    provider = match.provider;
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
    url = `${spec.chatUrl}/models/${model}:${method}${stream ? "?alt=sse" : ""}`;
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

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: stream ? undefined : AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new AppError(502, "UPSTREAM_ERROR", `The ${provider} request failed`);
  }

  if (!upstream.ok) {
    throw new AppError(
      502,
      "UPSTREAM_ERROR",
      `${spec.label} returned ${upstream.status}`,
    );
  }

  return { provider, spec, model, stream, upstream };
}

/** Shapes the upstream response into the OpenAI-compatible client response. */
export async function clientCompletionResponse(
  prepared: PreparedCompletion,
): Promise<Response> {
  const { provider, spec, model, stream, upstream } = prepared;
  const meta = {
    "x-byokfree-provider": provider,
    "x-byokfree-model": model,
  };

  if (spec.dialect === "gemini") {
    if (stream) {
      if (!upstream.body) {
        throw new AppError(502, "UPSTREAM_ERROR", "Empty upstream stream");
      }
      return new Response(geminiStreamToOpenAI(upstream.body, model), {
        status: 200,
        headers: {
          ...meta,
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
    }
    const json = (await upstream.json()) as Record<string, unknown>;
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
  return new Response(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}

export interface AccumulatedCompletion {
  content: string;
  model: string;
  usage: TokenUsage | null;
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
export function createSseAccumulator() {
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let model = "";
  let usage: TokenUsage | null = null;

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
            choices?: { delta?: { content?: string } }[];
          };
          if (typeof json.model === "string") model = json.model;
          if (json.usage) usage = parseUsage(json.usage);
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === "string") content += delta;
        } catch {
          // ignore malformed SSE line
        }
      }
    },
    result(): AccumulatedCompletion {
      return { content, model, usage };
    },
  };
}

/** Extracts content/model/usage from a non-streaming completion body. */
export function extractCompletion(json: unknown): AccumulatedCompletion {
  const body = (json ?? {}) as {
    model?: string;
    usage?: unknown;
    choices?: { message?: { content?: string } }[];
  };
  return {
    content: body.choices?.[0]?.message?.content ?? "",
    model: typeof body.model === "string" ? body.model : "",
    usage: parseUsage(body.usage),
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
