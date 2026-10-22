import { createDb } from "../db/client";
import { pruneProbeRuns } from "../db/queries/reports";
import { reportRetentionDays } from "./limits";

export interface RetentionResult {
  /** ISO cutoff: runs created before this were deleted. */
  before: string;
  deleted: number;
}

/**
 * Daily retention sweep: delete report runs older than the retention window.
 * `probe_run_models` rows cascade; `model_availability` is intentionally kept
 * (its own recency TTL governs whether it is still shown).
 */
export async function pruneOldReports(
  env: Env,
  now: number = Date.now(),
): Promise<RetentionResult> {
  const before = new Date(
    now - reportRetentionDays(env) * 86_400_000,
  ).toISOString();
  const deleted = await pruneProbeRuns(createDb(env.DB), before);
  return { before, deleted };
}
