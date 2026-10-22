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

  // --- Free-model catalog sync (KAN-44) ---------------------------------
  // Ops keys used only by the nightly discovery job. User credentials live
  // encrypted in D1 and are never read by it.
  CATALOG_GEMINI_API_KEY?: string;
  CATALOG_GROQ_API_KEY?: string;
  CATALOG_NVIDIA_API_KEY?: string;
  CATALOG_OPENROUTER_API_KEY?: string;
  /** Shared token for POST /api/catalog/refresh. */
  CATALOG_ADMIN_TOKEN?: string;
  /**
   * "1" lets a bare `runCatalogSync` run. The nightly cron is gone, so this
   * is only meaningful for the forced admin refresh route.
   */
  CATALOG_ENABLED?: string;
  /** "1" discovers and logs without writing. */
  CATALOG_DRY_RUN?: string;
  /** Max probes per run (default 25). */
  CATALOG_PROBE_LIMIT?: string;
  /** Probe parallelism override (default: per-provider). */
  CATALOG_CONCURRENCY?: string;
  /** "1" bypasses the >50% shrink guard. */
  CATALOG_ALLOW_SHRINK?: string;
  /** Days before a remembered rejection is probed again (default 7). */
  CATALOG_REPROBE_DAYS?: string;
  /** Per-request upstream timeout in ms (default 12000). */
  CATALOG_TIMEOUT_MS?: string;

  // --- Provider request/response tracing ---------------------------------
  /** "1" logs provider request/response traces (bodies truncated, key never). */
  GATEWAY_LLM_LOGGING?: string;

  // --- BYOK probe reports (KAN-46) ---------------------------------------
  /** Queue that executes user-triggered probe reports. */
  PROBE_QUEUE?: Queue<{ runId: string }>;
  /** Max models probed per report (default 200). */
  REPORT_PROBE_LIMIT?: string;
  /** Days a model stays "available" after its last successful probe (default 7). */
  AVAILABILITY_TTL_DAYS?: string;
}
