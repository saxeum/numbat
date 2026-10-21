import type { Model, ModelList } from "@numbat/api";
import { Hono } from "hono";

import { createDb } from "../../db/client";
import { listFreeModels } from "../../db/queries/models";
import { requireUser } from "../middleware/auth";
import type { AppEnv } from "../types";

export const models = new Hono<AppEnv>();

models.use("*", requireUser);

models.get("/", async (c) => {
  const rows = await listFreeModels(createDb(c.env.DB));

  const data: Model[] = rows.map((row) => ({
    id: row.modelId,
    object: "model",
    owned_by: row.provider,
    "x-provider": row.provider as Model["x-provider"],
    "x-context": row.context ?? undefined,
    "x-free": row.free,
  }));

  return c.json({ object: "list", data } satisfies ModelList, 200);
});
