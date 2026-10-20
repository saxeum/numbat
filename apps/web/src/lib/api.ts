import { HealthResponse } from "@numbat/shared";

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");

  if (!res.ok) {
    throw new Error(`Failed to load API health: ${res.status}`);
  }

  return HealthResponse.parse(await res.json());
}
