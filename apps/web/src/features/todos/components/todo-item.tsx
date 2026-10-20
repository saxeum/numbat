import type { Todo } from "@numbat/api";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

import { useDeleteTodo, useToggleTodo, useUpdateTitle } from "../hooks";

export function TodoItem({ todo }: { todo: Todo }) {
  const toggle = useToggleTodo();
  const updateTitle = useUpdateTitle();
  const remove = useDeleteTodo();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);

  function save() {
    const value = draft.trim();
    if (value && value !== todo.title) {
      updateTitle.mutate({ id: todo.id, title: value });
    }
    setEditing(false);
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
      <Checkbox
        checked={todo.completed}
        onCheckedChange={(checked) =>
          toggle.mutate({ id: todo.id, completed: checked === true })
        }
        aria-label={`Toggle ${todo.title}`}
      />

      {editing ? (
        <Input
          autoFocus
          value={draft}
          aria-label={`Edit ${todo.title}`}
          className="h-8"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
            if (event.key === "Escape") {
              setDraft(todo.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          aria-label={`Edit ${todo.title}`}
          className={
            todo.completed
              ? "flex-1 text-left text-muted-foreground line-through"
              : "flex-1 text-left"
          }
          onClick={() => {
            setDraft(todo.title);
            setEditing(true);
          }}
        >
          {todo.title}
        </button>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => remove.mutate(todo.id)}
        aria-label={`Delete ${todo.title}`}
      >
        Delete
      </Button>
    </li>
  );
}
