export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Extract a human-readable message from an error body. Handles the OpenAI /
 * Gemini shape (`{error:{message}}`), the Cloudflare shape
 * (`{errors:[{message}]}`), and RFC 7807 problem+json (`{title, detail}` as
 * used by NVIDIA).
 */
export function errorMessage(body: unknown): string {
  const candidates = Array.isArray(body) ? body : [body];
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    const errorRecord = asRecord(record.error);
    const nested = str(errorRecord.message);
    if (nested) {
      // OpenRouter puts the real reason in error.metadata.raw.
      const rawDetail = str(asRecord(errorRecord.metadata).raw);
      return rawDetail && rawDetail !== nested
        ? `${nested}: ${rawDetail}`
        : nested;
    }
    const errors = record.errors;
    if (Array.isArray(errors)) {
      const first = str(asRecord(errors[0]).message);
      if (first) return first;
    }
    const detail = str(record.detail);
    if (detail) return detail;
    const title = str(record.title);
    if (title) return title;
    const message = str(record.message);
    if (message) return message;
  }
  if (typeof body === "string" && body.trim().length > 0) return body.trim();
  return "unknown error";
}

/**
 * Parse durations into milliseconds. Handles single units and compound values
 * like "31232s", "2m59.56s", "1h2m3s", "250ms", or a bare number (seconds).
 */
export function parseDurationMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.round(value * 1000);
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  // Duration strings are short; cap the input so a malformed provider value
  // cannot drive a long scan.
  if (!text || text.length > 64) return undefined;

  const pattern = /(\d+(?:\.\d+)?)\s*(ms|s|m|h)/gi;
  let matched = false;
  let total = 0;
  for (const match of text.matchAll(pattern)) {
    const amount = Number(match[1]);
    const unit = match[2]?.toLowerCase();
    if (!Number.isFinite(amount) || unit === undefined) continue;
    matched = true;
    total +=
      unit === "ms"
        ? amount
        : unit === "s"
          ? amount * 1000
          : unit === "m"
            ? amount * 60_000
            : amount * 3_600_000;
  }
  if (matched) return Math.round(total);

  const bare = Number(text);
  return Number.isFinite(bare) ? Math.round(bare * 1000) : undefined;
}

/** Retry-After header (seconds or HTTP date) → milliseconds. */
export function headerRetryAfter(
  headers: Record<string, string>,
): number | undefined {
  const value = headers["retry-after"];
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}
