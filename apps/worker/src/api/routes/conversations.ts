import {
  CreateConversationRequest,
  CreateMessageRequest,
  UpdateConversationRequest,
} from "@numbat/api";
import { Hono } from "hono";

import { createDb } from "../../db/client";
import {
  createConversation,
  createMessage,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  renameConversation,
  touchConversation,
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
      ttftMs: body.ttftMs ?? null,
      totalMs: body.totalMs ?? null,
      stopped: body.stopped ?? false,
      createdAt: now,
    });
    await touchConversation(db, ownerId, id, now);
    return c.json(row, 201);
  },
);
