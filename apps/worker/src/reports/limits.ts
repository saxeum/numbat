/**
 * Report tuning knobs (KAN-53). Every value is optional; the defaults keep the
 * app sensible in local dev, preview and tests where nothing is configured.
 */

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Max models probed in a single report. */
export function reportProbeLimit(env: Env): number {
  return positiveInt(env.REPORT_PROBE_LIMIT, 200);
}

/** Max reports a single user may start per rolling hour. */
export function reportRateLimitPerHour(env: Env): number {
  return positiveInt(env.REPORT_RATE_LIMIT_PER_HOUR, 10);
}

/** How long to keep completed report rows (and their per-model results). */
export function reportRetentionDays(env: Env): number {
  return positiveInt(env.REPORT_RETENTION_DAYS, 30);
}
