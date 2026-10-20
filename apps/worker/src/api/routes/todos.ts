import { CreateTodoRequest, UpdateTodoRequest } from "@numbat/api";
import { Hono } from "hono";
import { z } from "zod";

import { createDb } from "../../db/client";
import {
  createTodo,
  deleteTodo,
  listTodos,
  updateTodo,
} from "../../db/queries/todos";
import { requireSession } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { validate } from "../openapi";
import type { AppEnv } from "../types";

export const todos = new Hono<AppEnv>();

// Every todo route is authenticated and owner-scoped.
todos.use("*", requireSession);

// Path-param schema (the generator emits component *body* schemas only).
const TodoIdParam = z.object({ id: z.string().min(1) });

todos.get("/", async (c) => {
  const rows = await listTodos(createDb(c.env.DB), c.get("user").id);
  return c.json(rows, 200);
});

todos.post("/", validate("json", CreateTodoRequest), async (c) => {
  const { title } = c.req.valid("json");
  const todo = await createTodo(createDb(c.env.DB), c.get("user").id, {
    title,
  });
  return c.json(todo, 201);
});

todos.patch(
  "/:id",
  validate("param", TodoIdParam),
  validate("json", UpdateTodoRequest),
  async (c) => {
    const { id } = c.req.valid("param");
    const patch = c.req.valid("json");

    if (patch.title === undefined && patch.completed === undefined) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Provide at least one of 'title' or 'completed'",
      );
    }

    const todo = await updateTodo(
      createDb(c.env.DB),
      c.get("user").id,
      id,
      patch,
    );
    if (!todo) {
      throw new AppError(404, "TODO_NOT_FOUND", `Todo ${id} not found`);
    }
    return c.json(todo, 200);
  },
);

todos.delete("/:id", validate("param", TodoIdParam), async (c) => {
  const { id } = c.req.valid("param");
  const deleted = await deleteTodo(createDb(c.env.DB), c.get("user").id, id);
  if (!deleted) {
    throw new AppError(404, "TODO_NOT_FOUND", `Todo ${id} not found`);
  }
  return c.body(null, 204);
});
