import { and, desc, eq, isNull } from "drizzle-orm";

import type { Database } from "../client";
import { apiKeys } from "../schema";

/** Masked view — never includes the token or its hash. */
export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const columns = {
  id: apiKeys.id,
  name: apiKeys.name,
  prefix: apiKeys.prefix,
  createdAt: apiKeys.createdAt,
  lastUsedAt: apiKeys.lastUsedAt,
  revokedAt: apiKeys.revokedAt,
};

export function listApiKeys(
  db: Database,
  ownerId: string,
): Promise<ApiKeyRow[]> {
  return db
    .select(columns)
    .from(apiKeys)
    .where(eq(apiKeys.ownerId, ownerId))
    .orderBy(desc(apiKeys.createdAt));
}

export interface CreateApiKeyValues {
  id: string;
  ownerId: string;
  name: string;
  prefix: string;
  hash: string;
  createdAt: string;
}

export async function createApiKey(
  db: Database,
  values: CreateApiKeyValues,
): Promise<ApiKeyRow> {
  const [row] = await db.insert(apiKeys).values(values).returning(columns);
  return row!;
}

export async function revokeApiKey(
  db: Database,
  ownerId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .update(apiKeys)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(apiKeys.ownerId, ownerId), eq(apiKeys.id, id)))
    .returning({ id: apiKeys.id });
  return rows.length > 0;
}

export async function findActiveApiKeyByHash(
  db: Database,
  hash: string,
): Promise<{ id: string; ownerId: string } | undefined> {
  const [row] = await db
    .select({ id: apiKeys.id, ownerId: apiKeys.ownerId })
    .from(apiKeys)
    .where(and(eq(apiKeys.hash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);
  return row;
}

export async function touchApiKey(
  db: Database,
  id: string,
  usedAt: string,
): Promise<void> {
  await db
    .update(apiKeys)
    .set({ lastUsedAt: usedAt })
    .where(eq(apiKeys.id, id));
}
