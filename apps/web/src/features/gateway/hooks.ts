import type { CreateApiKeyRequest, CreateCredentialRequest } from "@numbat/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  chat,
  createApiKey,
  createCredential,
  deleteCredential,
  listApiKeys,
  listCredentials,
  listModels,
  revokeApiKey,
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

export function useApiKeys(enabled: boolean) {
  return useQuery({ queryKey: ["api-keys"], queryFn: listApiKeys, enabled });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApiKeyRequest) => createApiKey(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

export function useChat() {
  return useMutation({ mutationFn: chat });
}
