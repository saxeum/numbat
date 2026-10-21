import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { useSession } from "@/features/auth/client";
import { Composer } from "@/features/chat/components/Composer";
import { ConversationSidebar } from "@/features/chat/components/ConversationSidebar";
import { EmptyState } from "@/features/chat/components/EmptyState";
import { MessageList } from "@/features/chat/components/MessageList";
import {
  useConversation,
  useConversations,
  useCreateConversation,
  useCreateMessage,
  useDeleteConversation,
} from "@/features/chat/hooks";
import { deriveTitle, type ChatRequestMessage } from "@/features/chat/types";
import { useChatStream } from "@/features/chat/useChatStream";

export function ChatWorkspace() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const authed = Boolean(session);

  const conversationsQuery = useConversations(authed);
  const conversationQuery = useConversation(conversationId, authed);
  const createConversation = useCreateConversation();
  const createMessage = useCreateMessage();
  const deleteConversation = useDeleteConversation();
  const { streaming, liveText, liveMetrics, send, cancel } = useChatStream();

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const conversations = conversationsQuery.data ?? [];
  const activeConversation = conversationQuery.data ?? null;
  const messages = activeConversation?.messages ?? [];
  const isEmpty = messages.length === 0;
  const loadingConversation =
    Boolean(conversationId) && conversationQuery.isPending;

  function onNew() {
    setError(null);
    setInput("");
    navigate("/gateway/chat");
  }

  function onDelete(id: string) {
    deleteConversation.mutate(id);
    if (id === conversationId) navigate("/gateway/chat");
  }

  async function onSend({ model, stream }: { model: string; stream: boolean }) {
    const text = input.trim();
    if (!text || streaming) return;
    setError(null);

    let id = conversationId;
    if (!id) {
      const created = await createConversation.mutateAsync({
        title: deriveTitle(text),
        model,
      });
      id = created.id;
      navigate(`/gateway/chat/${id}`, { replace: true });
    }

    const history: ChatRequestMessage[] = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));

    await createMessage.mutateAsync({
      conversationId: id,
      input: { role: "user", content: text },
    });
    setInput("");

    try {
      const result = await send({
        model,
        messages: [...history, { role: "user", content: text }],
        stream,
      });
      await createMessage.mutateAsync({
        conversationId: id,
        input: {
          role: "assistant",
          content: result.content,
          model: result.model,
          provider: result.provider ?? undefined,
          promptTokens: result.usage?.prompt ?? undefined,
          completionTokens:
            result.usage?.completion ?? result.tokens ?? undefined,
          reasoningTokens: result.usage?.reasoning ?? undefined,
          ttftMs: result.ttftMs != null ? Math.round(result.ttftMs) : undefined,
          totalMs: Math.round(result.totalMs),
          stopped: result.stopped,
        },
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
        {loadingConversation ? (
          <div className="grid flex-1 place-items-center">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        ) : isEmpty ? (
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
