import type { TokenUsage } from "@/features/gateway/api";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** Assistant metadata (provider/model + performance). */
  provider?: string | null;
  model?: string;
  ttftMs?: number | null;
  totalMs?: number;
  tokens?: number | null;
  tps?: number | null;
  usage?: TokenUsage | null;
  stopped?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  provider?: string | null;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

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
