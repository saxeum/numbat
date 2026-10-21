import { Hono } from "hono";

import { openSecret } from "../../crypto/vault";
import { createDb } from "../../db/client";
import { getSealedCredential } from "../../db/queries/credentials";
import { listFreeModels } from "../../db/queries/models";
import {
  fromGeminiResponse,
  geminiStreamToOpenAI,
  toGeminiRequest,
} from "../../gateway/gemini";
import type { ChatCompletionRequest } from "../../gateway/openai";
import {
  getProvider,
  isProviderId,
  type ProviderId,
} from "../../gateway/providers";
import { requireSession } from "../middleware/auth";
import { AppError } from "../middleware/error";
import type { AppEnv } from "../types";

export const chat = new Hono<AppEnv>();

// Authenticated + owner-scoped. Uses the caller's stored, encrypted credential.
chat.use("*", requireSession);

const TIMEOUT_MS = 60_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

chat.post("/completions", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
  if (!isObject(raw)) {
    throw new AppError(
      400,
      "INVALID_JSON",
      "Request body must be a JSON object",
    );
  }

  const { provider: providerHint, ...body } = raw as ChatCompletionRequest;
  if (typeof body.model !== "string" || !body.model) {
    throw new AppError(400, "VALIDATION_ERROR", "`model` is required");
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "`messages` must be a non-empty array",
    );
  }

  const ownerId = c.get("user").id;
  const db = createDb(c.env.DB);

  // Resolve the provider: explicit hint, else the model's catalog entry.
  let provider: ProviderId;
  if (typeof providerHint === "string" && providerHint) {
    if (!isProviderId(providerHint)) {
      throw new AppError(
        501,
        "UNSUPPORTED_PROVIDER",
        `Provider \`${providerHint}\` is not supported`,
      );
    }
    provider = providerHint;
  } else {
    const match = (await listFreeModels(db)).find(
      (m) => m.modelId === body.model,
    );
    if (!match) {
      throw new AppError(
        404,
        "MODEL_NOT_FOUND",
        `Model \`${body.model}\` is not in the catalog`,
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

  if (!c.env.BYOK_KEK) {
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
    c.env,
    { ownerId, provider, label: sealed.label },
    sealed,
  );

  const spec = getProvider(provider);
  const stream = body.stream === true;
  const headers = { ...spec.auth(apiKey), "content-type": "application/json" };

  let url: string;
  let payload: unknown;
  if (spec.dialect === "gemini") {
    const method = stream ? "streamGenerateContent" : "generateContent";
    url = `${spec.chatUrl}/models/${body.model}:${method}${stream ? "?alt=sse" : ""}`;
    payload = toGeminiRequest(body);
  } else {
    url = spec.chatUrl;
    payload = { ...body, model: body.model };
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: stream ? undefined : AbortSignal.timeout(TIMEOUT_MS),
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

  const meta = {
    "x-byokfree-provider": provider,
    "x-byokfree-model": body.model,
  };

  if (spec.dialect === "gemini") {
    if (stream) {
      if (!upstream.body) {
        throw new AppError(502, "UPSTREAM_ERROR", "Empty upstream stream");
      }
      return new Response(geminiStreamToOpenAI(upstream.body, body.model), {
        status: 200,
        headers: {
          ...meta,
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
    }
    const json = (await upstream.json()) as Record<string, unknown>;
    return new Response(JSON.stringify(fromGeminiResponse(json, body.model)), {
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
});
