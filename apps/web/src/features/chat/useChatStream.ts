import { useCallback, useRef, useState } from "react";

import { completeConversation } from "@/features/chat/api";
import type { ChatOutcome } from "@/features/gateway/api";

export interface SendResult extends ChatOutcome {
  content: string;
  stopped: boolean;
}

interface SendInput {
  conversationId: string;
  model: string;
  /** The new user turn. Omit when regenerating. */
  content?: string;
  regenerate?: boolean;
  stream: boolean;
}

export interface LiveMetrics {
  ttftMs: number | null;
  tokens: number;
  /** How long the model thought before the answer started (ms). */
  reasoningMs: number | null;
}

/**
 * Owns the in-flight completion: live streamed text + extended thinking +
 * metrics, plus cancel. The turn is persisted server-side (KAN-42); this hook
 * only renders the stream.
 */
export function useChatStream() {
  const [streaming, setStreaming] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [liveReasoning, setLiveReasoning] = useState("");
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>({
    ttftMs: null,
    tokens: 0,
    reasoningMs: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const textRef = useRef("");
  const reasoningRef = useRef("");
  const reasoningStartedRef = useRef<number | null>(null);
  const metricsRef = useRef<LiveMetrics>({
    ttftMs: null,
    tokens: 0,
    reasoningMs: null,
  });
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    setLiveText(textRef.current);
    setLiveReasoning(reasoningRef.current);
  }, []);

  const send = useCallback(
    async (input: SendInput): Promise<SendResult> => {
      textRef.current = "";
      reasoningRef.current = "";
      reasoningStartedRef.current = null;
      metricsRef.current = { ttftMs: null, tokens: 0, reasoningMs: null };
      setLiveText("");
      setLiveReasoning("");
      setLiveMetrics({ ttftMs: null, tokens: 0, reasoningMs: null });
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const started = performance.now();

      try {
        const outcome = await completeConversation(input.conversationId, {
          model: input.model,
          content: input.content,
          regenerate: input.regenerate,
          stream: input.stream,
          signal: controller.signal,
          onReasoning: input.stream
            ? (delta) => {
                if (reasoningStartedRef.current === null) {
                  reasoningStartedRef.current = performance.now() - started;
                }
                reasoningRef.current += delta;
                if (rafRef.current === null) {
                  rafRef.current = requestAnimationFrame(flush);
                }
              }
            : undefined,
          onToken: input.stream
            ? (delta) => {
                textRef.current += delta;
                const m = metricsRef.current;
                const now = performance.now() - started;
                if (m.ttftMs === null) m.ttftMs = now;
                if (
                  m.reasoningMs === null &&
                  reasoningStartedRef.current !== null
                ) {
                  m.reasoningMs = now - reasoningStartedRef.current;
                }
                m.tokens += 1;
                setLiveMetrics({
                  ttftMs: m.ttftMs,
                  tokens: m.tokens,
                  reasoningMs: m.reasoningMs,
                });
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
            reasoning: reasoningRef.current,
            reasoningMs: m.reasoningMs,
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
        setLiveReasoning(reasoningRef.current);
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [flush],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { streaming, liveText, liveReasoning, liveMetrics, send, cancel };
}
