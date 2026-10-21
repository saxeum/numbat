import type { CreateCredentialRequest } from "@numbat/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  chat,
  createCredential,
  deleteCredential,
  listCredentials,
  listModels,
} from "./api";

export function useCredentials(enabled: boolean) {
  return useQuery({
    queryKey: ["credentials"],
    queryFn: listCredentials,
    enabled,
  });
}

export function useModels(enabled: boolean) {
  return useQuery({ queryKey: ["models"], queryFn: listModels, enabled });
}

export function useCreateCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCredentialRequest) => createCredential(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["credentials"] }),
  });
}

export function useDeleteCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCredential(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["credentials"] }),
  });
}

export function useChat() {
  return useMutation({ mutationFn: chat });
}
