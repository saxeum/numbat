import { Health } from "@numbat/api";

export async function getHealth() {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Failed to load API health: ${res.status}`);
  return Health.parse(await res.json());
}
