import { describe, expect, it } from "vitest";

import {
  openSecret,
  sealSecret,
  type SecretContext,
} from "../src/crypto/vault";

function kek(byte: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(32).fill(byte)));
}

const env = { BYOK_KEK: kek(7), BYOK_KEK_VERSION: "1" } as unknown as Env;
const otherEnv = { BYOK_KEK: kek(9), BYOK_KEK_VERSION: "1" } as unknown as Env;

const context: SecretContext = {
  ownerId: "user_a",
  provider: "groq",
  label: "",
};

describe("vault (envelope encryption)", () => {
  it("round-trips a secret and never stores the plaintext", async () => {
    const sealed = await sealSecret(env, context, "test-secret-value");
    expect(sealed.ciphertext).not.toContain("test-secret-value");
    expect(sealed.wrappedDek).not.toContain("test-secret-value");
    expect(await openSecret(env, context, sealed)).toBe("test-secret-value");
  });

  it("produces fresh key material per seal (semantic security)", async () => {
    const a = await sealSecret(env, context, "same");
    const b = await sealSecret(env, context, "same");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.wrappedDek).not.toBe(b.wrappedDek);
    expect(a.iv).not.toBe(b.iv);
    // ...but the fingerprint is stable for dedupe/verify.
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("binds the ciphertext to its owner (AAD)", async () => {
    const sealed = await sealSecret(env, context, "s");
    await expect(
      openSecret(env, { ...context, ownerId: "user_b" }, sealed),
    ).rejects.toThrow();
  });

  it("fails to open with the wrong KEK", async () => {
    const sealed = await sealSecret(env, context, "s");
    await expect(openSecret(otherEnv, context, sealed)).rejects.toThrow();
  });

  it("requires a 32-byte KEK", async () => {
    const bad = {
      BYOK_KEK: btoa("short"),
      BYOK_KEK_VERSION: "1",
    } as unknown as Env;
    await expect(sealSecret(bad, context, "s")).rejects.toThrow(/32-byte/);
  });
});
