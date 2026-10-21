import type { Conversation } from "@/features/chat/types";

const DAY_MS = 86_400_000;

export interface ConversationGroup {
  label: string;
  items: Conversation[];
}

function startOfDay(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Buckets conversations by recency, newest first within each group. */
export function groupConversations(
  list: Conversation[],
  now: number,
): ConversationGroup[] {
  const today = startOfDay(now);
  const yesterday = today - DAY_MS;
  const weekAgo = today - 6 * DAY_MS;

  const buckets: Record<string, Conversation[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };

  for (const conversation of [...list].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  )) {
    if (conversation.updatedAt >= today) buckets.Today.push(conversation);
    else if (conversation.updatedAt >= yesterday)
      buckets.Yesterday.push(conversation);
    else if (conversation.updatedAt >= weekAgo)
      buckets["Previous 7 days"].push(conversation);
    else buckets.Older.push(conversation);
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}
