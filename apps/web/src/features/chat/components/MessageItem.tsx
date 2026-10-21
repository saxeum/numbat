import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { BrandMark } from "@/components/brand";
import type { Message } from "@numbat/api";

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

export function MessageItem({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl border border-border bg-secondary px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  async function copy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const metrics = usageSummary(message);

  return (
    <div className="flex gap-3">
      <BrandMark className="mt-0.5 size-6 rounded-md text-xs" />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] leading-relaxed whitespace-pre-wrap">
          {message.content || (message.stopped ? "(stopped)" : "…")}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {message.model ? (
            <span>
              {message.provider ? `${message.provider} · ` : ""}
              {message.model}
            </span>
          ) : null}
          {message.stopped ? <span>stopped</span> : null}
          {metrics ? <span className="font-mono">{metrics}</span> : null}
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
        </div>
      </div>
    </div>
  );
}
