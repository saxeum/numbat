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
}

export interface ChatInput {
  model: string;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  /** Stream the response (Server-Sent Events). Defaults to non-streaming. */
  stream?: boolean;
  /** Called with each content delta while streaming. */
  onToken?: (delta: string) => void;
}

export async function chat(input: ChatInput): Promise<ChatOutcome> {
  const { onToken, ...body } = input;
  const res = await fetch("/api/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Chat failed"));
  }

  const provider = res.headers.get("x-byokfree-provider");

  if (input.stream) {
    return readStream(res, input.model, provider, onToken);
  }

  const json = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
  };
  return {
    content: json.choices?.[0]?.message?.content ?? "",
    provider,
    model: json.model ?? input.model,
  };
}

/** Parse the gateway's OpenAI-style SSE stream into a final outcome. */
async function readStream(
  res: Response,
  fallbackModel: string,
  provider: string | null,
  onToken?: (delta: string) => void,
): Promise<ChatOutcome> {
  const reader = res.body?.getReader();
  if (!reader) {
    const json = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };
    return {
      content: json.choices?.[0]?.message?.content ?? "",
      provider,
      model: json.model ?? fallbackModel,
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let model = fallbackModel;

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
          choices?: { delta?: { content?: string } }[];
        };
        if (chunk.model) model = chunk.model;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          content += delta;
          onToken?.(delta);
        }
      } catch {
        // ignore malformed SSE line
      }
    }
  }

  return { content, provider, model };
}
