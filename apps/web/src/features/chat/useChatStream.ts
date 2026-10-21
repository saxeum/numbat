import { useCallback, useRef, useState } from "react";

import { chat, type ChatOutcome } from "@/features/gateway/api";
import type { ChatRequestMessage } from "@/features/chat/types";

export interface SendResult extends ChatOutcome {
  content: string;
  stopped: boolean;
}

interface SendInput {
  model: string;
  messages: ChatRequestMessage[];
  stream: boolean;
}

/**
 * Owns the in-flight completion: live streamed text + metrics, plus cancel.
 * Reuses the gateway SSE parser (`features/gateway/api.ts::chat`). Persisting the
 * finished turn is the caller's job (see `ChatWorkspace`).
 */
export function useChatStream() {
  const [streaming, setStreaming] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [liveMetrics, setLiveMetrics] = useState<{
    ttftMs: number | null;
    tokens: number;
  }>({ ttftMs: null, tokens: 0 });

  const abortRef = useRef<AbortController | null>(null);
  const textRef = useRef("");
  const metricsRef = useRef({ ttftMs: null as number | null, tokens: 0 });
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    setLiveText(textRef.current);
  }, []);

  const send = useCallback(
    async (input: SendInput): Promise<SendResult> => {
      textRef.current = "";
      metricsRef.current = { ttftMs: null, tokens: 0 };
      setLiveText("");
      setLiveMetrics({ ttftMs: null, tokens: 0 });
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const started = performance.now();

      try {
        const outcome = await chat({
          model: input.model,
          messages: input.messages,
          stream: input.stream,
          signal: controller.signal,
          onToken: input.stream
            ? (delta) => {
                textRef.current += delta;
                const m = metricsRef.current;
                if (m.ttftMs === null) m.ttftMs = performance.now() - started;
                m.tokens += 1;
                setLiveMetrics({ ttftMs: m.ttftMs, tokens: m.tokens });
                if (rafRef.current === null) {
                  rafRef.current = requestAnimationFrame(flush);
                }
              }
            : undefined,
        });
        return {
          ...outcome,
          content: outcome.content || textRef.current,
          stopped: false,
        };
      } catch (error) {
        if (controller.signal.aborted) {
          const m = metricsRef.current;
          const totalMs = performance.now() - started;
          return {
            content: textRef.current,
            provider: null,
            model: input.model,
            ttftMs: m.ttftMs,
            totalMs,
            tokens: m.tokens || null,
            tps:
              m.tokens > 0 && totalMs > 0 ? m.tokens / (totalMs / 1000) : null,
            usage: null,
            stopped: true,
          };
        }
        throw error;
      } finally {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setLiveText(textRef.current);
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [flush],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { streaming, liveText, liveMetrics, send, cancel };
}
