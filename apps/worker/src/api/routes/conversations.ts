import {
  CreateCompletionRequest,
  CreateConversationRequest,
  CreateMessageRequest,
  UpdateConversationRequest,
} from "@numbat/api";
import { Hono } from "hono";

import { createDb } from "../../db/client";
import {
  clientCompletionResponse,
  createSseAccumulator,
  extractCompletion,
  prepareCompletion,
  trimHistory,
  type CompletionMessage,
  type TokenUsage,
} from "../../gateway/completions";
import {
  createConversation,
  createMessage,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  renameConversation,
  touchConversation,
  truncateFromMessage,
} from "../../db/queries/conversations";
import { requireSession } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { validate } from "../openapi";
import type { AppEnv } from "../types";

// Conversations are session-only and owner-scoped (KAN-39).
export const conversations = new Hono<AppEnv>();

conversations.use("*", requireSession);

function notFound(id: string): AppError {
  return new AppError(
    404,
    "CONVERSATION_NOT_FOUND",
    `Conversation ${id} not found`,
  );
}

conversations.get("/", async (c) => {
  const rows = await listConversations(createDb(c.env.DB), c.get("userId"));
  return c.json(rows, 200);
});

conversations.post(
  "/",
  validate("json", CreateConversationRequest),
  async (c) => {
    const { title, model, provider } = c.req.valid("json");
    const now = new Date().toISOString();
    const row = await createConversation(createDb(c.env.DB), {
      id: crypto.randomUUID(),
      ownerId: c.get("userId"),
      title: title ?? "",
      model: model ?? "",
      provider: provider ?? null,
      createdAt: now,
      updatedAt: now,
    });
    return c.json(row, 201);
  },
);

conversations.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env.DB);
  const conversation = await getConversation(db, c.get("userId"), id);
  if (!conversation) throw notFound(id);
  const messages = await listMessages(db, id);
  return c.json({ ...conversation, messages }, 200);
});

conversations.patch(
  "/:id",
  validate("json", UpdateConversationRequest),
  async (c) => {
    const id = c.req.param("id");
    const { title } = c.req.valid("json");
    const row = await renameConversation(
      createDb(c.env.DB),
      c.get("userId"),
      id,
      title,
      new Date().toISOString(),
    );
    if (!row) throw notFound(id);
    return c.json(row, 200);
  },
);

conversations.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await deleteConversation(
    createDb(c.env.DB),
    c.get("userId"),
    id,
  );
  if (!deleted) throw notFound(id);
  return c.body(null, 204);
});

conversations.post(
  "/:id/messages",
  validate("json", CreateMessageRequest),
  async (c) => {
    const id = c.req.param("id");
    const ownerId = c.get("userId");
    const db = createDb(c.env.DB);
    const conversation = await getConversation(db, ownerId, id);
    if (!conversation) throw notFound(id);

    const body = c.req.valid("json");
    const now = new Date().toISOString();
    const row = await createMessage(db, {
      id: crypto.randomUUID(),
      conversationId: id,
      ownerId,
      role: body.role,
      content: body.content,
      model: body.model ?? null,
      provider: body.provider ?? null,
      promptTokens: body.promptTokens ?? null,
      completionTokens: body.completionTokens ?? null,
      reasoningTokens: body.reasoningTokens ?? null,
      reasoning: body.reasoning ?? null,
      reasoningMs: body.reasoningMs ?? null,
      ttftMs: body.ttftMs ?? null,
      totalMs: body.totalMs ?? null,
      stopped: body.stopped ?? false,
      createdAt: now,
    });
    await touchConversation(db, ownerId, id, now);
    return c.json(row, 201);
  },
);

/**
 * Server-orchestrated completion: appends the user turn, replays (trimmed)
 * history, streams the reply, and persists the assistant turn + usage.
 */
conversations.post(
  "/:id/completions",
  validate("json", CreateCompletionRequest),
  async (c) => {
    const id = c.req.param("id");
    const ownerId = c.get("userId");
    const db = createDb(c.env.DB);
    const conversation = await getConversation(db, ownerId, id);
    if (!conversation) throw notFound(id);

    const body = c.req.valid("json");
    const model = body.model;
    const stream = body.stream !== false;

    // Regenerate reuses the existing history; otherwise append the new turn.
    if (!body.regenerate) {
      if (!body.content || !body.content.trim()) {
        throw new AppError(400, "VALIDATION_ERROR", "`content` is required");
      }
      const now = new Date().toISOString();
      await createMessage(db, {
        id: crypto.randomUUID(),
        conversationId: id,
        ownerId,
        role: "user",
        content: body.content,
        model,
        provider: body.provider ?? null,
        promptTokens: null,
        completionTokens: null,
        reasoningTokens: null,
        reasoning: null,
        reasoningMs: null,
        ttftMs: null,
        totalMs: null,
        stopped: false,
        createdAt: now,
      });
      await touchConversation(db, ownerId, id, now);
    }

    const history = await listMessages(db, id);
    const trimmed = trimHistory(
      history.map((message) => ({
        role: message.role as CompletionMessage["role"],
        content: message.content,
      })),
    );

    const startedAt = Date.now();
    const prepared = await prepareCompletion(c.env, db, ownerId, {
      model,
      messages: trimmed.messages,
      stream,
      providerHint: body.provider,
      requestId: c.get("requestId"),
    });

    const response = await clientCompletionResponse(prepared);
    const headers = new Headers(response.headers);
    if (trimmed.omitted > 0) {
      headers.set("x-byokfree-trimmed", String(trimmed.omitted));
    }

    const persistAssistant = async (result: {
      content: string;
      model: string;
      usage: TokenUsage | null;
      reasoning: string;
      reasoningMs: number | null;
      ttftMs: number | null;
      totalMs: number;
    }) => {
      const now = new Date().toISOString();
      await createMessage(db, {
        id: crypto.randomUUID(),
        conversationId: id,
        ownerId,
        role: "assistant",
        content: result.content,
        model: result.model || model,
        provider: prepared.provider,
        promptTokens: result.usage?.prompt ?? null,
        completionTokens: result.usage?.completion ?? null,
        reasoningTokens: result.usage?.reasoning ?? null,
        reasoning: result.reasoning || null,
        reasoningMs: result.reasoningMs,
        ttftMs: result.ttftMs,
        totalMs: result.totalMs,
        stopped: false,
        createdAt: now,
      });
      await touchConversation(db, ownerId, id, now);
    };

    if (stream) {
      if (!response.body) {
        throw new AppError(502, "UPSTREAM_ERROR", "Empty upstream stream");
      }
      const accumulator = createSseAccumulator(startedAt);
      // Persist on flush: the stream only closes after the turn is stored.
      const tapped = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          accumulator.push(chunk);
          controller.enqueue(chunk);
        },
        async flush() {
          await persistAssistant({
            ...accumulator.result(),
            totalMs: Date.now() - startedAt,
          });
        },
      });
      return new Response(response.body.pipeThrough(tapped), {
        status: response.status,
        headers,
      });
    }

    const json = await response.json();
    await persistAssistant({
      ...extractCompletion(json),
      totalMs: Date.now() - startedAt,
    });
    return new Response(JSON.stringify(json), {
      status: response.status,
      headers,
    });
  },
);

// Delete a message and everything after it (edit / regenerate).
conversations.delete("/:id/messages/:messageId", async (c) => {
  const id = c.req.param("id");
  const messageId = c.req.param("messageId");
  const ownerId = c.get("userId");
  const db = createDb(c.env.DB);

  const conversation = await getConversation(db, ownerId, id);
  if (!conversation) throw notFound(id);

  const truncated = await truncateFromMessage(db, ownerId, id, messageId);
  if (!truncated) {
    throw new AppError(
      404,
      "MESSAGE_NOT_FOUND",
      `Message ${messageId} not found`,
    );
  }
  await touchConversation(db, ownerId, id, new Date().toISOString());
  return c.body(null, 204);
});
