// Discovery specs: where to list a provider's models, how to authenticate, and
// how (if at all) the provider tells us a model is free.
//
// This composes `src/gateway/providers.ts` so URLs and auth live in one place;
// it only adds what catalog discovery needs. Ported from the byokfree gateway
// (`src/providers.ts`, `src/free-models.ts`) — see
// `docs/free-model-discovery-cron.md`.

import { getProvider, type ProviderId } from "../gateway/providers";

/**
 * How we decide a listed model is free on this provider.
 *
 * - `pricing`   — `/models` carries prices; free iff all zero (OpenRouter).
 * - `free-tier` — the provider has a rate-limited free tier that is not
 *                 model-gated, so every listed chat model is free-ish
 *                 (Gemini, Groq). New models are still probe-verified.
 * - `probe`     — `/models` exposes no price, so only a real request can
 *                 confirm a model is usable on the free tier (NVIDIA).
 */
export type FreeStrategy = "pricing" | "free-tier" | "probe";

export interface DiscoverySpec {
  id: ProviderId;
  label: string;
  /** Where the provider lists models. */
  modelsUrl: string;
  /** OpenAI dialect: the full chat-completions URL. Gemini: the API base. */
  chatUrl: string;
  dialect: "openai" | "gemini";
  free: FreeStrategy;
  /** Worker secret holding the ops key used for discovery (never a user key). */
  keyEnv: string;
  /** Catalog ordering band; rows are sorted by `sortBase + index`. */
  sortBase: number;
  /** Probe parallelism for this provider. */
  concurrency: number;
}

export const DISCOVERY_SPECS: Record<ProviderId, DiscoverySpec> = {
  gemini: {
    id: "gemini",
    label: getProvider("gemini").label,
    modelsUrl:
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    chatUrl: "https://generativelanguage.googleapis.com/v1beta",
    dialect: "gemini",
    free: "free-tier",
    keyEnv: "CATALOG_GEMINI_API_KEY",
    sortBase: 10,
    concurrency: 2,
  },
  groq: {
    id: "groq",
    label: getProvider("groq").label,
    modelsUrl: "https://api.groq.com/openai/v1/models",
    chatUrl: "https://api.groq.com/openai/v1/chat/completions",
    dialect: "openai",
    free: "free-tier",
    keyEnv: "CATALOG_GROQ_API_KEY",
    sortBase: 100,
    concurrency: 4,
  },
  nvidia: {
    id: "nvidia",
    label: getProvider("nvidia").label,
    modelsUrl: "https://integrate.api.nvidia.com/v1/models",
    chatUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
    dialect: "openai",
    free: "probe",
    keyEnv: "CATALOG_NVIDIA_API_KEY",
    sortBase: 200,
    concurrency: 6,
  },
  openrouter: {
    id: "openrouter",
    label: getProvider("openrouter").label,
    modelsUrl: "https://openrouter.ai/api/v1/models",
    chatUrl: "https://openrouter.ai/api/v1/chat/completions",
    dialect: "openai",
    free: "pricing",
    keyEnv: "CATALOG_OPENROUTER_API_KEY",
    sortBase: 300,
    concurrency: 4,
  },
};

/** Providers are refreshed in this order so catalog sort bands stay stable. */
export const DISCOVERY_ORDER: readonly ProviderId[] = [
  "gemini",
  "groq",
  "nvidia",
  "openrouter",
];

export function discoverySpec(id: ProviderId): DiscoverySpec {
  return DISCOVERY_SPECS[id];
}

export function discoverySpecs(): DiscoverySpec[] {
  return DISCOVERY_ORDER.map((id) => DISCOVERY_SPECS[id]);
}

/** Auth headers for a provider request. Never logged. */
export function authHeaders(
  spec: DiscoverySpec,
  apiKey: string,
): Record<string, string> {
  return spec.dialect === "gemini"
    ? { "x-goog-api-key": apiKey }
    : { authorization: `Bearer ${apiKey}` };
}
