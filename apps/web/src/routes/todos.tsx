import { useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { TodoEmpty } from "@/features/todos/components/todo-empty";
import {
  TodoFilters,
  type TodoFilter,
} from "@/features/todos/components/todo-filters";
import { TodoForm } from "@/features/todos/components/todo-form";
import { TodoList } from "@/features/todos/components/todo-list";
import { useClearCompleted, useTodos } from "@/features/todos/hooks";

export function TodosPage() {
  const [filter, setFilter] = useState<TodoFilter>("all");
  const todos = useTodos();
  const clearCompleted = useClearCompleted();

  const items = todos.data ?? [];
  const active = items.filter((todo) => !todo.completed).length;
  const completed = items.length - active;
  const visible = items.filter((todo) =>
    filter === "active"
      ? !todo.completed
      : filter === "completed"
        ? todo.completed
        : true,
  );

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col gap-6 px-6 py-16">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Todos</h1>
        <Button variant="outline" asChild>
          <Link to="/">Home</Link>
        </Button>
      </header>

      <TodoForm />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <TodoFilters
          filter={filter}
          onChange={setFilter}
          active={active}
          completed={completed}
        />
        {completed > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearCompleted.mutate()}
            disabled={clearCompleted.isPending}
          >
            Clear completed
          </Button>
        ) : null}
      </div>

      {todos.isPending ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : null}
      {todos.isError ? (
        <p className="text-destructive">Could not load todos.</p>
      ) : null}
      {todos.isSuccess && visible.length === 0 ? (
        <TodoEmpty
          message={
            filter === "all" ? "Nothing here yet." : `No ${filter} todos.`
          }
        />
      ) : null}
      {visible.length > 0 ? <TodoList todos={visible} /> : null}
    </main>
  );
}
