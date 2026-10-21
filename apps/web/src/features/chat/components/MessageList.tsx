import { useEffect, useRef } from "react";

import type { Message } from "@numbat/api";
import { MessageItem } from "@/features/chat/components/MessageItem";

interface Props {
  messages: Message[];
  streaming: boolean;
  liveText: string;
  liveMetrics: { ttftMs: number | null; tokens: number };
  onRegenerate: (message: Message) => void;
  onEdit: (message: Message, content: string) => void;
}

export function MessageList({
  messages,
  streaming,
  liveText,
  liveMetrics,
  onRegenerate,
  onEdit,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Track whether the user is pinned to the bottom; if they scroll up we stop
  // auto-following (P3 adds an explicit "jump to latest" affordance).
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, liveText, streaming]);

  const lastAssistantId = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.id;

  const liveMessage: Message = {
    id: "__live__",
    conversationId: "",
    role: "assistant",
    content: liveText,
    completionTokens: liveMetrics.tokens || null,
    ttftMs: liveMetrics.ttftMs,
    stopped: false,
    createdAt: "",
  };

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            canRegenerate={message.id === lastAssistantId && !streaming}
            onRegenerate={() => onRegenerate(message)}
            onEdit={
              message.role === "user" && !streaming
                ? (content) => onEdit(message, content)
                : undefined
            }
          />
        ))}
        {streaming ? <MessageItem message={liveMessage} streaming /> : null}
      </div>
    </div>
  );
}
