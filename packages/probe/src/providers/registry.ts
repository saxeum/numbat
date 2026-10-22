import type { ProviderAdapter, ProviderMeta } from "../domain/provider";
import {
  gemini,
  groq,
  openai,
  nvidia,
  openrouter,
  cloudflare,
  llm7,
  ollama,
} from "./configs";

export const DEFAULT_PROVIDER_ID = "gemini";

export const PROVIDERS: readonly ProviderAdapter[] = [
  gemini,
  groq,
  openai,
  nvidia,
  openrouter,
  cloudflare,
  llm7,
  ollama,
];

export function getAdapter(providerId: string): ProviderAdapter {
  const found = PROVIDERS.find((provider) => provider.meta.id === providerId);
  if (!found) throw new Error(`Unknown provider "${providerId}"`);
  return found;
}

export function listProviderMeta(): ProviderMeta[] {
  return PROVIDERS.map((provider) => provider.meta);
}

export function isKnownProvider(providerId: string): boolean {
  return PROVIDERS.some((provider) => provider.meta.id === providerId);
}
