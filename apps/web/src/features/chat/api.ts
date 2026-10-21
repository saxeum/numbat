import {
  Conversation,
  ConversationDetail,
  CreateConversationRequest,
  CreateMessageRequest,
  Message,
  UpdateConversationRequest,
} from "@numbat/api";
import { z } from "zod";

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
