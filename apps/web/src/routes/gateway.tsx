import { useState, type FormEvent } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/features/auth/client";
import { SignIn } from "@/features/auth/components/sign-in";
import { UserMenu } from "@/features/auth/components/user-menu";
import {
  useChat,
  useCreateCredential,
  useCredentials,
  useDeleteCredential,
  useModels,
} from "@/features/gateway/hooks";

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm";

export function GatewayPage() {
  const { data: session, isPending } = useSession();
  const credentials = useCredentials(Boolean(session));
  const models = useModels(Boolean(session));
  const createCredential = useCreateCredential();
  const deleteCredential = useDeleteCredential();
  const chat = useChat();

  const [provider, setProvider] = useState<"gemini" | "groq">("groq");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");

  if (isPending) {
    return (
      <main className="grid min-h-svh place-items-center bg-background text-foreground">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  // Gate: no anonymous access to the GUI.
  if (!session) {
    return <SignIn />;
  }

  const catalog = models.data?.data ?? [];

  async function onAddKey(event: FormEvent) {
    event.preventDefault();
    if (!apiKey.trim()) return;
    await createCredential.mutateAsync({ provider, apiKey: apiKey.trim() });
    setApiKey("");
  }

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (!model || !prompt.trim()) return;
    await chat.mutateAsync({
      model,
      messages: [{ role: "user", content: prompt.trim() }],
    });
    setPrompt("");
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Gateway</h1>
        <div className="flex items-center gap-3">
          <Button variant="ghost" asChild>
            <Link to="/">Home</Link>
          </Button>
          <UserMenu />
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Provider credentials</h2>
        <p className="text-sm text-muted-foreground">
          Keys are verified against the provider, then encrypted at rest. They
          are never shown again.
        </p>
        <form onSubmit={onAddKey} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provider">Provider</Label>
            <select
              id="provider"
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as "gemini" | "groq")
              }
              className={selectClass}
            >
              <option value="groq">Groq</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="apiKey">API key</Label>
            <Input
              id="apiKey"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Paste the key"
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

        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
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
                <span className="font-medium">{credential.provider}</span>{" "}
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

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Chat</h2>
        <form onSubmit={onSend} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model">Model</Label>
            <select
              id="model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className={selectClass}
            >
              <option value="">Select a model…</option>
              {catalog.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.id} ({entry["x-provider"]})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prompt">Prompt</Label>
            <Input
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Say pong"
            />
          </div>
          <Button type="submit" disabled={chat.isPending || !model}>
            {chat.isPending ? "Thinking…" : "Send"}
          </Button>
        </form>

        {chat.isError ? (
          <p className="text-sm text-destructive">{chat.error.message}</p>
        ) : null}
        {chat.data ? (
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">
              served by {chat.data.provider} · {chat.data.model}
            </p>
            <p className="mt-1 whitespace-pre-wrap">
              {chat.data.content || "(empty)"}
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
