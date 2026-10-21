// Diff a provider's discovered models against what is already in D1 and turn
// that into the statements the sync writes. Pure — no D1 access — so the
// guardrails are unit-testable.

import type { DiscoveredModel } from "./discover";

export interface CatalogRow {
  provider: string;
  modelId: string;
  label: string;
  context: number | null;
  free: boolean;
  sort: number;
  note: string | null;
}

export interface ReconcilePlan {
  apply: true;
  rows: CatalogRow[];
  added: string[];
  removed: string[];
  kept: string[];
}

export interface ReconcileSkip {
  apply: false;
  reason: "empty-listing" | "implausible-shrink";
}

/** Refuse a run that would drop more than half a provider's catalog. */
export const MIN_KEEP_RATIO = 0.5;

/** D1 allows 100 bound parameters per statement. */
export const MAX_BOUND_PARAMS = 100;

/**
 * Columns written per `free_models` row: provider, model_id, label, context,
 * free, sort, note, last_checked_at, updated_at.
 */
export const FREE_MODEL_COLUMNS = 9;

/** 11 rows per INSERT (99 bound parameters), safely under the cap. */
export const MAX_ROWS_PER_INSERT = Math.floor(
  MAX_BOUND_PARAMS / FREE_MODEL_COLUMNS,
);

/** `catalog_probes` columns: provider, model_id, status, checked_at. */
export const PROBE_COLUMNS = 4;

/** 25 probe-cache rows per INSERT. */
export const MAX_PROBES_PER_INSERT = Math.floor(
  MAX_BOUND_PARAMS / PROBE_COLUMNS,
);

export interface ReconcileInput {
  provider: string;
  /** Model ids currently in `free_models` for this provider. */
  existing: string[];
  /** Models admitted for the catalog (already filtered to `free === true`). */
  models: DiscoveredModel[];
  sortBase: number;
  /** Bypass the shrink guard (`CATALOG_ALLOW_SHRINK=1`). */
  allowShrink?: boolean;
}

export function planReconcile(
  input: ReconcileInput,
): ReconcilePlan | ReconcileSkip {
  const { provider, existing, models, sortBase } = input;

  // A successful listing that parses to nothing means the payload changed
  // shape — do not wipe the provider's rows on it.
  if (models.length === 0) {
    return { apply: false, reason: "empty-listing" };
  }

  if (
    !input.allowShrink &&
    existing.length > 0 &&
    models.length < existing.length * MIN_KEEP_RATIO
  ) {
    return { apply: false, reason: "implausible-shrink" };
  }

  const sorted = [...models].sort((a, b) => a.id.localeCompare(b.id));
  const rows: CatalogRow[] = sorted.map((model, index) => ({
    provider,
    modelId: model.id,
    label: model.label,
    context: model.context ?? null,
    free: true,
    sort: sortBase + index,
    note: model.note ?? null,
  }));

  const existingSet = new Set(existing);
  const discoveredSet = new Set(rows.map((row) => row.modelId));

  return {
    apply: true,
    rows,
    added: rows.map((row) => row.modelId).filter((id) => !existingSet.has(id)),
    removed: existing.filter((id) => !discoveredSet.has(id)),
    kept: existing.filter((id) => discoveredSet.has(id)),
  };
}

/** Splits rows into INSERT-sized chunks that stay under D1's parameter cap. */
export function chunk<T>(items: T[], perStatement: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += perStatement) {
    chunks.push(items.slice(index, index + perStatement));
  }
  return chunks;
}
