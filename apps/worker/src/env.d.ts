// Secrets/vars not captured by `wrangler types` (set via .dev.vars / `wrangler
// secret`). Merges with the generated global `Env` interface.
interface Env {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** Base64 of the 32-byte envelope KEK (AES-KW). Worker secret. */
  BYOK_KEK?: string;
  /** KEK version label (defaults to "1"). */
  BYOK_KEK_VERSION?: string;
}
