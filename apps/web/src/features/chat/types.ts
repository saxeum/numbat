import type { Conversation, Message } from "@numbat/api";

export type { Conversation, Message };

export type ChatRole = "user" | "assistant" | "system";

export type ChatRequestMessage = {
  role: ChatRole;
  content: string;
};

/** ~48-char title from the first user message (P0 heuristic; model titles in P2). */
export function deriveTitle(text: string): string {
  const firstLine = text.trim().split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "New chat";
  return firstLine.length > 48 ? `${firstLine.slice(0, 47)}…` : firstLine;
}
