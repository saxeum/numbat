import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTodo, deleteTodo, listTodos, updateTodo } from "@/lib/api";

export function TodosPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");

  const todos = useQuery({ queryKey: ["todos"], queryFn: listTodos });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["todos"] });

  const create = useMutation({ mutationFn: createTodo, onSuccess: invalidate });
  const toggle = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      updateTodo(id, { completed }),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: deleteTodo, onSuccess: invalidate });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    create.mutate({ title: value }, { onSuccess: () => setTitle("") });
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col gap-6 px-6 py-16">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Todos</h1>
        <Button variant="outline" asChild>
          <Link to="/">Home</Link>
        </Button>
      </header>

      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs doing?"
          aria-label="New todo"
        />
        <Button type="submit" disabled={create.isPending}>
          Add
        </Button>
      </form>

      {todos.isPending ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : null}
      {todos.isError ? (
        <p className="text-destructive">Could not load todos.</p>
      ) : null}
      {todos.data?.length === 0 ? (
        <p className="text-muted-foreground">Nothing here yet.</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {todos.data?.map((todo) => (
          <li
            key={todo.id}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
          >
            <input
              type="checkbox"
              className="size-4"
              checked={todo.completed}
              onChange={() =>
                toggle.mutate({ id: todo.id, completed: !todo.completed })
              }
              aria-label={`Toggle ${todo.title}`}
            />
            <span
              className={
                todo.completed
                  ? "flex-1 text-muted-foreground line-through"
                  : "flex-1"
              }
            >
              {todo.title}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => remove.mutate(todo.id)}
              aria-label={`Delete ${todo.title}`}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
    </main>
  );
}
