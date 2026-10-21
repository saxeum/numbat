import { useMemo } from "react";
import { Link } from "react-router";
import { Plus, Trash2 } from "lucide-react";

import { cn } from "cn";
import { groupConversations } from "@/features/chat/grouping";
import type { Conversation } from "@/features/chat/types";

const NOW = Date.now();

interface Props {
  conversations: Conversation[];
  activeId?: string;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onNew,
  onDelete,
}: Props) {
  const groups = useMemo(
    () => groupConversations(conversations, NOW),
    [conversations],
  );

  return (
    <aside className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onNew}
        className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Plus className="size-4" />
        New chat
      </button>

      <nav className="flex max-h-56 flex-col gap-4 overflow-y-auto lg:max-h-[calc(100svh-20rem)]">
        {conversations.length === 0 ? (
          <p className="px-2 py-1 text-sm text-muted-foreground">
            No conversations yet.
          </p>
        ) : null}
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-2 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              {group.label}
            </p>
            {group.items.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg transition-colors",
                    active ? "bg-primary/10" : "hover:bg-muted/40",
                  )}
                >
                  <Link
                    to={`/gateway/chat/${conversation.id}`}
                    className={cn(
                      "min-w-0 flex-1 truncate px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    {conversation.title || "New chat"}
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete ${conversation.title || "chat"}`}
                    onClick={() => onDelete(conversation.id)}
                    className="mr-1 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
