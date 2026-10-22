import type { Model, ModelList } from "@numbat/api";
import { Hono } from "hono";

import { createDb, type Database } from "../../db/client";
import { listAvailableModels, listFreeModels } from "../../db/queries/models";
import {
  listAvailability,
  ownerHasAvailability,
} from "../../db/queries/reports";
import { availabilitySince, isFresh } from "../../reports/availability";
import { requireUser } from "../middleware/auth";
import type { AppEnv } from "../types";

export const models = new Hono<AppEnv>();

models.use("*", requireUser);

interface ModelSource {
  provider: string;
  modelId: string;
  context: number | null;
  free: boolean | null;
}

function toModel(
  row: ModelSource,
  availability?: { available: boolean; lastCheckedAt: string },
): Model {
  return {
    id: row.modelId,
    object: "model",
    owned_by: row.provider,
    "x-provider": row.provider as Model["x-provider"],
    "x-context": row.context ?? undefined,
    "x-free": row.free ?? false,
    ...(availability
      ? {
          "x-available": availability.available,
          "x-last-checked": availability.lastCheckedAt,
        }
      : {}),
  };
}

async function availabilityPayload(
  db: Database,
  ownerId: string,
  sinceIso: string,
): Promise<ModelList> {
  const rows = await listAvailableModels(db, ownerId, sinceIso);
  return {
    object: "list",
    data: rows.map((row) =>
      toModel(row, { available: true, lastCheckedAt: row.lastCheckedAt }),
    ),
  };
}

async function catalogPayload(
  db: Database,
  ownerId: string,
  sinceIso: string,
): Promise<ModelList> {
  const [rows, availability] = await Promise.all([
    listFreeModels(db),
    listAvailability(db, ownerId),
  ]);
  const byKey = new Map(
    availability.map((row) => [`${row.provider}:${row.modelId}`, row]),
  );
  return {
    object: "list",
    data: rows.map((row) => {
      const match = byKey.get(`${row.provider}:${row.modelId}`);
      return toModel(
        row,
        match
          ? {
              available: match.available && isFresh(match.lastOkAt, sinceIso),
              lastCheckedAt: match.lastCheckedAt,
            }
          : undefined,
      );
    }),
  };
}

/**
 * `GET /api/models` — the models the caller can actually use.
 *
 * - `scope=availability`: only models their keys have probed successfully
 *   within the recency window.
 * - `scope=catalog`: the global curated catalog, with the caller's availability
 *   merged in as `x-available` / `x-last-checked`.
 * - default: availability once the user has run a report, otherwise the catalog
 *   (so users are not blocked before their first report).
 */
models.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const ownerId = c.get("userId");
  const sinceIso = availabilitySince(c.env);
  const requested = c.req.query("scope");

  if (requested === "availability") {
    return c.json(await availabilityPayload(db, ownerId, sinceIso), 200);
  }
  if (requested === "catalog") {
    return c.json(await catalogPayload(db, ownerId, sinceIso), 200);
  }

  const payload = (await ownerHasAvailability(db, ownerId))
    ? await availabilityPayload(db, ownerId, sinceIso)
    : await catalogPayload(db, ownerId, sinceIso);
  return c.json(payload, 200);
});
