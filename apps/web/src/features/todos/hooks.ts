import type { Todo } from "@numbat/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import * as api from "./api";

export const todosKey = ["todos"] as const;

export function useTodos() {
  return useQuery({ queryKey: todosKey, queryFn: api.listTodos });
}

export function useCreateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createTodo,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: todosKey }),
    onError: () => toast.error("Could not add todo"),
  });
}

export function useUpdateTitle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.updateTodo(id, { title }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: todosKey }),
    onError: () => toast.error("Could not save todo"),
  });
}

export function useToggleTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      api.updateTodo(id, { completed }),
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: todosKey });
      const previous = queryClient.getQueryData<Todo[]>(todosKey);
      if (previous) {
        queryClient.setQueryData<Todo[]>(
          todosKey,
          previous.map((todo) =>
            todo.id === id ? { ...todo, completed } : todo,
          ),
        );
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(todosKey, context.previous);
      }
      toast.error("Could not update todo");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: todosKey }),
  });
}

export function useDeleteTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTodo(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: todosKey });
      const previous = queryClient.getQueryData<Todo[]>(todosKey);
      const removed = previous?.find((todo) => todo.id === id);
      if (previous) {
        queryClient.setQueryData<Todo[]>(
          todosKey,
          previous.filter((todo) => todo.id !== id),
        );
      }
      return { previous, removed };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(todosKey, context.previous);
      }
      toast.error("Could not delete todo");
    },
    onSuccess: (_data, _id, context) => {
      const removed = context?.removed;
      toast("Todo deleted", {
        action: removed
          ? {
              label: "Undo",
              onClick: () => {
                void api.createTodo({ title: removed.title }).then(() => {
                  void queryClient.invalidateQueries({ queryKey: todosKey });
                });
              },
            }
          : undefined,
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: todosKey }),
  });
}

export function useClearCompleted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const todos = queryClient.getQueryData<Todo[]>(todosKey) ?? [];
      await Promise.all(
        todos
          .filter((todo) => todo.completed)
          .map((todo) => api.deleteTodo(todo.id)),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: todosKey }),
    onError: () => toast.error("Could not clear completed todos"),
  });
}
