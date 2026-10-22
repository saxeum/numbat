import { and, desc, eq } from "drizzle-orm";

import type { Database } from "../client";
import { providerCredentials } from "../schema";

/** Masked view — never includes the secret or its ciphertext. */
export interface CredentialListRow {
  id: string;
  provider: string;
  label: string;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
}

const maskedColumns = {
  id: providerCredentials.id,
  provider: providerCredentials.provider,
  label: providerCredentials.label,
  fingerprint: providerCredentials.fingerprint,
  createdAt: providerCredentials.createdAt,
  updatedAt: providerCredentials.updatedAt,
};

export function listCredentials(
  db: Database,
  ownerId: string,
): Promise<CredentialListRow[]> {
  return db
    .select(maskedColumns)
    .from(providerCredentials)
    .where(eq(providerCredentials.ownerId, ownerId))
    .orderBy(desc(providerCredentials.createdAt));
}

export interface UpsertCredentialValues {
  id: string;
  ownerId: string;
  provider: string;
  label: string;
  keyVersion: number;
  wrappedDek: string;
  iv: string;
  ciphertext: string;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
}

/** Insert, or replace the sealed material for an existing (owner, provider, label). */
export async function upsertCredential(
  db: Database,
  values: UpsertCredentialValues,
): Promise<CredentialListRow> {
  const [row] = await db
    .insert(providerCredentials)
    .values(values)
    .onConflictDoUpdate({
      target: [
        providerCredentials.ownerId,
        providerCredentials.provider,
        providerCredentials.label,
      ],
      set: {
        keyVersion: values.keyVersion,
        wrappedDek: values.wrappedDek,
        iv: values.iv,
        ciphertext: values.ciphertext,
        fingerprint: values.fingerprint,
        updatedAt: values.updatedAt,
      },
    })
    .returning(maskedColumns);
  return row!;
}

export interface SealedCredential {
  label: string;
  keyVersion: number;
  wrappedDek: string;
  iv: string;
  ciphertext: string;
}

/** The sealed material for a provider (used by the chat proxy). */
export async function getSealedCredential(
  db: Database,
  ownerId: string,
  provider: string,
): Promise<SealedCredential | undefined> {
  const [row] = await db
    .select({
      label: providerCredentials.label,
      keyVersion: providerCredentials.keyVersion,
      wrappedDek: providerCredentials.wrappedDek,
      iv: providerCredentials.iv,
      ciphertext: providerCredentials.ciphertext,
    })
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.ownerId, ownerId),
        eq(providerCredentials.provider, provider),
      ),
    )
    .limit(1);
  return row;
}

/** The sealed material for one specific credential (by id), owner-scoped. */
export async function getSealedCredentialById(
  db: Database,
  ownerId: string,
  id: string,
): Promise<SealedCredential | undefined> {
  const [row] = await db
    .select({
      label: providerCredentials.label,
      keyVersion: providerCredentials.keyVersion,
      wrappedDek: providerCredentials.wrappedDek,
      iv: providerCredentials.iv,
      ciphertext: providerCredentials.ciphertext,
    })
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.ownerId, ownerId),
        eq(providerCredentials.id, id),
      ),
    )
    .limit(1);
  return row;
}

export interface CredentialMeta {
  id: string;
  provider: string;
  label: string;
}

/** Provider + label for one credential (by id), owner-scoped. No key material. */
export async function getCredentialMetaById(
  db: Database,
  ownerId: string,
  id: string,
): Promise<CredentialMeta | undefined> {
  const [row] = await db
    .select({
      id: providerCredentials.id,
      provider: providerCredentials.provider,
      label: providerCredentials.label,
    })
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.ownerId, ownerId),
        eq(providerCredentials.id, id),
      ),
    )
    .limit(1);
  return row;
}

/** Crypto-shred: deleting the row deletes the wrapped DEK. */
export async function deleteCredential(
  db: Database,
  ownerId: string,
  id: string,
): Promise<boolean> {
  const deleted = await db
    .delete(providerCredentials)
    .where(
      and(
        eq(providerCredentials.ownerId, ownerId),
        eq(providerCredentials.id, id),
      ),
    )
    .returning({ id: providerCredentials.id });
  return deleted.length > 0;
}
