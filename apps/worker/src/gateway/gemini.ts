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

function geminiText(candidate: unknown): string {
  const content = (candidate as Json | undefined)?.content as Json | undefined;
  const parts = content?.parts as Json[] | undefined;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
}

export function fromGeminiResponse(json: Json, model: string): ChatCompletion {
  const candidates = (json.candidates as Json[] | undefined) ?? [];
  const first = candidates[0];
  const usageMeta = json.usageMetadata as Json | undefined;

  let usage: Usage | undefined;
  if (usageMeta) {
    usage = {
      prompt_tokens: Number(usageMeta.promptTokenCount ?? 0),
      completion_tokens: Number(usageMeta.candidatesTokenCount ?? 0),
      total_tokens: Number(usageMeta.totalTokenCount ?? 0),
    };
  }

  return {
    id: newCompletionId(),
    object: "chat.completion",
    created: nowSeconds(),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: geminiText(first) },
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
  content: string,
  finishReason: string | null,
): ChatCompletionChunk {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: content ? { content } : {},
        finish_reason: finishReason,
      },
    ],
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
  const emit = (payload: string) => encoder.encode("data: " + payload + "\n\n");

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          if (!finished) {
            controller.enqueue(
              emit(JSON.stringify(chunk(id, created, model, "", "stop"))),
            );
          }
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
          const first = ((json.candidates as Json[] | undefined) ?? [])[0];
          const text = geminiText(first);
          if (text) {
            controller.enqueue(
              emit(JSON.stringify(chunk(id, created, model, text, null))),
            );
            enqueued = true;
          }
          const finish = mapGeminiFinish(first?.finishReason);
          if (finish) {
            finished = true;
            controller.enqueue(
              emit(JSON.stringify(chunk(id, created, model, "", finish))),
            );
            enqueued = true;
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
