// List a provider's models and classify which are free on the caller's key.
//
// Ported from byokfree `src/free-models.ts` (fromOpenAI/fromGemini/
// classifyPricing/isGroqChatModel), including the OpenRouter text-output filter.

import { authHeaders, type DiscoverySpec } from "./providers";

export interface DiscoveredModel {
  id: string;
  label: string;
  context?: number;
  /** `null` = unknown until probed (probe-strategy providers). */
  free: boolean | null;
  note?: string;
}

/** Groq's `/models` also lists audio and guard models; those are not chat. */
const GROQ_NON_CHAT = ["whisper", "orpheus", "prompt-guard", "tts"];

/**
 * Gemini advertises image, music, speech, embedding and agent models through
 * the same `generateContent` method as chat models, so method support alone is
 * not enough. These families cannot serve a text chat completion (they return
 * 400, or 429 on the free tier) and must never enter the chat catalog.
 */
const GEMINI_NON_CHAT = [
  "image",
  "imagen",
  "tts",
  "audio",
  "lyria",
  "nano-banana",
  "deep-research",
  "computer-use",
  "embedding",
  "aqa",
  "veo",
  "transcribe",
  // Agent/IDE models exposed through the Interactions API only; they reject
  // `generateContent` with 400. See "antigravity-preview-*" in Gemini /models.
  "antigravity",
];

/** NVIDIA NIM lists safety, translation and retrieval models beside LLMs. */
const NVIDIA_NON_CHAT = [
  "safety",
  "guard",
  "translate",
  "riva",
  "calibration",
  "embed",
  "rerank",
  "ocr",
  "tts",
  "asr",
];

function isGroqChatModel(id: string): boolean {
  return !GROQ_NON_CHAT.some((token) => id.includes(token));
}

function isGeminiChatModel(id: string): boolean {
  const value = id.toLowerCase();
  return !GEMINI_NON_CHAT.some((token) => value.includes(token));
}

function isNvidiaChatModel(id: string): boolean {
  const value = id.toLowerCase();
  return !NVIDIA_NON_CHAT.some((token) => value.includes(token));
}

/** OpenRouter prices are strings; free iff prompt and completion are both "0". */
function classifyPricing(pricing: unknown): boolean {
  if (!pricing || typeof pricing !== "object") return false;
  const value = pricing as Record<string, unknown>;
  return (
    String(value.prompt ?? "") === "0" && String(value.completion ?? "") === "0"
  );
}

/**
 * OpenRouter reports output modality as e.g. `text->text` / `text+image->text`;
 * music models end in `->text+audio`. Missing metadata falls through.
 */
function isTextOutput(model: Record<string, unknown>): boolean {
  const modality = (model.architecture as Record<string, unknown> | undefined)
    ?.modality;
  return typeof modality !== "string" || modality.endsWith("->text");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function fromOpenAI(spec: DiscoverySpec, json: unknown): DiscoveredModel[] {
  const rows = asArray(asRecord(json).data);
  const out: DiscoveredModel[] = [];

  for (const raw of rows) {
    const row = asRecord(raw);
    const id = typeof row.id === "string" ? row.id : undefined;
    if (!id) continue;
    if (spec.id === "groq" && !isGroqChatModel(id)) continue;
    if (spec.id === "nvidia" && !isNvidiaChatModel(id)) continue;

    let free: boolean | null = null;
    let note: string | undefined;
    if (spec.free === "pricing") {
      if (!classifyPricing(row.pricing) || !isTextOutput(row)) continue;
      free = true;
      note = "zero-priced";
    } else if (spec.free === "free-tier") {
      free = true;
      note = "free tier (rate-limited)";
    }

    out.push({
      id,
      label: typeof row.name === "string" ? row.name : id,
      context:
        numberOrUndefined(row.context_length) ??
        numberOrUndefined(row.context_window),
      free,
      note,
    });
  }

  return out;
}

function fromGemini(spec: DiscoverySpec, json: unknown): DiscoveredModel[] {
  const rows = asArray(asRecord(json).models);
  const out: DiscoveredModel[] = [];

  for (const raw of rows) {
    const row = asRecord(raw);
    const name = typeof row.name === "string" ? row.name : undefined;
    if (!name) continue;

    const methods = asArray(row.supportedGenerationMethods);
    if (!methods.includes("generateContent")) continue;

    const id = name.replace(/^models\//, "");
    if (!id || !isGeminiChatModel(id)) continue;

    out.push({
      id,
      label: typeof row.displayName === "string" ? row.displayName : id,
      context: numberOrUndefined(row.inputTokenLimit),
      free: spec.free === "free-tier" ? true : null,
      note: spec.free === "free-tier" ? "free tier (rate-limited)" : undefined,
    });
  }

  return out;
}

/** Parses a provider `/models` payload into a sorted candidate list. */
export function parseModels(
  spec: DiscoverySpec,
  json: unknown,
): DiscoveredModel[] {
  const models =
    spec.dialect === "gemini" ? fromGemini(spec, json) : fromOpenAI(spec, json);
  return models.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Fetches and parses a provider's model list. Throws on a non-2xx response or a
 * network failure so the caller can keep the provider's existing catalog rows.
 */
export async function discoverModels(
  spec: DiscoverySpec,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 12_000,
): Promise<DiscoveredModel[]> {
  const response = await fetchImpl(spec.modelsUrl, {
    headers: authHeaders(spec, apiKey),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${spec.id} /models returned ${response.status}`);
  }
  return parseModels(spec, await response.json());
}
