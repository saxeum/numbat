import type { QuotaInfo, QuotaLimit, QuotaNormalizer } from "../domain/probe";
import {
  asRecord,
  errorMessage,
  headerRetryAfter,
  num,
  parseDurationMs,
  safeJson,
  str,
} from "./util";

export interface RateLimitMetric {
  metric: string;
  /** Window label shown in the UI, e.g. "RPM" | "RPD" | "TPM". */
  window: string;
  limit: string;
  remaining: string;
  reset: string;
}

/** OpenAI: requests per minute + tokens per minute. */
export const OPENAI_RATE_LIMIT_METRICS: readonly RateLimitMetric[] = [
  {
    metric: "requests",
    window: "RPM",
    limit: "x-ratelimit-limit-requests",
    remaining: "x-ratelimit-remaining-requests",
    reset: "x-ratelimit-reset-requests",
  },
  {
    metric: "tokens",
    window: "TPM",
    limit: "x-ratelimit-limit-tokens",
    remaining: "x-ratelimit-remaining-tokens",
    reset: "x-ratelimit-reset-tokens",
  },
];

/** Groq documents these as Requests Per Day (RPD) + Tokens Per Minute (TPM). */
export const GROQ_RATE_LIMIT_METRICS: readonly RateLimitMetric[] = [
  {
    metric: "requests",
    window: "RPD",
    limit: "x-ratelimit-limit-requests",
    remaining: "x-ratelimit-remaining-requests",
    reset: "x-ratelimit-reset-requests",
  },
  {
    metric: "tokens",
    window: "TPM",
    limit: "x-ratelimit-limit-tokens",
    remaining: "x-ratelimit-remaining-tokens",
    reset: "x-ratelimit-reset-tokens",
  },
];

export function limitsFromHeaders(
  headers: Record<string, string>,
  metrics: readonly RateLimitMetric[],
): QuotaLimit[] {
  const limits: QuotaLimit[] = [];
  for (const definition of metrics) {
    const limit = Number(headers[definition.limit]);
    const remaining = Number(headers[definition.remaining]);
    const resetAfterMs = parseDurationMs(headers[definition.reset]);
    if (
      Number.isFinite(limit) ||
      Number.isFinite(remaining) ||
      resetAfterMs !== undefined
    ) {
      limits.push({
        metric: definition.metric,
        window: definition.window,
        limit: Number.isFinite(limit) ? limit : undefined,
        remaining: Number.isFinite(remaining) ? remaining : undefined,
        resetAfterMs,
      });
    }
  }
  return limits;
}

function success(limits: QuotaLimit[] = []): QuotaInfo {
  return { state: "within-quota", limits };
}

/**
 * Normalizer for the `x-ratelimit-*` header convention. Headers are present on
 * success too, so remaining quota is captured for within-quota probes.
 */
export function rateLimitQuota(
  metrics: readonly RateLimitMetric[],
): QuotaNormalizer {
  return (status, headers, body) => {
    const limits = limitsFromHeaders(headers, metrics);
    const retryAfterMs = headerRetryAfter(headers);
    if (status >= 200 && status < 300) return success(limits);

    const message = errorMessage(safeJson(body));
    if (status === 429)
      return { state: "exhausted", retryAfterMs, limits, message };
    return { state: "unavailable", limits, message };
  };
}

/**
 * For providers that document fixed limits but send no rate-limit headers
 * (e.g. LLM7.io). The known ceiling is reported on every probe; state comes
 * from the response status.
 */
export function documentedQuota(
  limits: readonly QuotaLimit[],
): QuotaNormalizer {
  const copy = () => limits.map((limit) => ({ ...limit }));
  return (status, headers, body) => {
    const retryAfterMs = headerRetryAfter(headers);
    const message = errorMessage(safeJson(body));
    if (status >= 200 && status < 300)
      return { state: "within-quota", limits: copy() };
    if (status === 429)
      return { state: "exhausted", retryAfterMs, limits: copy(), message };
    return { state: "unavailable", limits: copy(), message };
  };
}

/**
 * LLM7.io free-token limits (https://docs.llm7.io/limits): 1 request/second,
 * 60/minute, 250/hour, and 100,000 tokens per 24 hours. Pro plans are higher
 * (25/1,500/15,000) but the tier is not discoverable from a probe response.
 */
export const LLM7_FREE_LIMITS: readonly QuotaLimit[] = [
  { metric: "requests", window: "per-second", limit: 1 },
  { metric: "requests", window: "per-minute", limit: 60 },
  { metric: "requests", window: "per-hour", limit: 250 },
  { metric: "tokens", window: "per-day", limit: 100_000 },
];

/** Default: success → within-quota, 429 → exhausted (+ Retry-After), else unavailable. */
export const defaultQuota: QuotaNormalizer = (status, headers, body) => {
  if (status >= 200 && status < 300) return success();

  const retryAfterMs = headerRetryAfter(headers);
  const message = errorMessage(safeJson(body));

  if (status === 429)
    return { state: "exhausted", retryAfterMs, limits: [], message };
  return { state: "unavailable", limits: [], message };
};

/** Gemini's OpenAI shim reports quota in a `details[]` array on 429. */
export const geminiQuota: QuotaNormalizer = (status, headers, body) => {
  if (status >= 200 && status < 300) return success();

  const parsed = safeJson(body);
  const candidates = Array.isArray(parsed) ? parsed : [parsed];
  const limits: QuotaLimit[] = [];
  let retryAfterMs = headerRetryAfter(headers);

  for (const candidate of candidates) {
    const details = asRecord(asRecord(candidate).error).details;
    for (const detail of Array.isArray(details) ? details : []) {
      const record = asRecord(detail);
      for (const violation of Array.isArray(record.violations)
        ? record.violations
        : []) {
        const v = asRecord(violation);
        limits.push({
          metric: str(v.quotaMetric),
          scope: str(v.quotaId),
          limit: num(v.quotaValue),
        });
      }
      retryAfterMs = parseDurationMs(record.retryDelay) ?? retryAfterMs;
    }
  }

  const message = errorMessage(parsed);
  if (status === 429)
    return { state: "exhausted", retryAfterMs, limits, message };
  return { state: "unavailable", limits, message };
};
