import { asc } from "drizzle-orm";

import type { Database } from "../client";
import { freeModels } from "../schema";

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
