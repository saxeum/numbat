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

export const Todo = z
  .object({
    id: z.string(),
    title: z.string(),
    completed: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
export type Todo = z.infer<typeof Todo>;

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

export const CreateTodoRequest = z.object({
  title: z.string().min(1).max(200),
});
export type CreateTodoRequest = z.infer<typeof CreateTodoRequest>;

export const UpdateTodoRequest = z
  .object({ title: z.string().min(1).max(200), completed: z.boolean() })
  .partial();
export type UpdateTodoRequest = z.infer<typeof UpdateTodoRequest>;
