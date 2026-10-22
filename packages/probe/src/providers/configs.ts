import type { ClassifyRule, ModelKind } from "../domain/model";
import { classifyByRules } from "../domain/model";
import {
  GROQ_RATE_LIMIT_METRICS,
  LLM7_FREE_LIMITS,
  OPENAI_RATE_LIMIT_METRICS,
  documentedQuota,
  geminiQuota,
  rateLimitQuota,
} from "../probe/quota";
import { asRecord } from "../probe/util";
import {
  createOpenAiCompatibleAdapter,
  type ModelRecord,
} from "./openai-compatible";

const bearer = (apiKey: string) => ({ Authorization: `Bearer ${apiKey}` });

/**
 * Google's OpenAI shim lists model ids as `models/gemini-…`, but the native
 * gateway URL (`/v1beta/models/{model}:generateContent`) adds its own segment.
 * Strip the prefix so stored ids match the catalog and the gateway.
 */
const stripModelsPrefix = (id: string) => id.replace(/^models\//, "");

const GEMINI_RULES: readonly ClassifyRule[] = [
  ["embedding", /embedding/],
  ["text-to-speech", /tts|text-to-speech|native-audio/],
  ["image", /image|nano-banana/],
  ["video", /veo/],
  ["music", /lyria/],
  ["transcription", /transcrib/],
  ["audio", /live|translate/],
  ["computer-use", /computer-use/],
  ["deep-research", /deep-research/],
  ["agent", /antigravity/],
  ["other", /(^|\/)aqa$/],
];

export const gemini = createOpenAiCompatibleAdapter({
  meta: {
    id: "gemini",
    label: "Google Gemini",
    transport: "openai-compatible",
    docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
    keyHint: "AI Studio key (AQ.…)",
  },
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  auth: bearer,
  normalizeId: stripModelsPrefix,
  classifyRules: GEMINI_RULES,
  quota: geminiQuota,
});

const GROQ_RULES: readonly ClassifyRule[] = [
  ["transcription", /whisper|transcri/],
  ["text-to-speech", /orpheus|tts/],
  ["embedding", /embedding|bge|gte/],
  ["other", /prompt-guard/],
];

function groqCapabilities(raw: ModelRecord) {
  const inputModalities = Array.isArray(raw.input_modalities)
    ? raw.input_modalities
    : [];
  const features = Array.isArray(raw.supported_features)
    ? raw.supported_features
    : [];
  return {
    vision: inputModalities.includes("image"),
    reasoningDeclared: features.includes("reasoning"),
  };
}

export const groq = createOpenAiCompatibleAdapter({
  meta: {
    id: "groq",
    label: "Groq",
    transport: "openai-compatible",
    docsUrl: "https://console.groq.com/docs/openai",
    keyHint: "Groq API key (gsk_…)",
  },
  baseUrl: "https://api.groq.com/openai/v1",
  auth: bearer,
  classifyRules: GROQ_RULES,
  capabilities: groqCapabilities,
  quota: rateLimitQuota(GROQ_RATE_LIMIT_METRICS),
});

export const nvidia = createOpenAiCompatibleAdapter({
  meta: {
    id: "nvidia",
    label: "NVIDIA NIM",
    transport: "openai-compatible",
    docsUrl: "https://docs.nvidia.com/nim/",
    keyHint: "NVIDIA API key (nvapi-…)",
  },
  baseUrl: "https://integrate.api.nvidia.com/v1",
  auth: bearer,
  // The /models payload only has id/owned_by, so classify by name.
  classifyRules: [
    ["embedding", /embed|retriever|nvclip|embedqa/],
    ["other", /guard|safety|reward|detector|calibration/],
  ],
});

/** OpenRouter: free tier is either a ":free" id or a zero-priced model. */
function openRouterIsFree(raw: ModelRecord): boolean {
  const id = String(raw.id ?? "");
  if (id.endsWith(":free")) return true;
  const pricing = (raw.pricing ?? {}) as Record<string, unknown>;
  return Number(pricing.prompt) === 0 && Number(pricing.completion) === 0;
}

function openRouterCapabilities(raw: ModelRecord) {
  const architecture = (raw.architecture ?? {}) as Record<string, unknown>;
  const inputModalities = Array.isArray(architecture.input_modalities)
    ? architecture.input_modalities
    : [];
  const parameters = Array.isArray(raw.supported_parameters)
    ? raw.supported_parameters
    : [];
  return {
    vision: inputModalities.includes("image"),
    reasoningDeclared: parameters.includes("reasoning"),
  };
}

const OPENROUTER_RULES: readonly ClassifyRule[] = [
  ["embedding", /embed/],
  ["music", /lyria/],
  ["image", /image|diffusion|dall-e/],
  ["transcription", /whisper|transcri/],
  ["text-to-speech", /tts|orpheus/],
];

export const openrouter = createOpenAiCompatibleAdapter({
  meta: {
    id: "openrouter",
    label: "OpenRouter (free)",
    transport: "openai-compatible",
    docsUrl: "https://openrouter.ai/docs",
    keyHint: "OpenRouter key (sk-or-…)",
  },
  baseUrl: "https://openrouter.ai/api/v1",
  auth: bearer,
  // Only probe free-tier models — OpenRouter lists 400+.
  filterModels: openRouterIsFree,
  classifyRules: OPENROUTER_RULES,
  capabilities: openRouterCapabilities,
  reasoningDeltaFields: ["reasoning", "reasoning_details", "reasoning_content"],
});

export const openai = createOpenAiCompatibleAdapter({
  meta: {
    id: "openai",
    label: "OpenAI",
    transport: "openai-compatible",
    docsUrl: "https://platform.openai.com/docs/api-reference",
    keyHint: "OpenAI API key (sk-…)",
  },
  baseUrl: "https://api.openai.com/v1",
  auth: bearer,
  quota: rateLimitQuota(OPENAI_RATE_LIMIT_METRICS),
  classifyRules: [
    ["embedding", /embedding/],
    ["text-to-speech", /tts/],
    ["image", /dall-e|gpt-image/],
    ["transcription", /whisper|transcribe/],
  ],
});

/**
 * Cloudflare Workers AI.
 *
 * The OpenAI-compatible surface is hosted per-account, so the stored key is
 * `<account_id>:<api_token>` (the token alone cannot address the account).
 * Models are listed from the native `/ai/models/search` endpoint; chat probes
 * use the OpenAI-compatible `/ai/v1/chat/completions` endpoint.
 */
function splitCloudflareKey(apiKey: string): {
  accountId: string;
  token: string;
} {
  const separator = apiKey.indexOf(":");
  if (separator === -1) return { accountId: apiKey.trim(), token: "" };
  return {
    accountId: apiKey.slice(0, separator).trim(),
    token: apiKey.slice(separator + 1).trim(),
  };
}

const CF_ACCOUNT_ID = /^[0-9a-f]{32}$/i;

/** Fail with an actionable message instead of a bare HTTP 404 from the API. */
function validateCloudflareKey(apiKey: string): void {
  const { accountId, token } = splitCloudflareKey(apiKey);
  if (!CF_ACCOUNT_ID.test(accountId)) {
    const looksLikeToken =
      accountId.length > 32 && /[^0-9a-f]/i.test(accountId);
    throw new Error(
      'Cloudflare key must be "<account_id>:<api_token>". ' +
        (looksLikeToken
          ? "No account id prefix was found — it looks like only the token was entered."
          : `"${accountId.slice(0, 12)}…" is not a 32-char hex account id.`),
    );
  }
  if (!token) {
    throw new Error(
      'Cloudflare key is missing the API token after "account_id:".',
    );
  }
}

/**
 * The search endpoint returns a UUID `id`; the callable model name ("@cf/…") is
 * in `name`. Re-key each record so the shared factory uses the callable id.
 */
function cloudflareModels(body: unknown): ModelRecord[] {
  const result = asRecord(body).result;
  if (!Array.isArray(result)) return [];
  return result.map((entry) => {
    const raw = asRecord(entry);
    return { ...raw, id: String(raw.name ?? raw.id ?? "") };
  });
}

/** Cloudflare exposes a human-readable task name ("Text Generation", …). */
function cloudflareTask(raw: ModelRecord): string {
  return String(asRecord(raw.task).name ?? "").toLowerCase();
}

const CLOUDFLARE_RULES: readonly ClassifyRule[] = [
  ["embedding", /embedding|bge|gte/],
  ["transcription", /whisper|speech-recognition|transcrib/],
  ["text-to-speech", /tts|melotts|aura|speech-synthesis/],
  ["image", /flux|stable-diffusion|dreamshaper|sdxl|text-to-image/],
  ["other", /guard|safety|moderation/],
];

function cloudflareKind(raw: ModelRecord): ModelKind {
  const task = cloudflareTask(raw);
  if (task.includes("embedding")) return "embedding";
  if (task.includes("speech recognition") || task.includes("transcription"))
    return "transcription";
  if (task.includes("text-to-speech") || task.includes("speech synthesis"))
    return "text-to-speech";
  if (task.includes("text-to-image") || task.includes("image-to-image"))
    return "image";
  if (
    task.includes("text generation") ||
    task.includes("conversational") ||
    task.includes("image-to-text")
  ) {
    return "chat";
  }
  // Unknown task (or none): fall back to catalog naming conventions.
  if (!task)
    return classifyByRules(
      `${raw.id ?? ""} ${raw.name ?? ""}`.toLowerCase(),
      CLOUDFLARE_RULES,
    );
  return "other";
}

export const cloudflare = createOpenAiCompatibleAdapter({
  meta: {
    id: "cloudflare",
    label: "Cloudflare Workers AI",
    transport: "openai-compatible",
    docsUrl:
      "https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/",
    keyHint: "account_id:API token",
  },
  baseUrl: (apiKey) =>
    `https://api.cloudflare.com/client/v4/accounts/${splitCloudflareKey(apiKey).accountId}`,
  auth: (apiKey) => ({
    Authorization: `Bearer ${splitCloudflareKey(apiKey).token}`,
  }),
  modelsPath: "/ai/models/search?per_page=100",
  chatPath: "/ai/v1/chat/completions",
  parseModels: cloudflareModels,
  classify: cloudflareKind,
  validateKey: validateCloudflareKey,
  streamUsage: false,
});

/**
 * LLM7.io — an OpenAI-compatible aggregator. Models carry a `model_type` and a
 * `capabilities` object, and reasoning streams as `delta.reasoning`.
 */
function llm7Kind(raw: ModelRecord): ModelKind {
  const type = String(raw.model_type ?? "").toLowerCase();
  if (type === "chat") return "chat";
  if (type === "audio_to_text") return "transcription";
  if (type === "image") return "image";
  if (type === "video") return "video";
  if (type) return "other";
  return classifyByRules(String(raw.id ?? "").toLowerCase(), []);
}

function llm7Capabilities(raw: ModelRecord) {
  const capabilities = asRecord(raw.capabilities);
  return {
    vision: capabilities.vision === true,
    tools: capabilities.tools === true,
    streaming: capabilities.stream === true,
    reasoningDeclared: capabilities.reasoning === true,
  };
}

export const llm7 = createOpenAiCompatibleAdapter({
  meta: {
    id: "llm7",
    label: "LLM7.io",
    transport: "openai-compatible",
    docsUrl: "https://docs.llm7.io/limits",
    keyHint: "LLM7 token (dash.llm7.io)",
    // Free tokens allow 1 request/second; keep in-flight probes conservative.
    concurrency: 1,
  },
  baseUrl: "https://api.llm7.io/v1",
  auth: bearer,
  classify: llm7Kind,
  capabilities: llm7Capabilities,
  reasoningDeltaFields: ["reasoning", "reasoning_content"],
  quota: documentedQuota(LLM7_FREE_LIMITS),
});

/**
 * Ollama Cloud (ollama.com). The OpenAI-compatible `/v1` surface only exposes
 * `{id,created,owned_by}`, so models come from the native `/api/tags` endpoint,
 * whose entries carry a `capabilities` array (completion/tools/vision/thinking).
 */
const OLLAMA_RULES: readonly ClassifyRule[] = [
  ["embedding", /embed|bge|nomic/],
  ["image", /diffusion|flux|stable-diffusion|sdxl/],
  ["transcription", /whisper/],
  ["text-to-speech", /tts|speech/],
];

function ollamaCaps(raw: ModelRecord): string[] {
  return Array.isArray(raw.capabilities) ? raw.capabilities.map(String) : [];
}

function ollamaKind(raw: ModelRecord): ModelKind {
  const caps = ollamaCaps(raw);
  if (caps.includes("completion")) return "chat";
  const byName = classifyByRules(
    String(raw.name ?? raw.id ?? "").toLowerCase(),
    OLLAMA_RULES,
  );
  // e.g. clef:27b ("decision") is not a completion model — skip it.
  return byName === "chat" ? "other" : byName;
}

function ollamaCapabilities(raw: ModelRecord) {
  const caps = ollamaCaps(raw);
  return {
    vision: caps.includes("vision"),
    tools: caps.includes("tools"),
    reasoningDeclared: caps.includes("thinking"),
  };
}

/**
 * Ollama Cloud is gated by concurrency, not requests/minute: Free = 1
 * concurrent request, Pro = 3, Max/Team = 10 (https://ollama.com/pricing).
 * Excess requests are queued, then rejected once the queue fills.
 */
const OLLAMA_FREE_LIMITS = [
  { metric: "concurrent requests", window: "free", limit: 1 },
] as const;

export const ollama = createOpenAiCompatibleAdapter({
  meta: {
    id: "ollama",
    label: "Ollama Cloud",
    transport: "openai-compatible",
    docsUrl: "https://docs.ollama.com/cloud",
    keyHint: "Ollama API key (ollama.com/settings/keys)",
    concurrency: 1,
  },
  baseUrl: "https://ollama.com",
  modelsPath: "/api/tags",
  chatPath: "/v1/chat/completions",
  parseModels: (body) => {
    const models = asRecord(body).models;
    return Array.isArray(models) ? (models as ModelRecord[]) : [];
  },
  auth: bearer,
  classify: ollamaKind,
  capabilities: ollamaCapabilities,
  reasoningDeltaFields: ["reasoning", "reasoning_content"],
  quota: documentedQuota(OLLAMA_FREE_LIMITS),
});
