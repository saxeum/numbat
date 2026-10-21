import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/features/auth/client";
import { SignIn } from "@/features/auth/components/sign-in";
import {
  useApiKeys,
  useChat,
  useCreateApiKey,
  useCreateCredential,
  useCredentials,
  useDeleteCredential,
  useModels,
  useRevokeApiKey,
} from "@/features/gateway/hooks";

const selectClass =
  "h-9 rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const sectionClass =
  "flex flex-col gap-4 rounded-2xl border border-border bg-card p-6";

function curlSnippet(token: string, model: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return [
    `curl ${origin}/api/chat/completions \\`,
    `  -H "authorization: Bearer ${token}" \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d '{"model":"${model}","messages":[{"role":"user","content":"pong"}]}'`,
  ].join("\n");
}

export function GatewayPage() {
  const { data: session, isPending } = useSession();
  const credentials = useCredentials(Boolean(session));
  const models = useModels(Boolean(session));
  const apiKeys = useApiKeys(Boolean(session));
  const createCredential = useCreateCredential();
  const deleteCredential = useDeleteCredential();
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const chat = useChat();

  const [provider, setProvider] = useState<
    "gemini" | "groq" | "nvidia" | "openrouter"
  >("groq");
  const [apiKey, setApiKey] = useState("");
  const [keyName, setKeyName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");

  if (isPending) {
    return (
      <div className="flex min-h-svh flex-col">
        <SiteHeader />
        <main className="grid flex-1 place-items-center">
          <p className="text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  // Gate: no anonymous access to the GUI.
  if (!session) {
    return <SignIn />;
  }

  const catalog = models.data?.data ?? [];
  const effectiveModel = model || catalog[0]?.id || "openai/gpt-oss-20b";

  async function onAddKey(event: FormEvent) {
    event.preventDefault();
    if (!apiKey.trim()) return;
    await createCredential.mutateAsync({ provider, apiKey: apiKey.trim() });
    setApiKey("");
  }

  async function onCreateKey(event: FormEvent) {
    event.preventDefault();
    if (!keyName.trim()) return;
    const created = await createApiKey.mutateAsync({ name: keyName.trim() });
    setNewToken(created.token);
    setKeyName("");
  }

  async function copyToken() {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (!effectiveModel || !prompt.trim()) return;
    await chat.mutateAsync({
      model: effectiveModel,
      messages: [{ role: "user", content: prompt.trim() }],
    });
    setPrompt("");
  }

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-14">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Gateway</h1>
          <p className="text-muted-foreground">
            Connect a provider, mint a token, and send your first request.
          </p>
        </header>

        <section className={sectionClass}>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Provider credentials</h2>
            <p className="text-sm text-muted-foreground">
              Keys are verified against the provider, then encrypted at rest.
              They are never shown again.
            </p>
          </div>
          <form onSubmit={onAddKey} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="provider">Provider</Label>
              <select
                id="provider"
                value={provider}
                onChange={(event) =>
                  setProvider(
                    event.target.value as
                      "gemini" | "groq" | "nvidia" | "openrouter",
                  )
                }
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

        <section className={sectionClass}>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">API tokens</h2>
            <p className="text-sm text-muted-foreground">
              For programmatic access. The token is shown once — copy it now.
              Use it as{" "}
              <code className="text-foreground">Authorization: Bearer …</code>.
            </p>
          </div>
          <form
            onSubmit={onCreateKey}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex min-w-52 flex-1 flex-col gap-1.5">
              <Label htmlFor="keyName">Name</Label>
              <Input
                id="keyName"
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                placeholder="e.g. laptop-cli"
              />
            </div>
            <Button type="submit" disabled={createApiKey.isPending}>
              {createApiKey.isPending ? "Creating…" : "Create token"}
            </Button>
          </form>
          {createApiKey.isError ? (
            <p className="text-sm text-destructive">
              {createApiKey.error.message}
            </p>
          ) : null}

          {newToken ? (
            <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  New token (copy it now)
                </span>
                <Button variant="outline" size="sm" onClick={copyToken}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <code className="block overflow-x-auto rounded-lg border border-border bg-background p-3 text-xs break-all">
                {newToken}
              </code>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Try it (curl)</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      curlSnippet(newToken, effectiveModel),
                    );
                  }}
                >
                  Copy curl
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 text-xs">
                {curlSnippet(newToken, effectiveModel)}
              </pre>
            </div>
          ) : null}

          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
            {apiKeys.isPending ? (
              <li className="p-3 text-sm text-muted-foreground">Loading…</li>
            ) : null}
            {apiKeys.data?.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">
                No tokens yet.
              </li>
            ) : null}
            {apiKeys.data?.map((key) => (
              <li
                key={key.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <span className="text-sm">
                  <span className="font-medium">{key.name}</span>{" "}
                  <span className="font-mono text-muted-foreground">
                    {key.prefix}…
                  </span>{" "}
                  {key.revokedAt ? (
                    <span className="text-destructive">revoked</span>
                  ) : null}
                </span>
                {key.revokedAt ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revokeApiKey.mutate(key.id)}
                    disabled={revokeApiKey.isPending}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className={sectionClass}>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Chat</h2>
            <p className="text-sm text-muted-foreground">
              Try a request against your connected provider.
            </p>
          </div>
          <form onSubmit={onSend} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="model">Model</Label>
              <select
                id="model"
                value={effectiveModel}
                onChange={(event) => setModel(event.target.value)}
                className={selectClass}
              >
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
            <Button
              type="submit"
              className="self-start"
              disabled={chat.isPending || !effectiveModel}
            >
              {chat.isPending ? "Thinking…" : "Send"}
              {chat.isPending ? null : <ArrowRight />}
            </Button>
          </form>

          {chat.isError ? (
            <p className="text-sm text-destructive">{chat.error.message}</p>
          ) : null}
          {chat.data ? (
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="text-xs text-muted-foreground">
                served by {chat.data.provider} · {chat.data.model}
              </p>
              <p className="mt-2 whitespace-pre-wrap">
                {chat.data.content || "(empty)"}
              </p>
            </div>
          ) : null}
        </section>

        <p className="text-sm text-muted-foreground">
          Prefer the raw API?{" "}
          <Link
            to="/api/docs"
            className="text-primary underline-offset-4 hover:underline"
          >
            Browse the OpenAPI docs
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
