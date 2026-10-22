import type { ModelInfo } from "../domain/model";
import type {
  ProbeDraft,
  ProbeOutcome,
  ReportTotals,
  Usage,
} from "../domain/probe";

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Reasoning tokens: explicit field if present, else total − prompt − completion. */
function deriveReasoningTokens(usage: Usage): number | undefined {
  if (typeof usage.reasoningTokens === "number") return usage.reasoningTokens;
  if (
    usage.totalTokens !== undefined &&
    usage.promptTokens !== undefined &&
    usage.completionTokens !== undefined
  ) {
    const delta =
      usage.totalTokens - usage.promptTokens - usage.completionTokens;
    return delta > 0 ? delta : undefined;
  }
  return undefined;
}

export function skippedOutcome(model: ModelInfo): ProbeOutcome {
  return {
    modelId: model.id,
    kind: model.kind,
    attempted: false,
    ok: false,
    usage: {},
    quota: { state: "unknown", limits: [] },
    evidence: { url: "", method: "", requestBody: "" },
  };
}

export function finalizeOutcome(
  model: ModelInfo,
  draft: ProbeDraft,
  startedAt: number,
): ProbeOutcome {
  const durationMs = Date.now() - startedAt;
  const usage: Usage = {
    ...draft.usage,
    reasoningTokens: deriveReasoningTokens(draft.usage),
  };
  const status = draft.evidence.status ?? 0;
  const ok = !draft.error && status >= 200 && status < 300;

  const generationMs =
    draft.ttftMs !== undefined ? durationMs - draft.ttftMs : undefined;
  const tps =
    ok &&
    usage.completionTokens !== undefined &&
    generationMs !== undefined &&
    generationMs > 20
      ? round(usage.completionTokens / (generationMs / 1000))
      : undefined;

  const thinking =
    ok &&
    (draft.sawReasoning ||
      draft.sawThoughtTag ||
      (usage.reasoningTokens ?? 0) > 0 ||
      model.capabilities.reasoningDeclared === true);

  return {
    modelId: model.id,
    resolvedModel: draft.resolvedModel,
    kind: model.kind,
    attempted: true,
    ok,
    status: draft.evidence.status,
    statusText: draft.evidence.statusText,
    durationMs,
    ttftMs: ok ? draft.ttftMs : undefined,
    usage,
    tps,
    thinking,
    content: draft.content || undefined,
    error: draft.error,
    quota: draft.quota,
    evidence: draft.evidence,
  };
}

export function totalsFor(outcomes: ProbeOutcome[]): ReportTotals {
  const attempted = outcomes.filter((outcome) => outcome.attempted);
  const passed = attempted.filter((outcome) => outcome.ok).length;
  const failed = attempted.length - passed;

  return {
    models: outcomes.length,
    chat: attempted.length,
    skipped: outcomes.length - attempted.length,
    passed,
    failed,
    withinQuota: attempted.filter((o) => o.quota.state === "within-quota")
      .length,
    exhausted: attempted.filter((o) => o.quota.state === "exhausted").length,
    unavailable: attempted.filter((o) => o.quota.state === "unavailable")
      .length,
    thinking: attempted.filter((o) => o.ok && o.thinking).length,
  };
}
