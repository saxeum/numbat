// Envelope encryption for provider credentials (KAN-22; see
// `docs/decisions/0001-key-vault.md`).
//
//   KEK (AES-256-KW, Worker secret)  ── wraps ──▶  per-record DEK (AES-256-GCM)
//   DEK                              ── encrypts ─▶ provider key
//
// Only the wrapped DEK + ciphertext are stored. Decryption happens per request
// and the plaintext never leaves memory or reaches the logs.

const AES_KW = "AES-KW";
const AES_GCM = "AES-GCM";
const IV_BYTES = 12;

export interface SealedSecret {
  keyVersion: number;
  /** base64 AES-KW(DEK) */
  wrappedDek: string;
  /** base64 96-bit IV */
  iv: string;
  /** base64 AES-GCM(secret) */
  ciphertext: string;
  /** base64 SHA-256 of the plaintext (verify/dedupe only) */
  fingerprint: string;
}

/** Binds a ciphertext to its owner + record so it can't be replayed elsewhere. */
export interface SecretContext {
  ownerId: string;
  provider: string;
  label: string;
}

function encode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]!);
  return btoa(binary);
}

function decode(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function kekVersion(env: Env): number {
  const parsed = Number.parseInt(env.BYOK_KEK_VERSION ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function aad(context: SecretContext): Uint8Array {
  return new TextEncoder().encode(
    `numbat:v1:key:${context.ownerId}:${context.provider}:${context.label}`,
  );
}

async function importKek(env: Env): Promise<CryptoKey> {
  if (!env.BYOK_KEK) {
    throw new Error("BYOK_KEK is not configured");
  }
  const raw = decode(env.BYOK_KEK);
  if (raw.byteLength !== 32) {
    throw new Error("BYOK_KEK must be a base64-encoded 32-byte key");
  }
  return crypto.subtle.importKey("raw", raw, { name: AES_KW }, false, [
    "wrapKey",
    "unwrapKey",
  ]);
}

async function fingerprint(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return encode(digest);
}

/** Encrypt a secret for a record. Returns only non-reversible material. */
export async function sealSecret(
  env: Env,
  context: SecretContext,
  secret: string,
): Promise<SealedSecret> {
  const kek = await importKek(env);
  const dek = (await crypto.subtle.generateKey(
    { name: AES_GCM, length: 256 },
    true,
    ["encrypt", "decrypt"],
  )) as CryptoKey;
  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, {
    name: AES_KW,
  });
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_GCM, iv, additionalData: aad(context) },
    dek,
    new TextEncoder().encode(secret),
  );
  return {
    keyVersion: kekVersion(env),
    wrappedDek: encode(wrapped),
    iv: encode(iv),
    ciphertext: encode(ciphertext),
    fingerprint: await fingerprint(secret),
  };
}

/** Decrypt a sealed record. Throws if the KEK or the AAD context is wrong. */
export async function openSecret(
  env: Env,
  context: SecretContext,
  sealed: Pick<SealedSecret, "wrappedDek" | "iv" | "ciphertext">,
): Promise<string> {
  const kek = await importKek(env);
  const dek = await crypto.subtle.unwrapKey(
    "raw",
    decode(sealed.wrappedDek),
    kek,
    { name: AES_KW },
    { name: AES_GCM, length: 256 },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: AES_GCM, iv: decode(sealed.iv), additionalData: aad(context) },
    dek,
    decode(sealed.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
