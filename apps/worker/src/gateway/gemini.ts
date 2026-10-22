// Translation between the OpenAI chat shape and Google Gemini's
// generateContent. Ported from the byokfree spike (src/translate.ts).
//
// Only the text path is translated (system + user/assistant turns). Images,
// tools and other multimodal parts are not forwarded — enough for POC chat.

import {
  newCompletionId,
  nowSeconds,
  type ChatCompletion,
  type ChatCompletionChunk,
  type ChatCompletionRequest,
  type ChatMessage,
  type Usage,
} from "./openai";

type Json = Record<string, unknown>;

function textOf(message: ChatMessage): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .join("");
  }
  return "";
}

export function toGeminiRequest(body: ChatCompletionRequest): Json {
  const system = body.messages
    .filter((m) => m.role === "system" || m.role === "developer")
    .map(textOf)
    .filter(Boolean)
    .join("\n\n");

  const contents = body.messages
    .filter((m) => m.role !== "system" && m.role !== "developer")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: textOf(m) }],
    }));

  const generationConfig: Json = {};
  if (typeof body.temperature === "number") {
    generationConfig.temperature = body.temperature;
  }
  if (typeof body.top_p === "number") generationConfig.topP = body.top_p;
  const maxTokens = body.max_tokens ?? body.max_completion_tokens;
  if (typeof maxTokens === "number")
    generationConfig.maxOutputTokens = maxTokens;

  const out: Json = { contents };
  if (system) out.systemInstruction = { parts: [{ text: system }] };
  if (Object.keys(generationConfig).length) {
    out.generationConfig = generationConfig;
  }
  return out;
}

export function mapGeminiFinish(reason: unknown): string | null {
  switch (reason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
      return "content_filter";
    default:
      return typeof reason === "string" && reason ? reason.toLowerCase() : null;
  }
}

interface GeminiPart extends Json {
  text?: string;
  /** Gemini marks extended-thinking parts with `thought: true`. */
  thought?: boolean;
}

function geminiParts(candidate: unknown): GeminiPart[] {
  const content = (candidate as Json | undefined)?.content as Json | undefined;
  const parts = content?.parts as Json[] | undefined;
  return Array.isArray(parts) ? (parts as GeminiPart[]) : [];
}

/** Visible answer text: candidate parts not marked as thinking. */
function geminiText(candidate: unknown): string {
  return geminiParts(candidate)
    .filter((p) => p.thought !== true)
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("");
}

/** Extended-thinking text: candidate parts marked `thought: true`. */
function geminiThought(candidate: unknown): string {
  return geminiParts(candidate)
    .filter((p) => p.thought === true)
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("");
}

interface UsageWithReasoning extends Usage {
  completion_tokens_details?: { reasoning_tokens: number };
}

function geminiUsage(
  usageMeta: Json | undefined,
): UsageWithReasoning | undefined {
  if (!usageMeta) return undefined;
  const usage: UsageWithReasoning = {
    prompt_tokens: Number(usageMeta.promptTokenCount ?? 0),
    completion_tokens: Number(usageMeta.candidatesTokenCount ?? 0),
    total_tokens: Number(usageMeta.totalTokenCount ?? 0),
  };
  const reasoning = Number(usageMeta.thoughtsTokenCount ?? 0);
  if (Number.isFinite(reasoning) && reasoning > 0) {
    usage.completion_tokens_details = { reasoning_tokens: reasoning };
  }
  return usage;
}

export function fromGeminiResponse(json: Json, model: string): ChatCompletion {
  const candidates = (json.candidates as Json[] | undefined) ?? [];
  const first = candidates[0];
  const usage = geminiUsage(json.usageMetadata as Json | undefined);
  const answer = geminiText(first);
  const thought = geminiThought(first);

  return {
    id: newCompletionId(),
    object: "chat.completion",
    created: nowSeconds(),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: answer,
          ...(thought ? { reasoning_content: thought } : {}),
        },
        finish_reason: mapGeminiFinish(first?.finishReason),
      },
    ],
    ...(usage ? { usage } : {}),
  };
}

function chunk(
  id: string,
  created: number,
  model: string,
  delta: { content?: string; reasoning_content?: string },
  finishReason: string | null,
): ChatCompletionChunk {
  const hasDelta = Boolean(delta.content || delta.reasoning_content);
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: hasDelta ? delta : {},
        finish_reason: finishReason,
      },
    ],
  };
}

/** A trailing chunk that carries only `usage` (empty choices). */
function usageChunk(
  id: string,
  created: number,
  model: string,
  usage: UsageWithReasoning,
): ChatCompletionChunk {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [],
    usage,
  };
}

/** Convert Gemini's SSE stream into OpenAI `chat.completion.chunk` frames. */
export function geminiStreamToOpenAI(
  source: ReadableStream<Uint8Array>,
  model: string,
): ReadableStream<Uint8Array> {
  const id = newCompletionId();
  const created = nowSeconds();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = source.getReader();
  let buffer = "";
  let finished = false;
  let usageMeta: Json | undefined;
  let usageEmitted = false;
  const emit = (payload: string) => encoder.encode("data: " + payload + "\n\n");
  const emitUsage = (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    const usage = geminiUsage(usageMeta);
    if (usage && !usageEmitted) {
      usageEmitted = true;
      controller.enqueue(
        emit(JSON.stringify(usageChunk(id, created, model, usage))),
      );
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          if (!finished) {
            controller.enqueue(
              emit(JSON.stringify(chunk(id, created, model, {}, "stop"))),
            );
          }
          emitUsage(controller);
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        let enqueued = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;
          let json: Json;
          try {
            json = JSON.parse(payload) as Json;
          } catch {
            continue;
          }
          if (json.usageMetadata) usageMeta = json.usageMetadata as Json;
          const first = ((json.candidates as Json[] | undefined) ?? [])[0];
          const thought = geminiThought(first);
          if (thought) {
            controller.enqueue(
              emit(
                JSON.stringify(
                  chunk(
                    id,
                    created,
                    model,
                    { reasoning_content: thought },
                    null,
                  ),
                ),
              ),
            );
            enqueued = true;
          }
          const text = geminiText(first);
          if (text) {
            controller.enqueue(
              emit(
                JSON.stringify(
                  chunk(id, created, model, { content: text }, null),
                ),
              ),
            );
            enqueued = true;
          }
          const finish = mapGeminiFinish(first?.finishReason);
          if (finish) {
            finished = true;
            controller.enqueue(
              emit(JSON.stringify(chunk(id, created, model, {}, finish))),
            );
            enqueued = true;
            emitUsage(controller);
          }
        }
        if (enqueued) return;
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}
