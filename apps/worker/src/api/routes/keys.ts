import { CreateApiKeyRequest } from "@numbat/api";
import { Hono } from "hono";

import { createDb } from "../../db/client";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "../../db/queries/api-keys";
import {
  apiKeyDisplayPrefix,
  generateApiKeyToken,
  hashApiKey,
} from "../../gateway/api-keys";
import { requireSession } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { validate } from "../openapi";
import type { AppEnv } from "../types";

// API-key management is session-only (a leaked inference key must not be able
// to create or revoke keys).
export const keys = new Hono<AppEnv>();

keys.use("*", requireSession);

keys.get("/", async (c) => {
  const rows = await listApiKeys(createDb(c.env.DB), c.get("userId"));
  return c.json(rows, 200);
});

keys.post("/", validate("json", CreateApiKeyRequest), async (c) => {
  const { name } = c.req.valid("json");
  const token = generateApiKeyToken();

  const row = await createApiKey(createDb(c.env.DB), {
    id: crypto.randomUUID(),
    ownerId: c.get("userId"),
    name,
    prefix: apiKeyDisplayPrefix(token),
    hash: await hashApiKey(token),
    createdAt: new Date().toISOString(),
  });

  // The plaintext token is returned once and never stored.
  return c.json({ ...row, token }, 201);
});

keys.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const revoked = await revokeApiKey(createDb(c.env.DB), c.get("userId"), id);
  if (!revoked) {
    throw new AppError(404, "API_KEY_NOT_FOUND", `API key ${id} not found`);
  }
  return c.body(null, 204);
});
