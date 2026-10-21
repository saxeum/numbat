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
    provider: z.enum(["gemini", "groq", "nvidia"]),
    label: z.string(),
    fingerprint: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
export type Credential = z.infer<typeof Credential>;

export const CreateCredentialRequest = z.object({
  provider: z.enum(["gemini", "groq", "nvidia"]),
  label: z.string().max(64).optional(),
  apiKey: z.string().min(1),
});
export type CreateCredentialRequest = z.infer<typeof CreateCredentialRequest>;

export const Model = z
  .object({
    id: z.string(),
    object: z.literal("model"),
    owned_by: z.string(),
    "x-provider": z.enum(["gemini", "groq", "nvidia"]),
    "x-context": z.number().int().optional(),
    "x-free": z.boolean(),
  })
  .passthrough();
export type Model = z.infer<typeof Model>;

export const ModelList = z
  .object({ object: z.literal("list"), data: z.array(Model) })
  .passthrough();
export type ModelList = z.infer<typeof ModelList>;

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
