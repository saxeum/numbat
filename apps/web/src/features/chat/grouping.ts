import type { Conversation } from "@numbat/api";

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

  const sorted = [...list].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );

  for (const conversation of sorted) {
    const ts = Date.parse(conversation.updatedAt);
    if (ts >= today) buckets.Today.push(conversation);
    else if (ts >= yesterday) buckets.Yesterday.push(conversation);
    else if (ts >= weekAgo) buckets["Previous 7 days"].push(conversation);
    else buckets.Older.push(conversation);
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}
