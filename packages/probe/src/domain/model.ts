export type ModelKind =
  | "chat"
  | "embedding"
  | "text-to-speech"
  | "image"
  | "video"
  | "music"
  | "transcription"
  | "audio"
  | "computer-use"
  | "deep-research"
  | "robotics"
  | "agent"
  | "other";

export interface ModelCapabilities {
  /** Eligible for a chat probe. */
  chat: boolean;
  streaming?: boolean;
  tools?: boolean;
  vision?: boolean;
  /** The provider advertises this as a reasoning model. */
  reasoningDeclared?: boolean;
}

export interface ModelInfo {
  id: string;
  displayName?: string;
  kind: ModelKind;
  capabilities: ModelCapabilities;
  raw?: unknown;
}

/** Ordered rules: first match wins; anything unmatched is a chat model. */
export type ClassifyRule = readonly [ModelKind, RegExp];

export function classifyByRules(
  haystack: string,
  rules?: readonly ClassifyRule[],
): ModelKind {
  for (const [kind, pattern] of rules ?? []) {
    if (pattern.test(haystack)) return kind;
  }
  return "chat";
}
