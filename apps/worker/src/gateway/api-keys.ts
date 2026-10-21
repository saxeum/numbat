// Gateway API-key tokens (KAN-28). The token is high-entropy, so a plain
// SHA-256 hash is sufficient for at-rest storage (no salt/KDF needed).

export const API_KEY_PREFIX = "nbk_";
const PREFIX_CHARS = API_KEY_PREFIX.length + 8;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]!);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Generate a new token: `nbk_` + 32 random bytes (base64url). */
export function generateApiKeyToken(): string {
  return (
    API_KEY_PREFIX + toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  );
}

/** The non-secret prefix used for display (`nbk_xxxxxxxx`). */
export function apiKeyDisplayPrefix(token: string): string {
  return token.slice(0, PREFIX_CHARS);
}

/** SHA-256 of the token, hex-encoded. */
export async function hashApiKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
