// Minimal OpenAI-compatible chat wire types (the subset we proxy/translate).

export type ChatRole = "system" | "developer" | "user" | "assistant" | "tool";

export interface ContentPart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  role: ChatRole;
  content: string | ContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
  /** OpenAI-style extended-thinking text (reasoning models / Gemini thoughts). */
  reasoning_content?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stop?: string | string[];
  /** byokfree extension: force a provider. */
  provider?: string;
  [key: string]: unknown;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string | null;
  }[];
  usage?: Usage;
  [key: string]: unknown;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: Partial<ChatMessage> & {
      content?: string | null;
      reasoning_content?: string;
    };
    finish_reason: string | null;
  }[];
  [key: string]: unknown;
}

export function newCompletionId(): string {
  return `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
