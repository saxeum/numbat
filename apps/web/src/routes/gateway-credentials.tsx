import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/features/auth/client";
import {
  useCreateCredential,
  useCredentials,
  useDeleteCredential,
} from "@/features/gateway/hooks";
import { sectionClass, selectClass } from "@/features/gateway/ui";

type Provider = "gemini" | "groq" | "nvidia" | "openrouter";

export function GatewayCredentialsPage() {
  const { data: session } = useSession();
  const credentials = useCredentials(Boolean(session));
  const createCredential = useCreateCredential();
  const deleteCredential = useDeleteCredential();
  const [provider, setProvider] = useState<Provider>("groq");
  const [apiKey, setApiKey] = useState("");

  async function onAddKey(event: FormEvent) {
    event.preventDefault();
    if (!apiKey.trim()) return;
    await createCredential.mutateAsync({ provider, apiKey: apiKey.trim() });
    setApiKey("");
  }

  return (
    <section className={sectionClass}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Provider credentials</h2>
        <p className="text-sm text-muted-foreground">
          Keys are verified against the provider, then encrypted at rest. They
          are never shown again.
        </p>
      </div>

      <form onSubmit={onAddKey} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="provider">Provider</Label>
          <select
            id="provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as Provider)}
            className={selectClass}
          >
            <option value="groq">Groq</option>
            <option value="gemini">Google Gemini</option>
            <option value="nvidia">NVIDIA</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>
        <div className="flex min-w-52 flex-1 flex-col gap-1.5">
          <Label htmlFor="apiKey">API key</Label>
          <Input
            id="apiKey"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Paste the key (value only)"
          />
        </div>
        <Button type="submit" disabled={createCredential.isPending}>
          {createCredential.isPending ? "Saving…" : "Add key"}
        </Button>
      </form>

      {createCredential.isError ? (
        <p className="text-sm text-destructive">
          {createCredential.error.message}
        </p>
      ) : null}

      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
        {credentials.isPending ? (
          <li className="p-3 text-sm text-muted-foreground">Loading…</li>
        ) : null}
        {credentials.data?.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">
            No keys connected yet.
          </li>
        ) : null}
        {credentials.data?.map((credential) => (
          <li
            key={credential.id}
            className="flex items-center justify-between gap-3 p-3"
          >
            <span className="text-sm">
              <span className="font-medium capitalize">
                {credential.provider}
              </span>{" "}
              <span className="text-muted-foreground">
                {credential.label || "default"}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteCredential.mutate(credential.id)}
              disabled={deleteCredential.isPending}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
