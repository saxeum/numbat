import type {
  CreateConversationRequest,
  CreateMessageRequest,
} from "@numbat/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createConversation,
  createMessage,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
} from "./api";

export function useConversations(enabled: boolean) {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
    enabled,
  });
}

export function useConversation(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["conversations", id],
    queryFn: () => getConversation(id as string),
    enabled: enabled && Boolean(id),
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConversationRequest) => createConversation(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renameConversation(id, title),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useCreateMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      conversationId,
      input,
    }: {
      conversationId: string;
      input: CreateMessageRequest;
    }) => createMessage(conversationId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({
        queryKey: ["conversations", variables.conversationId],
      });
    },
  });
}
