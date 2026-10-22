export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export interface QuotaLimit {
  metric?: string;
  /** Rate-limit window label, e.g. "RPM" | "RPD" | "TPM". */
  window?: string;
  scope?: string;
  limit?: number;
  remaining?: number;
  resetAfterMs?: number;
}

export interface QuotaInfo {
  state: "within-quota" | "exhausted" | "unavailable" | "unknown";
  retryAfterMs?: number;
  limits: QuotaLimit[];
  message?: string;
}

export type QuotaNormalizer = (
  status: number,
  headers: Record<string, string>,
  body: string,
) => QuotaInfo;

export interface Evidence {
  url: string;
  method: string;
  requestBody: string;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface ProbeError {
  name: string;
  message: string;
  cause?: string;
}

/** Provider-normalized result stored and rendered by the app. */
export interface ProbeOutcome {
  modelId: string;
  resolvedModel?: string;
  kind: string;
  attempted: boolean;
  ok: boolean;
  status?: number;
  statusText?: string;
  durationMs?: number;
  ttftMs?: number;
  usage: Usage;
  tps?: number;
  thinking?: boolean;
  content?: string;
  error?: ProbeError;
  quota: QuotaInfo;
  evidence: Evidence;
}

/** Raw shape a provider-specific translator produces before finalization. */
export interface ProbeDraft {
  content: string;
  resolvedModel?: string;
  usage: Usage;
  sawReasoning: boolean;
  sawThoughtTag: boolean;
  ttftMs?: number;
  quota: QuotaInfo;
  evidence: Evidence;
  error?: ProbeError;
}

export interface ReportTotals {
  models: number;
  chat: number;
  skipped: number;
  passed: number;
  failed: number;
  withinQuota: number;
  exhausted: number;
  unavailable: number;
  thinking: number;
}
