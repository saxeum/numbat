// Executes one user probe report: lists models with the caller's decrypted
// credential, probes each, persists results incrementally, then materializes
// per-user availability. Runs in the queue consumer (KAN-46 / KAN-49).

import {
  getAdapter,
  runProbes,
  totalsFor,
  type ProbeOutcome,
} from "@numbat/probe";

import { openSecret } from "../crypto/vault";
import { createDb } from "../db/client";
import { getSealedCredentialById } from "../db/queries/credentials";
import {
  finishProbeRun,
  getProbeRunById,
  markProbeRunRunning,
  recordProbeRunModel,
  setProbeRunProgress,
  upsertAvailability,
  type AvailabilityUpsert,
  type ProbeRunModelRow,
} from "../db/queries/reports";

/** Wall-clock budget per provider request. */
const PROBE_TIMEOUT_MS = 180_000;

function toRunModelRow(
  outcome: ProbeOutcome,
  run: { id: string; ownerId: string; provider: string },
  now: string,
): ProbeRunModelRow {
  const headers = outcome.evidence.headers;
  const limits = outcome.quota.limits;
  return {
    id: crypto.randomUUID(),
    runId: run.id,
    ownerId: run.ownerId,
    provider: run.provider,
    modelId: outcome.modelId,
    resolvedModel: outcome.resolvedModel ?? null,
    kind: outcome.kind,
    attempted: outcome.attempted,
    ok: outcome.ok,
    status: outcome.status ?? null,
    statusText: outcome.statusText ?? null,
    durationMs: outcome.durationMs ?? null,
    ttftMs: outcome.ttftMs ?? null,
    completionTokens: outcome.usage.completionTokens ?? null,
    reasoningTokens: outcome.usage.reasoningTokens ?? null,
    tps: outcome.tps ?? null,
    thinking: outcome.thinking ?? null,
    content: outcome.content ?? null,
    errorName: outcome.error?.name ?? null,
    errorMessage: outcome.error?.message ?? null,
    body: outcome.evidence.body ?? null,
    requestBody: outcome.evidence.requestBody ?? null,
    headersJson: headers ? JSON.stringify(headers) : null,
    quotaState: outcome.quota.state,
    quotaLimitsJson: limits.length > 0 ? JSON.stringify(limits) : null,
    quotaRetryAfterMs: outcome.quota.retryAfterMs ?? null,
    createdAt: now,
  };
}

function toAvailabilityRow(
  outcome: ProbeOutcome,
  run: { id: string; ownerId: string; provider: string },
  now: string,
): AvailabilityUpsert {
  return {
    ownerId: run.ownerId,
    provider: run.provider,
    modelId: outcome.modelId,
    resolvedModel: outcome.resolvedModel ?? null,
    available: outcome.ok,
    lastStatus: outcome.status ?? null,
    lastOkAt: outcome.ok ? now : null,
    lastCheckedAt: now,
    sourceRunId: run.id,
  };
}

export async function executeReport(env: Env, runId: string): Promise<void> {
  const db = createDb(env.DB);
  const startedAt = Date.now();
  const collected: ProbeOutcome[] = [];

  const run = await getProbeRunById(db, runId);
  if (!run) throw new Error(`Report ${runId} not found`);

  try {
    if (!run.credentialId) {
      throw new Error("The credential for this report no longer exists");
    }
    const sealed = await getSealedCredentialById(
      db,
      run.ownerId,
      run.credentialId,
    );
    if (!sealed) {
      throw new Error("The credential for this report no longer exists");
    }

    const apiKey = await openSecret(
      env,
      { ownerId: run.ownerId, provider: run.provider, label: sealed.label },
      sealed,
    );

    const adapter = getAdapter(run.provider);
    const startedIso = new Date().toISOString();

    await runProbes(
      adapter,
      {
        apiKey,
        timeoutMs: PROBE_TIMEOUT_MS,
        fetch: (input, init) => fetch(input, init),
      },
      {
        onStart: (total) => markProbeRunRunning(db, run.id, startedIso, total),
        onResult: async (outcome) => {
          collected.push(outcome);
          const now = new Date().toISOString();
          await recordProbeRunModel(db, toRunModelRow(outcome, run, now));
          await setProbeRunProgress(db, run.id, collected.length);
        },
      },
    );

    const now = new Date().toISOString();
    await upsertAvailability(
      db,
      collected.map((outcome) => toAvailabilityRow(outcome, run, now)),
    );

    await finishProbeRun(db, run.id, {
      status: "succeeded",
      finishedAt: now,
      durationMs: Date.now() - startedAt,
      totalsJson: JSON.stringify(totalsFor(collected)),
      error: null,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        type: "report-failed",
        runId,
        provider: run.provider,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    await finishProbeRun(db, run.id, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      totalsJson: JSON.stringify(totalsFor(collected)),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
