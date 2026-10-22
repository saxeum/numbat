import { z } from "zod";

export const Health = z
  .object({
    ok: z.boolean(),
    timestamp: z.string(),
    version: z.string(),
    database: z.string().optional(),
  })
  .passthrough();
export type Health = z.infer<typeof Health>;

export const ErrorResponse = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        requestId: z.string().optional(),
        details: z.unknown().optional(),
      })
      .passthrough(),
  })
  .passthrough();
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export const Credential = z
  .object({
    id: z.string(),
    provider: z.enum(["gemini", "groq", "nvidia", "openrouter"]),
    label: z.string(),
    fingerprint: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
export type Credential = z.infer<typeof Credential>;

export const CreateCredentialRequest = z.object({
  provider: z.enum(["gemini", "groq", "nvidia", "openrouter"]),
  label: z.string().max(64).optional(),
  apiKey: z.string().min(1),
});
export type CreateCredentialRequest = z.infer<typeof CreateCredentialRequest>;

export const Model = z
  .object({
    id: z.string(),
    object: z.literal("model"),
    owned_by: z.string(),
    "x-provider": z.enum(["gemini", "groq", "nvidia", "openrouter"]),
    "x-context": z.number().int().optional(),
    "x-free": z.boolean(),
    "x-available": z.boolean().optional(),
    "x-last-checked": z.string().optional(),
  })
  .passthrough();
export type Model = z.infer<typeof Model>;

export const ModelList = z
  .object({ object: z.literal("list"), data: z.array(Model) })
  .passthrough();
export type ModelList = z.infer<typeof ModelList>;

export const ReportTotals = z
  .object({
    models: z.number().int(),
    chat: z.number().int(),
    skipped: z.number().int(),
    passed: z.number().int(),
    failed: z.number().int(),
    withinQuota: z.number().int(),
    exhausted: z.number().int(),
    unavailable: z.number().int(),
    thinking: z.number().int(),
  })
  .passthrough();
export type ReportTotals = z.infer<typeof ReportTotals>;

export const QuotaLimit = z
  .object({
    metric: z.union([z.string(), z.null()]),
    window: z.union([z.string(), z.null()]),
    scope: z.union([z.string(), z.null()]),
    limit: z.union([z.number(), z.null()]),
    remaining: z.union([z.number(), z.null()]),
    resetAfterMs: z.union([z.number(), z.null()]),
  })
  .partial()
  .passthrough();
export type QuotaLimit = z.infer<typeof QuotaLimit>;

export const QuotaInfo = z
  .object({
    state: z.enum(["within-quota", "exhausted", "unavailable", "unknown"]),
    retryAfterMs: z.union([z.number(), z.null()]).optional(),
    limits: z.array(QuotaLimit),
  })
  .passthrough();
export type QuotaInfo = z.infer<typeof QuotaInfo>;

export const ReportModel = z
  .object({
    id: z.string(),
    modelId: z.string(),
    resolvedModel: z.union([z.string(), z.null()]).optional(),
    kind: z.string(),
    attempted: z.boolean(),
    ok: z.boolean(),
    status: z.union([z.number(), z.null()]).optional(),
    statusText: z.union([z.string(), z.null()]).optional(),
    durationMs: z.union([z.number(), z.null()]).optional(),
    ttftMs: z.union([z.number(), z.null()]).optional(),
    completionTokens: z.union([z.number(), z.null()]).optional(),
    reasoningTokens: z.union([z.number(), z.null()]).optional(),
    tps: z.union([z.number(), z.null()]).optional(),
    thinking: z.union([z.boolean(), z.null()]).optional(),
    content: z.union([z.string(), z.null()]).optional(),
    error: z
      .union([
        z
          .object({
            name: z.union([z.string(), z.null()]),
            message: z.union([z.string(), z.null()]),
          })
          .passthrough(),
        z.null(),
      ])
      .optional(),
    quota: QuotaInfo,
    requestBody: z.union([z.string(), z.null()]).optional(),
    body: z.union([z.string(), z.null()]).optional(),
    headers: z
      .union([z.object({}).partial().passthrough(), z.null()])
      .optional(),
  })
  .passthrough();
export type ReportModel = z.infer<typeof ReportModel>;

export const Report = z
  .object({
    id: z.string(),
    provider: z.string(),
    label: z.union([z.string(), z.null()]).optional(),
    status: z.enum(["queued", "running", "succeeded", "failed"]),
    trigger: z.string(),
    createdAt: z.string(),
    startedAt: z.union([z.string(), z.null()]).optional(),
    finishedAt: z.union([z.string(), z.null()]).optional(),
    durationMs: z.union([z.number(), z.null()]).optional(),
    progressDone: z.number().int(),
    progressTotal: z.number().int(),
    totals: ReportTotals,
    error: z.union([z.string(), z.null()]).optional(),
    models: z.array(ReportModel).optional(),
  })
  .passthrough();
export type Report = z.infer<typeof Report>;

export const ReportList = z.object({ reports: z.array(Report) }).passthrough();
export type ReportList = z.infer<typeof ReportList>;

export const CreateReportRequest = z.object({
  credentialId: z.string().min(1),
  label: z.union([z.string(), z.null()]).optional(),
});
export type CreateReportRequest = z.infer<typeof CreateReportRequest>;

export const ReportEnvelope = z.object({ report: Report }).passthrough();
export type ReportEnvelope = z.infer<typeof ReportEnvelope>;

export const UpdateReportRequest = z
  .object({ label: z.union([z.string(), z.null()]) })
  .partial();
export type UpdateReportRequest = z.infer<typeof UpdateReportRequest>;

export const ApiKey = z
  .object({
    id: z.string(),
    name: z.string(),
    prefix: z.string(),
    createdAt: z.string(),
    lastUsedAt: z.union([z.string(), z.null()]).optional(),
    revokedAt: z.union([z.string(), z.null()]).optional(),
  })
  .passthrough();
export type ApiKey = z.infer<typeof ApiKey>;

export const CreateApiKeyRequest = z.object({
  name: z.string().min(1).max(100),
});
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequest>;

export const ApiKeyCreated = z
  .object({
    id: z.string(),
    name: z.string(),
    prefix: z.string(),
    createdAt: z.string(),
    lastUsedAt: z.union([z.string(), z.null()]).optional(),
    revokedAt: z.union([z.string(), z.null()]).optional(),
    token: z.string(),
  })
  .passthrough();
export type ApiKeyCreated = z.infer<typeof ApiKeyCreated>;

export const Conversation = z
  .object({
    id: z.string(),
    title: z.string(),
    model: z.string(),
    provider: z.union([z.string(), z.null()]).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
export type Conversation = z.infer<typeof Conversation>;

export const CreateConversationRequest = z
  .object({
    title: z.string().max(200),
    model: z.string().max(200),
    provider: z.string().max(64),
  })
  .partial();
export type CreateConversationRequest = z.infer<
  typeof CreateConversationRequest
>;

export const Message = z
  .object({
    id: z.string(),
    conversationId: z.string(),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
    model: z.union([z.string(), z.null()]).optional(),
    provider: z.union([z.string(), z.null()]).optional(),
    promptTokens: z.union([z.number(), z.null()]).optional(),
    completionTokens: z.union([z.number(), z.null()]).optional(),
    reasoningTokens: z.union([z.number(), z.null()]).optional(),
    ttftMs: z.union([z.number(), z.null()]).optional(),
    totalMs: z.union([z.number(), z.null()]).optional(),
    stopped: z.boolean(),
    createdAt: z.string(),
  })
  .passthrough();
export type Message = z.infer<typeof Message>;

export const ConversationDetail = z
  .object({
    id: z.string(),
    title: z.string(),
    model: z.string(),
    provider: z.union([z.string(), z.null()]).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    messages: z.array(Message),
  })
  .passthrough();
export type ConversationDetail = z.infer<typeof ConversationDetail>;

export const UpdateConversationRequest = z.object({
  title: z.string().min(1).max(200),
});
export type UpdateConversationRequest = z.infer<
  typeof UpdateConversationRequest
>;

export const CreateMessageRequest = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  model: z.string().max(200).optional(),
  provider: z.string().max(64).optional(),
  promptTokens: z.number().int().gte(0).optional(),
  completionTokens: z.number().int().gte(0).optional(),
  reasoningTokens: z.number().int().gte(0).optional(),
  ttftMs: z.number().int().gte(0).optional(),
  totalMs: z.number().int().gte(0).optional(),
  stopped: z.boolean().optional(),
});
export type CreateMessageRequest = z.infer<typeof CreateMessageRequest>;

export const CreateCompletionRequest = z.object({
  model: z.string().max(200),
  content: z.string().optional(),
  regenerate: z.boolean().optional(),
  provider: z.string().max(64).optional(),
  stream: z.boolean().optional(),
});
export type CreateCompletionRequest = z.infer<typeof CreateCompletionRequest>;
