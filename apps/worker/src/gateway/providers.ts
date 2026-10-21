// Provider catalog. Google Gemini, Groq, NVIDIA, and OpenRouter are supported;
// all offer a free tier. Knows how to verify a key and how to talk to each
// provider's chat API.

export type ProviderId = "gemini" | "groq" | "nvidia" | "openrouter";
export type ProviderDialect = "openai" | "gemini";

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  dialect: ProviderDialect;
  /** Cheapest endpoint that authenticates the key (a models list). */
  verifyUrl: string;
  /** OpenAI dialect: the full chat-completions URL. Gemini: the API base. */
  chatUrl: string;
  auth: (apiKey: string) => Record<string, string>;
}

const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    dialect: "gemini",
    verifyUrl:
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
    chatUrl: "https://generativelanguage.googleapis.com/v1beta",
    auth: (apiKey) => ({ "x-goog-api-key": apiKey }),
  },
  groq: {
    id: "groq",
    label: "Groq",
    dialect: "openai",
    verifyUrl: "https://api.groq.com/openai/v1/models",
    chatUrl: "https://api.groq.com/openai/v1/chat/completions",
    auth: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  nvidia: {
    id: "nvidia",
    label: "NVIDIA",
    dialect: "openai",
    // NVIDIA NIM exposes an OpenAI-compatible API; the free tier is provisioned
    // at https://build.nvidia.com (keys start with `nvapi-`).
    verifyUrl: "https://integrate.api.nvidia.com/v1/models",
    chatUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
    auth: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    dialect: "openai",
    // /models is public, so verify against the authenticated key endpoint
    // (keys start with `sk-or-`).
    verifyUrl: "https://openrouter.ai/api/v1/key",
    chatUrl: "https://openrouter.ai/api/v1/chat/completions",
    auth: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function getProvider(id: ProviderId): ProviderSpec {
  return PROVIDERS[id];
}

export function isProviderId(value: string): value is ProviderId {
  return (
    value === "gemini" ||
    value === "groq" ||
    value === "nvidia" ||
    value === "openrouter"
  );
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "rejected"; status: number }
  | { ok: false; reason: "unreachable" };

/** Verifies a key against the provider. Never logs the key itself. */
export async function verifyProviderKey(
  provider: ProviderId,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyResult> {
  try {
    const response = await fetchImpl(PROVIDERS[provider].verifyUrl, {
      headers: PROVIDERS[provider].auth(apiKey),
    });
    return response.ok
      ? { ok: true }
      : { ok: false, reason: "rejected", status: response.status };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
