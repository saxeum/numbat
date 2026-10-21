import { useSyncExternalStore } from "react";

import {
  deriveTitle,
  type ChatMessage,
  type Conversation,
} from "@/features/chat/types";

/**
 * P0 conversation store. Conversations live in `localStorage` only — D1
 * persistence lands in KAN-39 (P1). A tiny external store + `useSyncExternalStore`
 * keeps every subscriber in sync without a state library.
 */
const STORAGE_KEY = "foonix.chat.v1";

function load(): Conversation[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Conversation[]) : [];
  } catch {
    return [];
  }
}

let conversations: Conversation[] = load();
const listeners = new Set<() => void>();

function commit(next: Conversation[]) {
  conversations = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // Quota/private mode — keep the in-memory copy working.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return conversations;
}

export function useConversations(): Conversation[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useConversation(id: string | undefined): Conversation | null {
  const all = useConversations();
  if (!id) return null;
  return all.find((c) => c.id === id) ?? null;
}

function sortByRecent(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createConversation(model: string): Conversation {
  const now = Date.now();
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    title: "New chat",
    model,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  commit([conversation, ...conversations]);
  return conversation;
}

export function renameConversation(id: string, title: string) {
  commit(
    conversations.map((c) =>
      c.id === id
        ? { ...c, title: title.trim() || c.title, updatedAt: Date.now() }
        : c,
    ),
  );
}

export function deleteConversation(id: string) {
  commit(conversations.filter((c) => c.id !== id));
}

export function appendMessage(
  conversationId: string,
  message: ChatMessage,
): void {
  commit(
    sortByRecent(
      conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const messages = [...c.messages, message];
        const firstUser = messages.find((m) => m.role === "user");
        return {
          ...c,
          messages,
          // Auto-title from the first user message until the user renames it.
          title:
            c.title === "New chat" && firstUser
              ? deriveTitle(firstUser.content)
              : c.title,
          updatedAt: Date.now(),
        };
      }),
    ),
  );
}

export function updateMessage(
  conversationId: string,
  messageId: string,
  patch: Partial<ChatMessage>,
): void {
  commit(
    conversations.map((c) =>
      c.id === conversationId
        ? {
            ...c,
            messages: c.messages.map((m) =>
              m.id === messageId ? { ...m, ...patch } : m,
            ),
            updatedAt: Date.now(),
          }
        : c,
    ),
  );
}

/** Drop every message after `messageId` (used by edit/regenerate in P2). */
export function truncateAfter(conversationId: string, messageId: string): void {
  commit(
    conversations.map((c) => {
      if (c.id !== conversationId) return c;
      const index = c.messages.findIndex((m) => m.id === messageId);
      if (index < 0) return c;
      return {
        ...c,
        messages: c.messages.slice(0, index + 1),
        updatedAt: Date.now(),
      };
    }),
  );
}
