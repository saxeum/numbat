import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useCreateTodo } from "../hooks";

export function TodoForm() {
  const [title, setTitle] = useState("");
  const create = useCreateTodo();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    create.mutate({ title: value }, { onSuccess: () => setTitle("") });
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input
        aria-label="New todo"
        placeholder="What needs doing?"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Button type="submit" disabled={create.isPending}>
        Add
      </Button>
    </form>
  );
}
