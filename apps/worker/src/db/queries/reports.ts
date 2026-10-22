import { and, asc, desc, eq, gte, sql } from "drizzle-orm";

import type { Database } from "../client";
import { modelAvailability, probeRunModels, probeRuns } from "../schema";

export type ProbeRunStatus = "queued" | "running" | "succeeded" | "failed";

export interface ProbeRunRow {
  id: string;
  ownerId: string;
  credentialId: string | null;
  provider: string;
  label: string | null;
  status: string;
  trigger: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  progressDone: number;
  progressTotal: number;
  totalsJson: string;
  error: string | null;
}

export interface ProbeRunModelRow {
  id: string;
  runId: string;
  ownerId: string;
  provider: string;
  modelId: string;
  resolvedModel: string | null;
  kind: string;
  attempted: boolean;
  ok: boolean;
  status: number | null;
  statusText: string | null;
  durationMs: number | null;
  ttftMs: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  tps: number | null;
  thinking: boolean | null;
  content: string | null;
  errorName: string | null;
  errorMessage: string | null;
  body: string | null;
  requestBody: string | null;
  headersJson: string | null;
  quotaState: string | null;
  quotaLimitsJson: string | null;
  quotaRetryAfterMs: number | null;
  createdAt: string;
}

export interface AvailabilityRow {
  ownerId: string;
  provider: string;
  modelId: string;
  resolvedModel: string | null;
  available: boolean;
  lastStatus: number | null;
  lastOkAt: string | null;
  lastCheckedAt: string;
  sourceRunId: string | null;
}

export interface CreateProbeRunInput {
  id: string;
  ownerId: string;
  credentialId: string;
  provider: string;
  label: string | null;
  createdAt: string;
}

export async function createProbeRun(
  db: Database,
  input: CreateProbeRunInput,
): Promise<void> {
  await db.insert(probeRuns).values({
    id: input.id,
    ownerId: input.ownerId,
    credentialId: input.credentialId,
    provider: input.provider,
    label: input.label,
    status: "queued",
    trigger: "manual",
    createdAt: input.createdAt,
  });
}

export function getProbeRun(
  db: Database,
  ownerId: string,
  id: string,
): Promise<ProbeRunRow | null> {
  return db
    .select()
    .from(probeRuns)
    .where(and(eq(probeRuns.ownerId, ownerId), eq(probeRuns.id, id)))
    .get()
    .then((row) => row ?? null);
}

export function listProbeRuns(
  db: Database,
  ownerId: string,
  limit: number,
): Promise<ProbeRunRow[]> {
  return db
    .select()
    .from(probeRuns)
    .where(eq(probeRuns.ownerId, ownerId))
    .orderBy(desc(probeRuns.createdAt))
    .limit(limit);
}

/** The single queued/running report for a user, if any (one-active-run guard). */
export function findActiveProbeRun(
  db: Database,
  ownerId: string,
): Promise<ProbeRunRow | null> {
  return db
    .select()
    .from(probeRuns)
    .where(
      and(
        eq(probeRuns.ownerId, ownerId),
        sql`${probeRuns.status} IN ('queued','running')`,
      ),
    )
    .get()
    .then((row) => row ?? null);
}

/** Load by id only (queue consumer already trusts the message). */
export function getProbeRunById(
  db: Database,
  id: string,
): Promise<ProbeRunRow | null> {
  return db
    .select()
    .from(probeRuns)
    .where(eq(probeRuns.id, id))
    .get()
    .then((row) => row ?? null);
}

export async function markProbeRunRunning(
  db: Database,
  id: string,
  startedAt: string,
  progressTotal: number,
): Promise<void> {
  await db
    .update(probeRuns)
    .set({ status: "running", startedAt, progressTotal })
    .where(eq(probeRuns.id, id));
}

export async function setProbeRunProgress(
  db: Database,
  id: string,
  progressDone: number,
): Promise<void> {
  await db.update(probeRuns).set({ progressDone }).where(eq(probeRuns.id, id));
}

export async function finishProbeRun(
  db: Database,
  id: string,
  input: {
    status: Extract<ProbeRunStatus, "succeeded" | "failed">;
    finishedAt: string;
    durationMs: number;
    totalsJson: string;
    error: string | null;
  },
): Promise<void> {
  await db
    .update(probeRuns)
    .set({
      status: input.status,
      finishedAt: input.finishedAt,
      durationMs: input.durationMs,
      totalsJson: input.totalsJson,
      error: input.error,
    })
    .where(eq(probeRuns.id, id));
}

export async function updateProbeRunLabel(
  db: Database,
  ownerId: string,
  id: string,
  label: string | null,
): Promise<boolean> {
  const result = await db
    .update(probeRuns)
    .set({ label })
    .where(and(eq(probeRuns.ownerId, ownerId), eq(probeRuns.id, id)))
    .returning({ id: probeRuns.id });
  return result.length > 0;
}

export async function deleteProbeRun(
  db: Database,
  ownerId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .delete(probeRuns)
    .where(and(eq(probeRuns.ownerId, ownerId), eq(probeRuns.id, id)))
    .returning({ id: probeRuns.id });
  return result.length > 0;
}

export function listProbeRunModels(
  db: Database,
  runId: string,
): Promise<ProbeRunModelRow[]> {
  return db
    .select()
    .from(probeRunModels)
    .where(eq(probeRunModels.runId, runId))
    .orderBy(asc(probeRunModels.modelId));
}

/** Incremental persistence: one statement per probed model. */
export async function recordProbeRunModel(
  db: Database,
  row: ProbeRunModelRow,
): Promise<void> {
  await db.insert(probeRunModels).values(row);
}

export interface AvailabilityUpsert {
  ownerId: string;
  provider: string;
  modelId: string;
  resolvedModel: string | null;
  available: boolean;
  lastStatus: number | null;
  lastOkAt: string | null;
  lastCheckedAt: string;
  sourceRunId: string;
}

/**
 * Upsert one row per probed model. `probe_run_models` has many columns, so we
 * chunk to stay under D1's 100-bound-parameter limit (9 columns × 11 rows).
 */
export async function upsertAvailability(
  db: Database,
  rows: AvailabilityUpsert[],
): Promise<void> {
  const chunkSize = 11;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await db
      .insert(modelAvailability)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          modelAvailability.ownerId,
          modelAvailability.provider,
          modelAvailability.modelId,
        ],
        set: {
          resolvedModel: sql`excluded.resolved_model`,
          available: sql`excluded.available`,
          lastStatus: sql`excluded.last_status`,
          lastOkAt: sql`excluded.last_ok_at`,
          lastCheckedAt: sql`excluded.last_checked_at`,
          sourceRunId: sql`excluded.source_run_id`,
        },
      });
  }
}

/**
 * Available models for a user, limited to those confirmed since `sinceIso`
 * (the recency window). Ordered for display.
 */
export function listAvailableModels(
  db: Database,
  ownerId: string,
  sinceIso: string,
): Promise<AvailabilityRow[]> {
  return db
    .select()
    .from(modelAvailability)
    .where(
      and(
        eq(modelAvailability.ownerId, ownerId),
        eq(modelAvailability.available, true),
        gte(modelAvailability.lastOkAt, sinceIso),
      ),
    )
    .orderBy(asc(modelAvailability.provider), asc(modelAvailability.modelId));
}

/** Whether the user has ever produced availability rows (i.e. run a report). */
export async function ownerHasAvailability(
  db: Database,
  ownerId: string,
): Promise<boolean> {
  const rows = await db
    .select({ ownerId: modelAvailability.ownerId })
    .from(modelAvailability)
    .where(eq(modelAvailability.ownerId, ownerId))
    .limit(1);
  return rows.length > 0;
}

/** A single fresh, available model for a user (most recent probe first). */
export function getAvailableModel(
  db: Database,
  ownerId: string,
  modelId: string,
  sinceIso: string,
): Promise<AvailabilityRow | null> {
  return db
    .select()
    .from(modelAvailability)
    .where(
      and(
        eq(modelAvailability.ownerId, ownerId),
        eq(modelAvailability.modelId, modelId),
        eq(modelAvailability.available, true),
        gte(modelAvailability.lastOkAt, sinceIso),
      ),
    )
    .orderBy(desc(modelAvailability.lastOkAt))
    .get()
    .then((row) => row ?? null);
}

/** Every availability row for a user (available or not) — for the picker UI. */
export function listAvailability(
  db: Database,
  ownerId: string,
): Promise<AvailabilityRow[]> {
  return db
    .select()
    .from(modelAvailability)
    .where(eq(modelAvailability.ownerId, ownerId))
    .orderBy(asc(modelAvailability.provider), asc(modelAvailability.modelId));
}
