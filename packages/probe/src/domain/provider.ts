import type { ModelInfo } from "./model";
import type { ProbeOutcome } from "./probe";

export interface ProviderMeta {
  id: string;
  label: string;
  transport: "openai-compatible" | "native";
  docsUrl?: string;
  keyHint?: string;
  /** Max in-flight probes; defaults to the engine's global concurrency. */
  concurrency?: number;
}

/** Everything an adapter needs that is not provider-specific. */
export interface AdapterContext {
  apiKey: string;
  timeoutMs: number;
  /** Injectable so adapters can be tested offline. */
  fetch: typeof fetch;
  signal?: AbortSignal;
}

export interface ProviderAdapter {
  meta: ProviderMeta;
  listModels(ctx: AdapterContext): Promise<ModelInfo[]>;
  probeChat(ctx: AdapterContext, model: ModelInfo): Promise<ProbeOutcome>;
}
