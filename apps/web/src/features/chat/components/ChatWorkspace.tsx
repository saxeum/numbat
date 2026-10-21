import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Menu } from "lucide-react";

import type { Message } from "@numbat/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
  useRenameConversation,
  useTruncateFromMessage,
} from "@/features/chat/hooks";
import { deriveTitle, type ChatRequestMessage } from "@/features/chat/types";
import { useChatStream, type SendResult } from "@/features/chat/useChatStream";
import { getHealth } from "@/lib/api";

function assistantInput(result: SendResult) {
  return {
    role: "assistant" as const,
    content: result.content,
    model: result.model,
    provider: result.provider ?? undefined,
    promptTokens: result.usage?.prompt ?? undefined,
    completionTokens: result.usage?.completion ?? result.tokens ?? undefined,
    reasoningTokens: result.usage?.reasoning ?? undefined,
    ttftMs: result.ttftMs != null ? Math.round(result.ttftMs) : undefined,
    totalMs: Math.round(result.totalMs),
    stopped: result.stopped,
  };
}

function ConversationSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="ml-auto h-10 w-1/2 animate-pulse rounded-2xl bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export function ChatWorkspace() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const authed = Boolean(session);

  const conversationsQuery = useConversations(authed);
  const conversationQuery = useConversation(conversationId, authed);
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const createConversation = useCreateConversation();
  const createMessage = useCreateMessage();
  const deleteConversation = useDeleteConversation();
  const renameConversation = useRenameConversation();
  const truncate = useTruncateFromMessage();
  const { streaming, liveText, liveMetrics, send, cancel } = useChatStream();

  const [input, setInput] = useState("");
  const [stream, setStream] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const conversations = conversationsQuery.data ?? [];
  const activeConversation = conversationQuery.data ?? null;
  const messages = activeConversation?.messages ?? [];
  const isEmpty = messages.length === 0;
  const loadingConversation =
    Boolean(conversationId) && conversationQuery.isPending;
  const offline = health.isError;

  function onNew() {
    setError(null);
    setInput("");
    setSidebarOpen(false);
    navigate("/gateway/chat");
  }

  function onDelete(id: string) {
    deleteConversation.mutate(id);
    if (id === conversationId) navigate("/gateway/chat");
  }

  function onRename(id: string, title: string) {
    renameConversation.mutate({ id, title });
  }

  function toHistory(list: Message[]): ChatRequestMessage[] {
    return list
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));
  }

  async function runCompletion(
    id: string,
    history: ChatRequestMessage[],
    model: string,
  ) {
    const result = await send({ model, messages: history, stream });
    await createMessage.mutateAsync({
      conversationId: id,
      input: assistantInput(result),
    });
  }

  async function onSend({ model }: { model: string }) {
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

    const history = toHistory(messages);
    await createMessage.mutateAsync({
      conversationId: id,
      input: { role: "user", content: text },
    });
    setInput("");

    try {
      await runCompletion(
        id,
        [...history, { role: "user", content: text }],
        model,
      );
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Chat failed");
    }
  }

  async function onRegenerate(message: Message) {
    if (!activeConversation || streaming) return;
    const index = activeConversation.messages.findIndex(
      (m) => m.id === message.id,
    );
    if (index < 0) return;
    setError(null);
    const history = toHistory(activeConversation.messages.slice(0, index));
    try {
      await truncate.mutateAsync({
        conversationId: activeConversation.id,
        messageId: message.id,
      });
      await runCompletion(
        activeConversation.id,
        history,
        message.model ?? activeConversation.model,
      );
    } catch (regenerateError) {
      setError(
        regenerateError instanceof Error ? regenerateError.message : "Failed",
      );
    }
  }

  async function onEdit(message: Message, content: string) {
    if (!activeConversation || streaming || !content.trim()) return;
    const index = activeConversation.messages.findIndex(
      (m) => m.id === message.id,
    );
    if (index < 0) return;
    setError(null);
    const history = toHistory(activeConversation.messages.slice(0, index));
    try {
      await truncate.mutateAsync({
        conversationId: activeConversation.id,
        messageId: message.id,
      });
      await createMessage.mutateAsync({
        conversationId: activeConversation.id,
        input: { role: "user", content: content.trim() },
      });
      await runCompletion(
        activeConversation.id,
        [...history, { role: "user", content: content.trim() }],
        message.model ?? activeConversation.model,
      );
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Failed");
    }
  }

  const sidebar = (
    <ConversationSidebar
      conversations={conversations}
      activeId={conversationId}
      onNew={onNew}
      onRename={onRename}
      onDelete={onDelete}
      onNavigate={() => setSidebarOpen(false)}
    />
  );

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[240px_1fr]">
      {/* Mobile toolbar */}
      <div className="flex items-center gap-2 lg:hidden">
        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Open conversations"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {activeConversation?.title || "New chat"}
        </span>
        <Button variant="outline" size="sm" onClick={onNew}>
          New
        </Button>
      </div>

      {/* Desktop rail */}
      <div className="hidden lg:block">{sidebar}</div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent>{sidebar}</SheetContent>
      </Sheet>

      <div className="flex h-[68svh] min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:h-[calc(100svh-16rem)]">
        {offline ? (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            API is offline — messages may fail to send.
          </div>
        ) : null}

        <p className="sr-only" aria-live="polite">
          {streaming ? "Generating response…" : ""}
        </p>

        {conversationQuery.isError ? (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {conversationQuery.error instanceof Error
                  ? conversationQuery.error.message
                  : "Failed to load conversation"}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => conversationQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : loadingConversation ? (
          <ConversationSkeleton />
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
                stream={stream}
                onStreamChange={setStream}
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
              onRegenerate={onRegenerate}
              onEdit={onEdit}
            />
            <div className="border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(1rem+env(safe-area-inset-bottom))]">
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
                  stream={stream}
                  onStreamChange={setStream}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
