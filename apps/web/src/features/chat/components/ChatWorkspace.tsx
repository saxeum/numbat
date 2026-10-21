import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { Composer } from "@/features/chat/components/Composer";
import { ConversationSidebar } from "@/features/chat/components/ConversationSidebar";
import { EmptyState } from "@/features/chat/components/EmptyState";
import { MessageList } from "@/features/chat/components/MessageList";
import {
  appendMessage,
  createConversation,
  deleteConversation,
  useConversations,
} from "@/features/chat/store";
import { useChatStream } from "@/features/chat/useChatStream";
import type { ChatMessage, ChatRequestMessage } from "@/features/chat/types";

export function ChatWorkspace() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const conversations = useConversations();
  const { streaming, liveText, liveMetrics, send, cancel } = useChatStream();

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeConversation =
    conversations.find((c) => c.id === conversationId) ?? null;
  const messages = activeConversation?.messages ?? [];
  const isEmpty = messages.length === 0;

  function onNew() {
    setError(null);
    setInput("");
    navigate("/gateway/chat");
  }

  function onDelete(id: string) {
    deleteConversation(id);
    if (id === conversationId) navigate("/gateway/chat");
  }

  async function onSend({ model, stream }: { model: string; stream: boolean }) {
    const text = input.trim();
    if (!text || streaming) return;
    setError(null);

    let conversation = activeConversation;
    if (!conversation) {
      conversation = createConversation(model);
      navigate(`/gateway/chat/${conversation.id}`, { replace: true });
    }

    const history: ChatRequestMessage[] = conversation.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    appendMessage(conversation.id, userMessage);
    setInput("");

    try {
      const result = await send({
        model,
        messages: [...history, { role: "user", content: text }],
        stream,
      });
      appendMessage(conversation.id, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.content,
        createdAt: Date.now(),
        provider: result.provider,
        model: result.model,
        ttftMs: result.ttftMs,
        totalMs: result.totalMs,
        tokens: result.tokens,
        tps: result.tps,
        usage: result.usage,
        stopped: result.stopped,
      });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Chat failed");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
      <ConversationSidebar
        conversations={conversations}
        activeId={conversationId}
        onNew={onNew}
        onDelete={onDelete}
      />

      <div className="flex h-[72svh] min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:h-[calc(100svh-16rem)]">
        {isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto p-6">
            <EmptyState onPick={setInput} />
            <div className="w-full max-w-2xl">
              <Composer
                value={input}
                onChange={setInput}
                onSubmit={onSend}
                streaming={streaming}
                onStop={cancel}
                autoFocus
              />
            </div>
          </div>
        ) : (
          <>
            <MessageList
              messages={messages}
              streaming={streaming}
              liveText={liveText}
              liveMetrics={liveMetrics}
            />
            <div className="border-t border-border p-3 sm:p-4">
              <div className="mx-auto max-w-3xl">
                {error ? (
                  <p className="mb-2 text-sm text-destructive">{error}</p>
                ) : null}
                <Composer
                  value={input}
                  onChange={setInput}
                  onSubmit={onSend}
                  streaming={streaming}
                  onStop={cancel}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
