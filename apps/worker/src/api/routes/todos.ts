import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import {
  CreateTodoRequest,
  Todo,
  TodoIdParam,
  TodoListResponse,
  UpdateTodoRequest,
} from "@numbat/shared";

import { createDb } from "../../db/client";
import {
  createTodo,
  deleteTodo,
  listTodos,
  updateTodo,
} from "../../db/queries/todos";
import { AppError } from "../middleware/error";
import { defaultHook } from "../openapi";
import type { AppEnv } from "../types";

export const todos = new OpenAPIHono<AppEnv>({ defaultHook });

const listRoute = createRoute({
  method: "get",
  path: "/",
  summary: "List todos",
  responses: {
    200: {
      content: { "application/json": { schema: TodoListResponse } },
      description: "All todos",
    },
  },
});

todos.openapi(listRoute, async (c) => {
  const rows = await listTodos(createDb(c.env.DB));
  return c.json(rows, 200);
});

const createTodoRoute = createRoute({
  method: "post",
  path: "/",
  summary: "Create a todo",
  request: {
    body: { content: { "application/json": { schema: CreateTodoRequest } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: Todo } },
      description: "Created todo",
    },
    400: { description: "Invalid input" },
  },
});

todos.openapi(createTodoRoute, async (c) => {
  const { title } = c.req.valid("json");
  const todo = await createTodo(createDb(c.env.DB), { title });
  return c.json(todo, 201);
});

const updateTodoRoute = createRoute({
  method: "patch",
  path: "/{id}",
  summary: "Update a todo",
  request: {
    params: TodoIdParam,
    body: { content: { "application/json": { schema: UpdateTodoRequest } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: Todo } },
      description: "Updated todo",
    },
    400: { description: "Invalid input" },
    404: { description: "Not found" },
  },
});

todos.openapi(updateTodoRoute, async (c) => {
  const { id } = c.req.valid("param");
  const patch = c.req.valid("json");

  if (patch.title === undefined && patch.completed === undefined) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Provide at least one of 'title' or 'completed'",
    );
  }

  const todo = await updateTodo(createDb(c.env.DB), id, patch);
  if (!todo) {
    throw new AppError(404, "TODO_NOT_FOUND", `Todo ${id} not found`);
  }
  return c.json(todo, 200);
});

const deleteTodoRoute = createRoute({
  method: "delete",
  path: "/{id}",
  summary: "Delete a todo",
  request: { params: TodoIdParam },
  responses: {
    204: { description: "Deleted" },
    404: { description: "Not found" },
  },
});

todos.openapi(deleteTodoRoute, async (c) => {
  const { id } = c.req.valid("param");
  const deleted = await deleteTodo(createDb(c.env.DB), id);
  if (!deleted) {
    throw new AppError(404, "TODO_NOT_FOUND", `Todo ${id} not found`);
  }
  return c.body(null, 204);
});
