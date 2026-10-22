import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { Database } from "../client";
import { conversations, messages } from "../schema";

export interface ConversationRow {
  id: string;
  title: string;
  model: string;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  model: string | null;
  provider: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  reasoning: string | null;
  reasoningMs: number | null;
  ttftMs: number | null;
  totalMs: number | null;
  stopped: boolean;
  createdAt: string;
}

const conversationColumns = {
  id: conversations.id,
  title: conversations.title,
  model: conversations.model,
  provider: conversations.provider,
  createdAt: conversations.createdAt,
  updatedAt: conversations.updatedAt,
};

const messageColumns = {
  id: messages.id,
  conversationId: messages.conversationId,
  role: messages.role,
  content: messages.content,
  model: messages.model,
  provider: messages.provider,
  promptTokens: messages.promptTokens,
  completionTokens: messages.completionTokens,
  reasoningTokens: messages.reasoningTokens,
  reasoning: messages.reasoning,
  reasoningMs: messages.reasoningMs,
  ttftMs: messages.ttftMs,
  totalMs: messages.totalMs,
  stopped: messages.stopped,
  createdAt: messages.createdAt,
};

export function listConversations(
  db: Database,
  ownerId: string,
): Promise<ConversationRow[]> {
  return db
    .select(conversationColumns)
    .from(conversations)
    .where(eq(conversations.ownerId, ownerId))
    .orderBy(desc(conversations.updatedAt));
}

export interface CreateConversationValues {
  id: string;
  ownerId: string;
  title: string;
  model: string;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createConversation(
  db: Database,
  values: CreateConversationValues,
): Promise<ConversationRow> {
  const [row] = await db
    .insert(conversations)
    .values(values)
    .returning(conversationColumns);
  return row!;
}

export async function getConversation(
  db: Database,
  ownerId: string,
  id: string,
): Promise<ConversationRow | undefined> {
  const [row] = await db
    .select(conversationColumns)
    .from(conversations)
    .where(and(eq(conversations.ownerId, ownerId), eq(conversations.id, id)))
    .limit(1);
  return row;
}

export function listMessages(
  db: Database,
  conversationId: string,
): Promise<MessageRow[]> {
  return db
    .select(messageColumns)
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}

export interface CreateMessageValues {
  id: string;
  conversationId: string;
  ownerId: string;
  role: string;
  content: string;
  model: string | null;
  provider: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  reasoning: string | null;
  reasoningMs: number | null;
  ttftMs: number | null;
  totalMs: number | null;
  stopped: boolean;
  createdAt: string;
}

export async function createMessage(
  db: Database,
  values: CreateMessageValues,
): Promise<MessageRow> {
  const [row] = await db
    .insert(messages)
    .values(values)
    .returning(messageColumns);
  return row!;
}

export async function renameConversation(
  db: Database,
  ownerId: string,
  id: string,
  title: string,
  updatedAt: string,
): Promise<ConversationRow | undefined> {
  const [row] = await db
    .update(conversations)
    .set({ title, updatedAt })
    .where(and(eq(conversations.ownerId, ownerId), eq(conversations.id, id)))
    .returning(conversationColumns);
  return row;
}

/** Bump a conversation to the top of the list after a new message. */
export async function touchConversation(
  db: Database,
  ownerId: string,
  id: string,
  updatedAt: string,
): Promise<void> {
  await db
    .update(conversations)
    .set({ updatedAt })
    .where(and(eq(conversations.ownerId, ownerId), eq(conversations.id, id)));
}

/**
 * Delete a message and every message appended after it (edit / regenerate).
 * Uses SQLite `rowid` so ordering is insertion order, not timestamp order.
 */
export async function truncateFromMessage(
  db: Database,
  ownerId: string,
  conversationId: string,
  messageId: string,
): Promise<boolean> {
  const [target] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.ownerId, ownerId),
        eq(messages.conversationId, conversationId),
        eq(messages.id, messageId),
      ),
    )
    .limit(1);
  if (!target) return false;

  await db
    .delete(messages)
    .where(
      and(
        eq(messages.ownerId, ownerId),
        eq(messages.conversationId, conversationId),
        sql`rowid >= (SELECT rowid FROM messages WHERE id = ${messageId})`,
      ),
    );
  return true;
}

export async function deleteConversation(
  db: Database,
  ownerId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(conversations)
    .where(and(eq(conversations.ownerId, ownerId), eq(conversations.id, id)))
    .returning({ id: conversations.id });
  return rows.length > 0;
}
