import { Credential, CreateCredentialRequest, ModelList } from "@numbat/api";
import { z } from "zod";

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? `${fallback} (${res.status})`;
}

export async function listCredentials() {
  const res = await fetch("/api/credentials");
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to load credentials"));
  }
  return z.array(Credential).parse(await res.json());
}

export async function createCredential(input: CreateCredentialRequest) {
  const res = await fetch("/api/credentials", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to save credential"));
  }
  return Credential.parse(await res.json());
}

export async function deleteCredential(id: string) {
  const res = await fetch(`/api/credentials/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to delete credential"));
  }
}

export async function listModels() {
  const res = await fetch("/api/models");
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Failed to load models"));
  }
  return ModelList.parse(await res.json());
}

export interface ChatOutcome {
  content: string;
  provider: string | null;
  model: string;
}

export async function chat(input: {
  model: string;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
}): Promise<ChatOutcome> {
  const res = await fetch("/api/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Chat failed"));
  }
  const json = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
  };
  return {
    content: json.choices?.[0]?.message?.content ?? "",
    provider: res.headers.get("x-byokfree-provider"),
    model: json.model ?? input.model,
  };
}
