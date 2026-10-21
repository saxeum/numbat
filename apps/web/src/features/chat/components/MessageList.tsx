import { useEffect, useRef } from "react";

import { MessageItem } from "@/features/chat/components/MessageItem";
import type { ChatMessage } from "@/features/chat/types";

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  liveText: string;
  liveMetrics: { ttftMs: number | null; tokens: number };
}

export function MessageList({
  messages,
  streaming,
  liveText,
  liveMetrics,
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

  const liveMessage: ChatMessage = {
    id: "__live__",
    role: "assistant",
    content: liveText,
    createdAt: 0,
    ttftMs: liveMetrics.ttftMs,
    tokens: liveMetrics.tokens || null,
  };

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
        {streaming ? <MessageItem message={liveMessage} /> : null}
      </div>
    </div>
  );
}
