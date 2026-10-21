import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Check, Pencil, Trash2, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "cn";
import { groupConversations } from "@/features/chat/grouping";
import type { Conversation } from "@/features/chat/types";

const NOW = Date.now();

interface Props {
  conversations: Conversation[];
  activeId?: string;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onNavigate?: () => void;
}

/** Grouped conversation list (rendered inside the app sidebar's scroll area). */
export function ConversationList({
  conversations,
  activeId,
  onRename,
  onDelete,
  onNavigate,
}: Props) {
  const groups = useMemo(
    () => groupConversations(conversations, NOW),
    [conversations],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (conversations.length === 0) {
    return (
      <p className="px-2 py-1 text-sm text-muted-foreground">
        No conversations yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-2 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            {group.label}
          </p>
          {group.items.map((conversation) => {
            const active = conversation.id === activeId;

            if (editingId === conversation.id) {
              return (
                <form
                  key={conversation.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    onRename(conversation.id, draft);
                    setEditingId(null);
                  }}
                  className="flex items-center gap-1"
                >
                  <Input
                    value={draft}
                    autoFocus
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setEditingId(null);
                    }}
                    className="h-8 text-sm"
                  />
                  <button
                    type="submit"
                    aria-label="Save title"
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Check className="size-3.5" />
                  </button>
                </form>
              );
            }

            if (confirmingId === conversation.id) {
              return (
                <div
                  key={conversation.id}
                  className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    Delete?
                  </span>
                  <button
                    type="button"
                    aria-label="Confirm delete"
                    onClick={() => {
                      onDelete(conversation.id);
                      setConfirmingId(null);
                    }}
                    className="rounded p-1 text-destructive hover:text-destructive/80"
                  >
                    <Check className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel delete"
                    onClick={() => setConfirmingId(null)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            }

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
                  onClick={onNavigate}
                  onDoubleClick={() => {
                    setDraft(conversation.title);
                    setEditingId(conversation.id);
                  }}
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
                  aria-label={`Rename ${conversation.title || "chat"}`}
                  onClick={() => {
                    setDraft(conversation.title);
                    setEditingId(conversation.id);
                  }}
                  className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${conversation.title || "chat"}`}
                  onClick={() => setConfirmingId(conversation.id)}
                  className="mr-1 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
