import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";

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
  const [atBottom, setAtBottom] = useState(true);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickRef.current = near;
    setAtBottom(near);
  }

  function scrollToBottom(smooth = true) {
    const el = scrollRef.current;
    if (!el) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth && !reduce ? "smooth" : "auto",
    });
    stickRef.current = true;
    setAtBottom(true);
  }

  // Follow the stream while pinned to the bottom.
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
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-testid="message-scroll"
        onScroll={onScroll}
        className="h-full overflow-y-auto px-4 py-6 sm:px-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {/* Live region announces persisted turns (not each streamed token). */}
          <div
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            className="flex flex-col gap-6"
          >
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
          </div>
          {streaming ? (
            <div aria-hidden="true">
              <MessageItem message={liveMessage} streaming />
            </div>
          ) : null}
        </div>
      </div>

      {!atBottom ? (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-lg transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowDown className="mr-1 inline size-3" />
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}
