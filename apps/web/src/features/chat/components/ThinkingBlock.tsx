import { useState } from "react";
import { Brain, ChevronRight, Loader2 } from "lucide-react";

interface Props {
  reasoning: string;
  /** True while the model is still thinking (before the answer starts). */
  thinking?: boolean;
  /** Milliseconds spent thinking, when known. */
  durationMs?: number | null;
}

function thoughtLabel(thinking: boolean, durationMs?: number | null): string {
  if (thinking) return "Thinking";
  if (durationMs != null) {
    const seconds = Math.max(1, Math.round(durationMs / 1000));
    return `Thought for ${seconds}s`;
  }
  return "Thought process";
}

/**
 * Claude-style collapsible extended-thinking block. Open and shimmering while
 * the model thinks, then collapsed to a "Thought for Xs" row once the answer
 * starts. The reasoning text is persisted so it survives reloads.
 */
export function ThinkingBlock({ reasoning, thinking, durationMs }: Props) {
  const active = Boolean(thinking);
  // `null` = follow the stream (open while thinking, collapsed once done);
  // a boolean is an explicit user toggle that we keep across state changes.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? active;

  const label = thoughtLabel(active, durationMs);

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {active ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <Brain className="size-3.5 shrink-0" />
        )}
        <span className={active ? "animate-pulse" : undefined}>{label}</span>
      </button>
      {open ? (
        <div className="max-h-72 overflow-y-auto border-t border-border/60 px-3 py-2">
          <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground/90">
            {reasoning}
          </p>
        </div>
      ) : null}
    </div>
  );
}
