// Confirm a model is usable on the provider's free tier by sending one tiny
// real chat completion. Ported from byokfree `src/free-models.ts`
// (probeModel/classifyProbe/applyProbe), plus the relaxed-payload retry that
// recovers reasoning models.

import { authHeaders, type DiscoverySpec } from "./providers";

export type ProbeStatus =
  | "usable"
  | "rate_limited"
  | "billing_required"
  | "unauthorized"
  | "not_available"
  | "bad_request"
  | "empty"
  | "error";

export interface ProbeOutcome {
  status: ProbeStatus;
  /** 0 when the request never reached the provider. */
  httpStatus: number;
  detail?: string;
}

export interface ProbeOptions {
  maxTokens?: number;
  omitTemperature?: boolean;
  completionParam?: "max_tokens" | "max_completion_tokens";
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const PROBE_PROMPT = "Reply with exactly one word: pong";
const DEFAULT_TIMEOUT_MS = 12_000;
/** Transient failures worth retrying before excluding a model. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export function classifyProbe(
  httpStatus: number,
  ok: boolean,
  empty = false,
): ProbeStatus {
  if (ok) return empty ? "empty" : "usable";
  switch (httpStatus) {
    case 429:
      return "rate_limited";
    case 402:
    case 403:
      return "billing_required";
    case 401:
      return "unauthorized";
    case 404:
    case 410:
      return "not_available";
    case 400:
      return "bad_request";
    default:
      return "error";
  }
}

/**
 * What a probe tells us about `free`: `true`/`false` to decide, or `null` to
 * leave the model's declared classification unchanged (the probe was
 * inconclusive — a bad payload or a transient error).
 */
export function probeFreeVerdict(status: ProbeStatus): boolean | null {
  switch (status) {
    case "usable":
    case "rate_limited":
      return true;
    case "billing_required":
    case "unauthorized":
    case "not_available":
      return false;
    default:
      return null;
  }
}

/**
 * Whether a rejection is definitive enough to remember. Transient failures
 * (`error`) are deliberately not cached, so they are retried on the next run.
 */
export function isCacheableRejection(status: ProbeStatus): boolean {
  return (
    status === "billing_required" ||
    status === "unauthorized" ||
    status === "not_available" ||
    status === "bad_request" ||
    status === "empty"
  );
}

function short(text: string, max = 160): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function buildRequest(
  spec: DiscoverySpec,
  modelId: string,
  options: ProbeOptions,
): { url: string; body: string } {
  const maxTokens = options.maxTokens ?? 128;
  const completionParam = options.completionParam ?? "max_tokens";

  if (spec.dialect === "gemini") {
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: maxTokens,
    };
    if (!options.omitTemperature) generationConfig.temperature = 0;
    return {
      url: `${spec.chatUrl}/models/${modelId}:generateContent`,
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROBE_PROMPT }] }],
        generationConfig,
      }),
    };
  }

  const payload: Record<string, unknown> = {
    model: modelId,
    messages: [{ role: "user", content: PROBE_PROMPT }],
    [completionParam]: maxTokens,
    stream: false,
  };
  if (!options.omitTemperature) payload.temperature = 0;
  return { url: spec.chatUrl, body: JSON.stringify(payload) };
}

function extractContent(spec: DiscoverySpec, body: unknown): string {
  const record = (body ?? {}) as Record<string, unknown>;
  if (spec.dialect === "gemini") {
    const candidates = Array.isArray(record.candidates)
      ? (record.candidates as Record<string, unknown>[])
      : [];
    const parts = (
      candidates[0]?.content as Record<string, unknown> | undefined
    )?.parts;
    if (!Array.isArray(parts)) return "";
    return parts
      .map((part) => String((part as Record<string, unknown>)?.text ?? ""))
      .join("")
      .trim();
  }
  const choices = Array.isArray(record.choices)
    ? (record.choices as Record<string, unknown>[])
    : [];
  const message = choices[0]?.message as Record<string, unknown> | undefined;
  return String(message?.content ?? "").trim();
}

/** Sends one tiny completion. Never throws; network failures become `error`. */
export async function probeModel(
  spec: DiscoverySpec,
  apiKey: string,
  modelId: string,
  options: ProbeOptions = {},
): Promise<ProbeOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { url, body } = buildRequest(spec, modelId, options);

  let response: Response;
  let text: string;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        ...authHeaders(spec, apiKey),
        "content-type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await response.text();
  } catch (error) {
    const name = error instanceof Error ? error.name : "fetch failed";
    return { status: "error", httpStatus: 0, detail: short(name) };
  }

  if (!response.ok) {
    return {
      status: classifyProbe(response.status, false),
      httpStatus: response.status,
      detail: short(text),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      status: "empty",
      httpStatus: response.status,
      detail: "non-JSON response",
    };
  }

  const content = extractContent(spec, parsed);
  return content
    ? { status: "usable", httpStatus: response.status }
    : { status: "empty", httpStatus: response.status, detail: "empty content" };
}

export interface ProbeRetryOptions extends ProbeOptions {
  /** Extra attempts after the first for transient failures. */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Probes a model, retrying transient failures and — once — a relaxed payload
 * (more output tokens, no temperature) for `empty`/`bad_request`. Reasoning
 * models often need both.
 */
export async function probeWithRetries(
  spec: DiscoverySpec,
  apiKey: string,
  modelId: string,
  options: ProbeRetryOptions = {},
): Promise<ProbeOutcome> {
  const retries = options.retries ?? 1;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let outcome = await probeModel(spec, apiKey, modelId, options);

  for (
    let attempt = 1;
    attempt <= retries &&
    outcome.status !== "usable" &&
    outcome.status !== "empty";
    attempt++
  ) {
    if (!RETRYABLE.has(outcome.httpStatus)) break;
    await sleep(outcome.httpStatus === 429 ? 3_000 * attempt : 1_000 * attempt);
    outcome = await probeModel(spec, apiKey, modelId, options);
  }

  if (outcome.status === "empty" || outcome.status === "bad_request") {
    const relaxed: ProbeOptions =
      spec.dialect === "gemini"
        ? { ...options, maxTokens: 1024, omitTemperature: true }
        : outcome.status === "bad_request"
          ? {
              ...options,
              maxTokens: 512,
              completionParam: "max_completion_tokens",
              omitTemperature: true,
            }
          : { ...options, maxTokens: 1024, omitTemperature: true };
    outcome = await probeModel(spec, apiKey, modelId, relaxed);
  }

  return outcome;
}
