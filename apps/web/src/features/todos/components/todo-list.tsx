import type { Todo } from "@numbat/api";

import { TodoItem } from "./todo-item";

export function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
