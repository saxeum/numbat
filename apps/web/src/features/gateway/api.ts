import {
  ApiKey,
  ApiKeyCreated,
  CreateApiKeyRequest,
  Credential,
  CreateCredentialRequest,
  ModelList,
} from "@numbat/api";
import { z } from "zod";

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? `${fallback} (${res.status})`;
}

export async function listCredentials() {
  const res = await fetch("/api/credentials");
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to load credentials"));
  }
  return z.array(Credential).parse(await res.json());
}

export async function createCredential(input: CreateCredentialRequest) {
  const res = await fetch("/api/credentials", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to save credential"));
  }
  return Credential.parse(await res.json());
}

export async function deleteCredential(id: string) {
  const res = await fetch(`/api/credentials/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to delete credential"));
  }
}

export async function listModels() {
  const res = await fetch("/api/models");
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to load models"));
  }
  return ModelList.parse(await res.json());
}

export async function listApiKeys() {
  const res = await fetch("/api/keys");
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to load API keys"));
  }
  return z.array(ApiKey).parse(await res.json());
}

export async function createApiKey(input: CreateApiKeyRequest) {
  const res = await fetch("/api/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to create API key"));
  }
  return ApiKeyCreated.parse(await res.json());
}

export async function revokeApiKey(id: string) {
  const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to revoke API key"));
  }
}

export interface ChatOutcome {
  content: string;
  provider: string | null;
  model: string;
  /** Time to first token for a streamed reply (ms); null when not streamed. */
  ttftMs: number | null;
  /** Wall-clock duration of the request (ms). */
  totalMs: number;
  /** Completion tokens (provider usage, else streamed-delta estimate). */
  tokens: number | null;
  /** Tokens per second over the generation window. */
  tps: number | null;
}

function rate(tokens: number | null, ms: number): number | null {
  return tokens && ms > 0 ? tokens / (ms / 1000) : null;
}

export interface ChatInput {
  model: string;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  /** Stream the response (Server-Sent Events). Defaults to non-streaming. */
  stream?: boolean;
  /** Called with each content delta while streaming. */
  onToken?: (delta: string) => void;
  /** Abort the in-flight request. */
  signal?: AbortSignal;
}

export async function chat(input: ChatInput): Promise<ChatOutcome> {
  const { onToken, signal, ...body } = input;
  const started = performance.now();
  const res = await fetch("/api/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Chat failed"));
  }

  const provider = res.headers.get("x-byokfree-provider");

  if (input.stream) {
    return readStream(res, input.model, provider, onToken, started);
  }

  const json = (await res.json()) as {
    model?: string;
    usage?: { completion_tokens?: number };
    choices?: { message?: { content?: string } }[];
  };
  const totalMs = performance.now() - started;
  const tokens = json.usage?.completion_tokens ?? null;
  return {
    content: json.choices?.[0]?.message?.content ?? "",
    provider,
    model: json.model ?? input.model,
    ttftMs: null,
    totalMs,
    tokens,
    tps: rate(tokens, totalMs),
  };
}

/** Parse the gateway's OpenAI-style SSE stream into a final outcome. */
async function readStream(
  res: Response,
  fallbackModel: string,
  provider: string | null,
  onToken: ((delta: string) => void) | undefined,
  started: number,
): Promise<ChatOutcome> {
  const reader = res.body?.getReader();
  if (!reader) {
    const json = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };
    const totalMs = performance.now() - started;
    return {
      content: json.choices?.[0]?.message?.content ?? "",
      provider,
      model: json.model ?? fallbackModel,
      ttftMs: null,
      totalMs,
      tokens: null,
      tps: null,
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let model = fallbackModel;
  let ttftMs: number | null = null;
  let lastTokenMs = 0;
  let tokenEvents = 0;
  let usageTokens: number | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as {
          model?: string;
          usage?: { completion_tokens?: number };
          choices?: { delta?: { content?: string; reasoning?: string } }[];
        };
        if (chunk.model) model = chunk.model;
        if (typeof chunk.usage?.completion_tokens === "number") {
          usageTokens = chunk.usage.completion_tokens;
        }
        const delta = chunk.choices?.[0]?.delta;
        const contentDelta =
          typeof delta?.content === "string" ? delta.content : "";
        // Reasoning tokens still take time; count them for TTFT/TPS.
        const reasoningDelta =
          typeof delta?.reasoning === "string" ? delta.reasoning : "";
        if (contentDelta || reasoningDelta) {
          const now = performance.now() - started;
          if (ttftMs === null) ttftMs = now;
          lastTokenMs = now;
          tokenEvents += 1;
          if (contentDelta) {
            content += contentDelta;
            onToken?.(contentDelta);
          }
        }
      } catch {
        // ignore malformed SSE line
      }
    }
  }

  const totalMs = performance.now() - started;
  const tokens = usageTokens ?? (tokenEvents > 0 ? tokenEvents : null);
  const generationMs = ttftMs !== null ? lastTokenMs - ttftMs : 0;
  // Guard against buffered/bursty delivery: assume >= ~1ms per token, else use
  // the whole-request window.
  const denomMs = tokens && generationMs >= tokens ? generationMs : totalMs;
  return {
    content,
    provider,
    model,
    ttftMs,
    totalMs,
    tokens,
    tps: rate(tokens, denomMs),
  };
}
