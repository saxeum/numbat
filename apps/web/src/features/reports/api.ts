import {
  ReportEnvelope,
  ReportList,
  type CreateReportRequest,
  type Report,
  type UpdateReportRequest,
} from "@numbat/api";

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? `${fallback} (${res.status})`;
}

export async function listReports(): Promise<Report[]> {
  const res = await fetch("/api/reports");
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to load reports"));
  }
  return ReportList.parse(await res.json()).reports;
}

export async function getReport(id: string): Promise<Report> {
  const res = await fetch(`/api/reports/${id}`);
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to load report"));
  }
  return ReportEnvelope.parse(await res.json()).report;
}

export async function createReport(
  input: CreateReportRequest,
): Promise<Report> {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to start report"));
  }
  return ReportEnvelope.parse(await res.json()).report;
}

export async function renameReport(
  id: string,
  label: string | null,
): Promise<Report> {
  const res = await fetch(`/api/reports/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label } satisfies UpdateReportRequest),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to rename report"));
  }
  return ReportEnvelope.parse(await res.json()).report;
}

export async function deleteReport(id: string): Promise<void> {
  const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to delete report"));
  }
}
