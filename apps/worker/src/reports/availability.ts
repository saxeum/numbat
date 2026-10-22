/**
 * Availability recency window (KAN-51).
 *
 * A model is "available" to a user when their most recent probe succeeded
 * within `AVAILABILITY_TTL_DAYS` (default 7). Shared by `GET /api/models` and
 * the gateway so the picker and routing agree on the same set.
 */

export const DEFAULT_AVAILABILITY_TTL_DAYS = 7;

/** ISO cutoff: only probes at/after this are considered fresh. */
export function availabilitySince(env: Env, now: number = Date.now()): string {
  const parsed = Number.parseInt(env.AVAILABILITY_TTL_DAYS ?? "", 10);
  const days =
    Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_AVAILABILITY_TTL_DAYS;
  return new Date(now - days * 86_400_000).toISOString();
}

/** Whether a successful probe at `lastOkAt` is still inside the window. */
export function isFresh(lastOkAt: string | null, sinceIso: string): boolean {
  return lastOkAt !== null && lastOkAt >= sinceIso;
}
