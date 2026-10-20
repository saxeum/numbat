import { HealthResponse, Todo, TodoListResponse } from "@numbat/shared";
import type { CreateTodoRequest, UpdateTodoRequest } from "@numbat/shared";

const jsonHeaders = { "content-type": "application/json" };

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Failed to load API health: ${res.status}`);
  return HealthResponse.parse(await res.json());
}

export async function listTodos(): Promise<Todo[]> {
  const res = await fetch("/api/todos");
  if (!res.ok) throw new Error(`Failed to load todos: ${res.status}`);
  return TodoListResponse.parse(await res.json());
}

export async function createTodo(input: CreateTodoRequest): Promise<Todo> {
  const res = await fetch("/api/todos", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to create todo: ${res.status}`);
  return Todo.parse(await res.json());
}

export async function updateTodo(
  id: string,
  patch: UpdateTodoRequest,
): Promise<Todo> {
  const res = await fetch(`/api/todos/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update todo: ${res.status}`);
  return Todo.parse(await res.json());
}

export async function deleteTodo(id: string): Promise<void> {
  const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete todo: ${res.status}`);
}
