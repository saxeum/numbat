import type { CreateReportRequest } from "@numbat/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createReport,
  deleteReport,
  getReport,
  listReports,
  renameReport,
} from "./api";

function isActive(status: string | undefined): boolean {
  return status === "queued" || status === "running";
}

/** Report list; polls while any report is queued or running. */
export function useReports(enabled: boolean) {
  return useQuery({
    queryKey: ["reports"],
    queryFn: listReports,
    enabled,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((report) => isActive(report.status))
        ? 2000
        : false,
  });
}

/** One report; polls while it is queued or running. */
export function useReport(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["reports", id],
    queryFn: () => getReport(id as string),
    enabled: enabled && Boolean(id),
    refetchInterval: (query) =>
      isActive(query.state.data?.status) ? 1500 : false,
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReportRequest) => createReport(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });
}

export function useRenameReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string | null }) =>
      renameReport(id, label),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteReport(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });
}
