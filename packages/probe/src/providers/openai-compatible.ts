import type {
  ClassifyRule,
  ModelCapabilities,
  ModelInfo,
  ModelKind,
} from "../domain/model";
import { classifyByRules } from "../domain/model";
import type {
  AdapterContext,
  ProviderAdapter,
  ProviderMeta,
} from "../domain/provider";
import type { QuotaNormalizer, Usage } from "../domain/probe";
import { finalizeOutcome } from "../probe/outcome";
import { defaultQuota } from "../probe/quota";
import { ProbeAccumulator, sseProbe } from "../probe/stream";
import { asRecord, num, safeJson } from "../probe/util";

export type ModelRecord = Record<string, unknown>;

export interface OpenAiCompatibleConfig {
  meta: ProviderMeta;
  /** Static base URL, or a resolver when the key carries routing info (e.g. Cloudflare account id). */
  baseUrl: string | ((apiKey: string) => string);
  auth: (apiKey: string) => Record<string, string>;
  /** Default "/models". */
  modelsPath?: string;
  /** Default "/chat/completions". */
  chatPath?: string;
  /** For providers with no models endpoint. */
  staticModels?: ModelInfo[];
  /** Extract model records from a non-OpenAI `/models` body (e.g. Cloudflare `result[]`). */
  parseModels?: (body: unknown) => ModelRecord[];
  /** Normalize a provider's model id (e.g. strip Gemini's `models/` prefix). */
  normalizeId?: (id: string) => string;
  /** Optional key validation, run before any request (throws a user-facing error). */
  validateKey?: (apiKey: string) => void;
  /** Keep only models that should be probed (e.g. OpenRouter free tier). */
  filterModels?: (raw: ModelRecord) => boolean;
  classifyRules?: readonly ClassifyRule[];
  classify?: (raw: ModelRecord) => ModelKind;
  capabilities?: (raw: ModelRecord) => Partial<ModelCapabilities>;
  /** Send `stream_options.include_usage` (default true). */
  streamUsage?: boolean;
  quota?: QuotaNormalizer;
  /** Map a non-standard usage object to the canonical one. */
  usage?: (raw: ModelRecord) => Usage;
  /** Delta fields that carry reasoning/thinking text (default ["reasoning_content"]). */
  reasoningDeltaFields?: readonly string[];
}

/** One implementation for the whole OpenAI-compatible provider family. */
export function createOpenAiCompatibleAdapter(
  config: OpenAiCompatibleConfig,
): ProviderAdapter {
  const configuredBaseUrl = config.baseUrl;
  const baseUrlFor = (apiKey: string): string => {
    const raw =
      typeof configuredBaseUrl === "function"
        ? configuredBaseUrl(apiKey)
        : configuredBaseUrl;
    return raw.replace(/\/+$/, "");
  };
  const modelsPath = config.modelsPath ?? "/models";
  const chatPath = config.chatPath ?? "/chat/completions";

  function toModelInfo(raw: ModelRecord): ModelInfo {
    const rawId = String(raw.id ?? raw.name ?? "");
    const id = config.normalizeId ? config.normalizeId(rawId) : rawId;
    const displayName =
      typeof raw.name === "string"
        ? raw.name
        : typeof raw.display_name === "string"
          ? raw.display_name
          : undefined;
    const haystack = `${id} ${displayName ?? ""}`.toLowerCase();
    const kind = config.classify
      ? config.classify(raw)
      : classifyByRules(haystack, config.classifyRules);
    const capabilities: ModelCapabilities = {
      chat: true,
      ...config.capabilities?.(raw),
    };
    if (kind !== "chat") capabilities.chat = false;
    return { id, displayName, kind, capabilities, raw };
  }

  return {
    meta: config.meta,

    async listModels(ctx: AdapterContext): Promise<ModelInfo[]> {
      config.validateKey?.(ctx.apiKey);
      if (config.staticModels) return config.staticModels;
      const url = `${baseUrlFor(ctx.apiKey)}${modelsPath}`;
      const response = await ctx.fetch(url, {
        headers: { ...config.auth(ctx.apiKey), accept: "application/json" },
      });
      const body = safeJson(await response.text());
      if (!response.ok) {
        throw new Error(
          `${config.meta.label} models request failed (HTTP ${response.status}) at ${url}`,
        );
      }
      const data = config.parseModels
        ? config.parseModels(body)
        : (asRecord(body).data as unknown);
      return (Array.isArray(data) ? data : [])
        .map((raw) => asRecord(raw))
        .filter((raw) => !config.filterModels || config.filterModels(raw))
        .map((raw) => toModelInfo(raw));
    },

    async probeChat(ctx: AdapterContext, model: ModelInfo) {
      config.validateKey?.(ctx.apiKey);
      const startedAt = Date.now();
      const requestBody: ModelRecord = {
        model: model.id,
        messages: [{ role: "user", content: "ping" }],
        stream: true,
      };
      if (config.streamUsage !== false)
        requestBody.stream_options = { include_usage: true };

      const draft = await sseProbe(
        ctx,
        {
          url: `${baseUrlFor(ctx.apiKey)}${chatPath}`,
          headers: {
            ...config.auth(ctx.apiKey),
            "content-type": "application/json",
          },
          body: JSON.stringify(requestBody),
          translate: (event, acc) => translateOpenAiChunk(event, acc, config),
          quota: config.quota ?? defaultQuota,
        },
        startedAt,
      );

      return finalizeOutcome(model, draft, startedAt);
    },
  };
}

function translateOpenAiChunk(
  event: unknown,
  acc: ProbeAccumulator,
  config: OpenAiCompatibleConfig,
): void {
  const chunk = asRecord(event);

  if (typeof chunk.model === "string" && chunk.model.length > 0)
    acc.resolvedModel = config.normalizeId
      ? config.normalizeId(chunk.model)
      : chunk.model;

  const choices = chunk.choices;
  if (Array.isArray(choices)) {
    const delta = asRecord(asRecord(choices[0]).delta);
    const content = delta.content;
    if (typeof content === "string" && content.length > 0)
      acc.pushContent(content);

    for (const field of config.reasoningDeltaFields ?? ["reasoning_content"]) {
      const value = delta[field];
      if (
        (typeof value === "string" && value.length > 0) ||
        (typeof value === "object" && value !== null)
      ) {
        acc.sawReasoning = true;
        break;
      }
    }
    if (asRecord(asRecord(delta.extra_content).google).thought_signature) {
      acc.sawReasoning = true;
    }
  }

  if (chunk.usage) {
    acc.setUsage(
      config.usage
        ? config.usage(asRecord(chunk.usage))
        : defaultUsage(asRecord(chunk.usage)),
    );
  }
}

function defaultUsage(usage: ModelRecord): Usage {
  const details = asRecord(usage.completion_tokens_details);
  return {
    promptTokens: num(usage.prompt_tokens),
    completionTokens: num(usage.completion_tokens),
    totalTokens: num(usage.total_tokens),
    reasoningTokens: num(details.reasoning_tokens),
  };
}
