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

function isGroqChatModel(id: string): boolean {
  return !GROQ_NON_CHAT.some((token) => id.includes(token));
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
    if (!id) continue;

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
