import { and, desc, eq } from "drizzle-orm";

import type { Database } from "../client";
import { todos } from "../schema";

export type Todo = typeof todos.$inferSelect;

export function listTodos(db: Database, ownerId: string): Promise<Todo[]> {
  return db
    .select()
    .from(todos)
    .where(eq(todos.ownerId, ownerId))
    .orderBy(desc(todos.createdAt));
}

export async function getTodo(
  db: Database,
  ownerId: string,
  id: string,
): Promise<Todo | undefined> {
  const [row] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, id), eq(todos.ownerId, ownerId)));
  return row;
}

export async function createTodo(
  db: Database,
  ownerId: string,
  input: { title: string },
): Promise<Todo> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(todos)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      title: input.title,
      completed: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function updateTodo(
  db: Database,
  ownerId: string,
  id: string,
  patch: { title?: string; completed?: boolean },
): Promise<Todo | undefined> {
  const [row] = await db
    .update(todos)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(and(eq(todos.id, id), eq(todos.ownerId, ownerId)))
    .returning();
  return row;
}

export async function deleteTodo(
  db: Database,
  ownerId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(todos)
    .where(and(eq(todos.id, id), eq(todos.ownerId, ownerId)))
    .returning();
  return rows.length > 0;
}
