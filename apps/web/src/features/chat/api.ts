import {
  Conversation,
  ConversationDetail,
  CreateConversationRequest,
  CreateMessageRequest,
  Message,
  UpdateConversationRequest,
} from "@numbat/api";
import { z } from "zod";

import { postChat, type ChatOutcome } from "@/features/gateway/api";

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? `${fallback} (${res.status})`;
}

export async function listConversations() {
  const res = await fetch("/api/conversations");
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to load conversations"));
  }
  return z.array(Conversation).parse(await res.json());
}

export async function getConversation(id: string) {
  const res = await fetch(`/api/conversations/${id}`);
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to load conversation"));
  }
  return ConversationDetail.parse(await res.json());
}

export async function createConversation(input: CreateConversationRequest) {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to create conversation"));
  }
  return Conversation.parse(await res.json());
}

export async function renameConversation(id: string, title: string) {
  const body: UpdateConversationRequest = { title };
  const res = await fetch(`/api/conversations/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to rename conversation"));
  }
  return Conversation.parse(await res.json());
}

export async function deleteConversation(id: string) {
  const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to delete conversation"));
  }
}

export async function createMessage(
  conversationId: string,
  input: CreateMessageRequest,
) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to save message"));
  }
  return Message.parse(await res.json());
}

export interface CompleteConversationInput {
  model: string;
  /** The new user turn. Omit when `regenerate`. */
  content?: string;
  /** Re-run the last turn against the existing history. */
  regenerate?: boolean;
  provider?: string;
  stream?: boolean;
  onToken?: (delta: string) => void;
  signal?: AbortSignal;
}

/**
 * Server-orchestrated completion: the worker appends the turn, replays trimmed
 * history, and persists the assistant reply. The client only renders the stream.
 */
export async function completeConversation(
  conversationId: string,
  input: CompleteConversationInput,
): Promise<ChatOutcome> {
  const { onToken, signal, ...body } = input;
  return postChat({
    url: `/api/conversations/${conversationId}/completions`,
    body,
    model: input.model,
    stream: input.stream,
    onToken,
    signal,
  });
}

/** Delete a message and everything after it (edit / regenerate). */
export async function truncateFromMessage(
  conversationId: string,
  messageId: string,
) {
  const res = await fetch(
    `/api/conversations/${conversationId}/messages/${messageId}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to rewind conversation"));
  }
}
