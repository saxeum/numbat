import { Health, Todo } from "@numbat/api";
import type { CreateTodoRequest, UpdateTodoRequest } from "@numbat/api";
import { z } from "zod";

const TodoList = z.array(Todo);
const jsonHeaders = { "content-type": "application/json" };

export async function getHealth() {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Failed to load API health: ${res.status}`);
  return Health.parse(await res.json());
}

export async function listTodos(): Promise<Todo[]> {
  const res = await fetch("/api/todos");
  if (!res.ok) throw new Error(`Failed to load todos: ${res.status}`);
  return TodoList.parse(await res.json());
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
