import { Hono } from "hono";

import { createDb } from "../../db/client";
import {
  clientCompletionResponse,
  prepareCompletion,
  type CompletionMessage,
} from "../../gateway/completions";
import type { ChatCompletionRequest } from "../../gateway/openai";
import { requireUser } from "../middleware/auth";
import { AppError } from "../middleware/error";
import type { AppEnv } from "../types";

export const chat = new Hono<AppEnv>();

// Authenticated + owner-scoped. Uses the caller's stored, encrypted credential.
chat.use("*", requireUser);

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

  const prepared = await prepareCompletion(
    c.env,
    createDb(c.env.DB),
    c.get("userId"),
    {
      model: body.model,
      messages: body.messages as CompletionMessage[],
      stream: body.stream === true,
      providerHint: typeof providerHint === "string" ? providerHint : undefined,
    },
  );

  return clientCompletionResponse(prepared);
});
