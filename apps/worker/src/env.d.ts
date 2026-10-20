// Secrets/vars not captured by `wrangler types` (set via .dev.vars / `wrangler
// secret`). Merges with the generated global `Env` interface.
interface Env {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}
