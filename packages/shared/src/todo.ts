import { z } from "zod";

export const Todo = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Todo = z.infer<typeof Todo>;

export const TodoListResponse = z.array(Todo);

export const CreateTodoRequest = z.object({
  title: z.string().min(1).max(200),
});
export type CreateTodoRequest = z.infer<typeof CreateTodoRequest>;

export const UpdateTodoRequest = z.object({
  title: z.string().min(1).max(200).optional(),
  completed: z.boolean().optional(),
});
export type UpdateTodoRequest = z.infer<typeof UpdateTodoRequest>;

export const TodoIdParam = z.object({
  id: z.string().min(1),
});
