import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ArrowRight, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/features/auth/client";
import { useChat, useCredentials, useModels } from "@/features/gateway/hooks";
import { sectionClass, selectClass } from "@/features/gateway/ui";

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  nvidia: "NVIDIA",
  openrouter: "OpenRouter",
};

export function GatewayChatPage() {
  const { data: session } = useSession();
  const models = useModels(Boolean(session));
  const credentials = useCredentials(Boolean(session));
  const chat = useChat();
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [stream, setStream] = useState(true);
  const [live, setLive] = useState("");
  // null = "all connected providers"; set once the user customises the picker.
  const [selectedProviders, setSelectedProviders] = useState<string[] | null>(
    null,
  );
  const [liveMetrics, setLiveMetrics] = useState<{
    ttftMs: number | null;
    tokens: number;
  }>({ ttftMs: null, tokens: 0 });
  const startedAt = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const loading = credentials.isPending || models.isPending;

  // Only providers the user has connected (keys are verified at connect).
  const connectedProviders = Array.from(
    new Set((credentials.data ?? []).map((credential) => credential.provider)),
  );
  const activeProviders = selectedProviders ?? connectedProviders;
  const activeSet = new Set(activeProviders);

  const catalog = (models.data?.data ?? []).filter(
    (entry) =>
      connectedProviders.includes(entry["x-provider"]) &&
      activeSet.has(entry["x-provider"]),
  );
  const effectiveModel = catalog.some((entry) => entry.id === model)
    ? model
    : (catalog[0]?.id ?? "");

  function toggleProvider(provider: string) {
    const next = new Set(activeProviders);
    if (next.has(provider)) next.delete(provider);
    else next.add(provider);
    setSelectedProviders(connectedProviders.filter((p) => next.has(p)));
  }

  const providerSummary =
    activeProviders.length === connectedProviders.length
      ? "All connected providers"
      : activeProviders.length === 0
        ? "No providers selected"
        : activeProviders.map((p) => PROVIDER_LABELS[p] ?? p).join(", ");

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (!effectiveModel) return;
    // Empty prompt sends "hello" (handy for a quick smoke test).
    const text = prompt.trim() || "hello";
    setLive("");
    setCancelled(false);
    setLiveMetrics({ ttftMs: null, tokens: 0 });
    startedAt.current = performance.now();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await chat.mutateAsync({
        model: effectiveModel,
        messages: [{ role: "user", content: text }],
        stream,
        signal: controller.signal,
        onToken: stream
          ? (delta) => {
              setLive((prev) => prev + delta);
              setLiveMetrics((m) => ({
                ttftMs: m.ttftMs ?? performance.now() - startedAt.current,
                tokens: m.tokens + 1,
              }));
            }
          : undefined,
      });
      setPrompt("");
    } catch {
      // Aborted or failed; the UI reflects the state.
    } finally {
      abortRef.current = null;
    }
  }

  function onCancel() {
    setCancelled(true);
    abortRef.current?.abort();
  }

  const streaming = chat.isPending && stream && liveMetrics.tokens > 0;
  const liveTps =
    streaming && liveMetrics.ttftMs !== null
      ? liveMetrics.tokens /
        Math.max(
          (performance.now() - startedAt.current - liveMetrics.ttftMs) / 1000,
          0.001,
        )
      : null;

  const metrics = chat.data
    ? [
        `TTFT ${chat.data.ttftMs === null ? "—" : `${Math.round(chat.data.ttftMs)} ms`}`,
        `TPS ${chat.data.tps === null ? "—" : chat.data.tps.toFixed(1)}`,
        chat.data.tokens === null ? "— tok" : `${chat.data.tokens} tok`,
        `${(chat.data.totalMs / 1000).toFixed(2)} s`,
      ].join(" · ")
    : streaming
      ? `TTFT ${Math.round(liveMetrics.ttftMs ?? 0)} ms · TPS ${liveTps === null ? "—" : liveTps.toFixed(1)} · ${liveMetrics.tokens} tok (live)`
      : null;

  return (
    <section className={sectionClass}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Chat</h2>
        <p className="text-sm text-muted-foreground">
          Try a request against a provider you've connected.
        </p>
      </div>

      {!loading && connectedProviders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No provider is connected yet.{" "}
          <Link
            to="/gateway/credentials"
            className="text-primary underline-offset-4 hover:underline"
          >
            Connect a provider key
          </Link>{" "}
          to see its models here.
        </div>
      ) : (
        <form onSubmit={onSend} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Providers</Label>
            <details className="relative">
              <summary
                className={`${selectClass} flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden`}
              >
                <span className="truncate">{providerSummary}</span>
                <ChevronDown className="size-4 shrink-0 opacity-60" />
              </summary>
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card p-2 shadow-lg">
                {connectedProviders.map((provider) => (
                  <label
                    key={provider}
                    htmlFor={`provider-${provider}`}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
                  >
                    <Checkbox
                      id={`provider-${provider}`}
                      checked={activeSet.has(provider)}
                      onCheckedChange={() => toggleProvider(provider)}
                    />
                    <span>{PROVIDER_LABELS[provider] ?? provider}</span>
                  </label>
                ))}
                <div className="mt-1 flex items-center justify-between border-t border-border pt-1 text-xs">
                  <button
                    type="button"
                    className="px-2 py-1 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setSelectedProviders([...connectedProviders])
                    }
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedProviders([])}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </details>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model">Model</Label>
            <select
              id="model"
              value={effectiveModel}
              onChange={(event) => setModel(event.target.value)}
              className={selectClass}
              disabled={loading || catalog.length === 0}
            >
              {loading ? <option>Loading models…</option> : null}
              {!loading && catalog.length === 0 ? (
                <option>No models for the selected providers</option>
              ) : null}
              {catalog.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.id} ({entry["x-provider"]})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="stream"
              checked={stream}
              onCheckedChange={(value) => setStream(value === true)}
            />
            <Label htmlFor="stream" className="text-sm font-normal">
              Stream response
            </Label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prompt">Prompt</Label>
            <Input
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={'Say pong — empty sends "hello"'}
            />
          </div>

          {chat.isPending ? (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={onCancel}
            >
              Cancel
            </Button>
          ) : (
            <Button
              type="submit"
              className="self-start"
              disabled={!effectiveModel}
            >
              Send
              <ArrowRight />
            </Button>
          )}
        </form>
      )}

      {chat.isError && !cancelled ? (
        <p className="text-sm text-destructive">{chat.error.message}</p>
      ) : null}
      {cancelled ? (
        <p className="text-sm text-muted-foreground">Cancelled.</p>
      ) : null}

      {chat.isPending || chat.data ? (
        <div className="rounded-xl border border-border bg-background/60 p-4">
          <p className="text-xs text-muted-foreground">
            {chat.data
              ? `served by ${chat.data.provider} · ${chat.data.model}`
              : stream
                ? "streaming…"
                : "waiting…"}
          </p>
          {metrics ? (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {metrics}
            </p>
          ) : null}
          <p className="mt-2 whitespace-pre-wrap">
            {(chat.isPending && stream
              ? live || "…"
              : (chat.data?.content ?? live)) || "(empty)"}
          </p>
        </div>
      ) : null}
    </section>
  );
}
