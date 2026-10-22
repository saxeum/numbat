import { and, asc, eq, gte } from "drizzle-orm";

import type { Database } from "../client";
import { freeModels, modelAvailability } from "../schema";

export interface FreeModelRow {
  provider: string;
  modelId: string;
  label: string;
  context: number | null;
  free: boolean;
}

/** The static free-tier catalog, ordered for display. */
export function listFreeModels(db: Database): Promise<FreeModelRow[]> {
  return db
    .select({
      provider: freeModels.provider,
      modelId: freeModels.modelId,
      label: freeModels.label,
      context: freeModels.context,
      free: freeModels.free,
    })
    .from(freeModels)
    .orderBy(asc(freeModels.sort), asc(freeModels.modelId));
}

export interface AvailableModelRow {
  provider: string;
  modelId: string;
  context: number | null;
  free: boolean | null;
  lastCheckedAt: string;
}

/**
 * A user's fresh, available models, enriched with catalog context/free flags
 * where the model also appears in the global catalog. Owner-scoped.
 */
export function listAvailableModels(
  db: Database,
  ownerId: string,
  sinceIso: string,
): Promise<AvailableModelRow[]> {
  return db
    .select({
      provider: modelAvailability.provider,
      modelId: modelAvailability.modelId,
      context: freeModels.context,
      free: freeModels.free,
      lastCheckedAt: modelAvailability.lastCheckedAt,
    })
    .from(modelAvailability)
    .leftJoin(
      freeModels,
      and(
        eq(freeModels.provider, modelAvailability.provider),
        eq(freeModels.modelId, modelAvailability.modelId),
      ),
    )
    .where(
      and(
        eq(modelAvailability.ownerId, ownerId),
        eq(modelAvailability.available, true),
        gte(modelAvailability.lastOkAt, sinceIso),
      ),
    )
    .orderBy(asc(modelAvailability.provider), asc(modelAvailability.modelId));
}
