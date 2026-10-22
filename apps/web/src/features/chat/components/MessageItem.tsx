import { lazy, Suspense, useState } from "react";
import { Check, Copy, Pencil, RefreshCw } from "lucide-react";

import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThinkingBlock } from "@/features/chat/components/ThinkingBlock";
import type { Message } from "@numbat/api";

// Keep react-markdown + highlight.js out of the initial bundle.
const MarkdownMessage = lazy(
  () => import("@/features/chat/components/MarkdownMessage"),
);

interface Props {
  message: Message;
  streaming?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  onEdit?: (content: string) => void;
}

function usageSummary(message: Message): string | null {
  const parts: string[] = [];
  if (message.ttftMs != null)
    parts.push(`TTFT ${Math.round(message.ttftMs)} ms`);

  const completion = message.completionTokens ?? null;
  if (
    completion != null &&
    message.totalMs != null &&
    message.ttftMs != null &&
    message.totalMs > message.ttftMs
  ) {
    const tps = completion / ((message.totalMs - message.ttftMs) / 1000);
    if (Number.isFinite(tps) && tps > 0) parts.push(`TPS ${tps.toFixed(1)}`);
  }

  if (
    message.promptTokens != null ||
    message.completionTokens != null ||
    message.reasoningTokens != null
  ) {
    const inOut = `in ${message.promptTokens ?? "—"} · out ${message.completionTokens ?? "—"}`;
    parts.push(
      message.reasoningTokens != null
        ? `${inOut} (reasoning ${message.reasoningTokens})`
        : inOut,
    );
  } else if (completion != null) {
    parts.push(`${completion} tok`);
  }

  return parts.length ? parts.join(" · ") : null;
}

export function MessageItem({
  message,
  streaming,
  canRegenerate,
  onRegenerate,
  onEdit,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  if (message.role === "user") {
    if (editing) {
      return (
        <div className="flex flex-col items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            autoFocus
            className="max-w-[85%]"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft(message.content);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!draft.trim()}
              onClick={() => {
                setEditing(false);
                onEdit?.(draft.trim());
              }}
            >
              Send
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="group flex flex-col items-end gap-1">
        <div className="max-w-[85%] text-right text-[15px] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
        {onEdit ? (
          <button
            type="button"
            onClick={() => {
              setDraft(message.content);
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
          >
            <Pencil className="size-3" />
            Edit
          </button>
        ) : null}
      </div>
    );
  }

  async function copy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const metrics = usageSummary(message);
  // While the answer is still empty the model is (still) thinking.
  const thinking =
    Boolean(streaming) && !message.content && Boolean(message.reasoning);
  // Waiting for the very first token (neither thinking nor answer yet).
  const waiting = Boolean(streaming) && !message.content && !message.reasoning;

  return (
    <div className="flex gap-3">
      <BrandMark
        className={waiting ? "mark-waiting mt-0.5 size-5" : "mt-0.5 size-5"}
      />
      <div className="min-w-0 flex-1">
        {message.reasoning ? (
          <ThinkingBlock
            reasoning={message.reasoning}
            thinking={thinking}
            durationMs={message.reasoningMs}
          />
        ) : null}
        {!message.content ? (
          <div className="text-[15px] leading-[1.7] whitespace-pre-wrap text-muted-foreground">
            {message.stopped ? "(stopped)" : "…"}
          </div>
        ) : streaming ? (
          <div className="text-[15px] leading-[1.7] whitespace-pre-wrap">
            {message.content}
            <span className="caret" />
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="text-[15px] leading-[1.7] whitespace-pre-wrap">
                {message.content}
              </div>
            }
          >
            <MarkdownMessage content={message.content} />
          </Suspense>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {message.model ? (
            <span>
              {message.provider ? `${message.provider} · ` : ""}
              {message.model}
            </span>
          ) : null}
          {message.stopped ? <span>stopped</span> : null}
          {metrics ? <span>{metrics}</span> : null}
          {message.content ? (
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              {copied ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
          {canRegenerate && onRegenerate ? (
            <button
              type="button"
              onClick={onRegenerate}
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              <RefreshCw className="size-3" />
              Regenerate
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
