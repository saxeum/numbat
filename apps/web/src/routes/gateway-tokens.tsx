import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/features/auth/client";
import {
  useApiKeys,
  useCreateApiKey,
  useModels,
  useRevokeApiKey,
} from "@/features/gateway/hooks";
import { sectionClass, selectClass } from "@/features/gateway/ui";

function curlSnippet(token: string, model: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return [
    `curl ${origin}/api/chat/completions \\`,
    `  -H "authorization: Bearer ${token}" \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d '{"model":"${model}","messages":[{"role":"user","content":"pong"}]}'`,
  ].join("\n");
}

export function GatewayTokensPage() {
  const { data: session } = useSession();
  const apiKeys = useApiKeys(Boolean(session));
  const models = useModels(Boolean(session));
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const [keyName, setKeyName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exampleModel, setExampleModel] = useState("");

  const catalog = models.data?.data ?? [];
  const effectiveModel = exampleModel || catalog[0]?.id || "openai/gpt-oss-20b";

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

  return (
    <section className={sectionClass}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">API tokens</h2>
        <p className="text-sm text-muted-foreground">
          For programmatic access. The token is shown once — copy it now. Use it
          as <code className="text-foreground">Authorization: Bearer …</code>.
        </p>
      </div>

      <form onSubmit={onCreateKey} className="flex flex-wrap items-end gap-3">
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
        <p className="text-sm text-destructive">{createApiKey.error.message}</p>
      ) : null}

      {newToken ? (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">New token (copy it now)</span>
            <Button variant="outline" size="sm" onClick={copyToken}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <code className="block overflow-x-auto rounded-lg border border-border bg-background p-3 text-xs break-all">
            {newToken}
          </code>

          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exampleModel">Example model</Label>
              <select
                id="exampleModel"
                value={effectiveModel}
                onChange={(event) => setExampleModel(event.target.value)}
                className={selectClass}
              >
                {catalog.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.id} ({entry["x-provider"]})
                  </option>
                ))}
              </select>
            </div>
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
          <li className="p-3 text-sm text-muted-foreground">No tokens yet.</li>
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
  );
}
