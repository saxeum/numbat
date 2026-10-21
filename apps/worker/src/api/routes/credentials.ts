import { CreateCredentialRequest } from "@numbat/api";
import { Hono } from "hono";

import { sealSecret } from "../../crypto/vault";
import { createDb } from "../../db/client";
import {
  deleteCredential,
  listCredentials,
  upsertCredential,
} from "../../db/queries/credentials";
import { verifyProviderKey } from "../../gateway/providers";
import { requireSession } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { validate } from "../openapi";
import type { AppEnv } from "../types";

/** Tolerate common paste mistakes: a whole `.env` line, quotes, whitespace. */
function normalizeApiKey(raw: string): string {
  let value = raw.trim();
  const equals = value.indexOf("=");
  if (equals > 0 && /^[A-Z0-9_]+$/.test(value.slice(0, equals))) {
    value = value.slice(equals + 1).trim();
  }
  return value.replace(/^["']|["']$/g, "");
}

export const credentials = new Hono<AppEnv>();

// Every credential route is authenticated (Google OAuth session) and owner-scoped.
credentials.use("*", requireSession);

credentials.get("/", async (c) => {
  const rows = await listCredentials(createDb(c.env.DB), c.get("user").id);
  return c.json(rows, 200);
});

credentials.post("/", validate("json", CreateCredentialRequest), async (c) => {
  const { provider, label, apiKey: rawApiKey } = c.req.valid("json");
  const apiKey = normalizeApiKey(rawApiKey);
  const ownerId = c.get("user").id;

  // Verify against the provider before we persist anything.
  const verified = await verifyProviderKey(provider, apiKey);
  if (!verified.ok) {
    if (verified.reason === "rejected") {
      console.warn(
        JSON.stringify({
          level: "warn",
          type: "credential-verify",
          provider,
          status: verified.status,
        }),
      );
      throw new AppError(
        400,
        "INVALID_CREDENTIAL",
        `The ${provider} key was rejected by the provider (HTTP ${verified.status})`,
      );
    }
    console.warn(
      JSON.stringify({
        level: "warn",
        type: "credential-verify",
        provider,
        reason: "unreachable",
      }),
    );
    throw new AppError(
      502,
      "PROVIDER_UNREACHABLE",
      `Could not reach ${provider} to verify the key`,
    );
  }

  if (!c.env.BYOK_KEK) {
    throw new AppError(
      500,
      "SERVER_MISCONFIGURED",
      "Server is missing BYOK_KEK (the envelope-encryption key). Set it in .dev.vars / as a Worker secret.",
    );
  }

  const normalizedLabel = label ?? "";
  const sealed = await sealSecret(
    c.env,
    { ownerId, provider, label: normalizedLabel },
    apiKey,
  );
  const now = new Date().toISOString();

  const row = await upsertCredential(createDb(c.env.DB), {
    id: crypto.randomUUID(),
    ownerId,
    provider,
    label: normalizedLabel,
    ...sealed,
    createdAt: now,
    updatedAt: now,
  });

  return c.json(row, 201);
});

credentials.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await deleteCredential(
    createDb(c.env.DB),
    c.get("user").id,
    id,
  );
  if (!deleted) {
    throw new AppError(
      404,
      "CREDENTIAL_NOT_FOUND",
      `Credential ${id} not found`,
    );
  }
  return c.body(null, 204);
});
