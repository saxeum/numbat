import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link } from "react-router";
import { ArrowUp, ChevronDown, SlidersHorizontal, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/client";
import { useCredentials, useModels } from "@/features/gateway/hooks";
import { selectClass } from "@/features/gateway/ui";
import { cn } from "cn";

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  nvidia: "NVIDIA",
  openrouter: "OpenRouter",
};

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (input: { model: string }) => void;
  streaming: boolean;
  onStop: () => void;
  stream: boolean;
  onStreamChange: (stream: boolean) => void;
  autoFocus?: boolean;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  streaming,
  onStop,
  stream,
  onStreamChange,
  autoFocus,
}: Props) {
  const { data: session } = useSession();
  const credentials = useCredentials(Boolean(session));
  const models = useModels(Boolean(session));

  const [model, setModel] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[] | null>(
    null,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const loading = credentials.isPending || models.isPending;

  // Auto-grow up to ~10 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  function toggleProvider(provider: string) {
    const next = new Set(activeProviders);
    if (next.has(provider)) next.delete(provider);
    else next.add(provider);
    setSelectedProviders(connectedProviders.filter((p) => next.has(p)));
  }

  function submit() {
    if (streaming || !value.trim() || !effectiveModel) return;
    onSubmit({ model: effectiveModel });
    textareaRef.current?.focus();
  }

  function onFormSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  }

  const providerSummary =
    activeProviders.length === connectedProviders.length
      ? "All connected providers"
      : activeProviders.length === 0
        ? "No providers selected"
        : activeProviders.map((p) => PROVIDER_LABELS[p] ?? p).join(", ");

  if (!loading && connectedProviders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        No provider is connected yet.{" "}
        <Link
          to="/gateway/credentials"
          className="text-primary underline-offset-4 hover:underline"
        >
          Connect a provider key
        </Link>{" "}
        to start chatting.
      </div>
    );
  }

  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-2">
      <div className="rounded-2xl border border-border bg-card p-2 shadow-[0_20px_50px_-34px_rgba(0,0,0,0.9)] focus-within:border-ring/60">
        <Textarea
          ref={textareaRef}
          value={value}
          autoFocus={autoFocus}
          rows={1}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message Foonix…"
          className="max-h-[220px] resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="flex items-center gap-2 px-1 pb-0.5">
          <details className="relative">
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden",
              )}
            >
              <span className="max-w-40 truncate">{providerSummary}</span>
              <ChevronDown className="size-3.5" />
            </summary>
            <div className="absolute bottom-full z-10 mb-2 w-56 rounded-lg border border-border bg-card p-2 shadow-lg">
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
                  onClick={() => setSelectedProviders([...connectedProviders])}
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

          <select
            aria-label="Model"
            value={effectiveModel}
            onChange={(event) => setModel(event.target.value)}
            disabled={loading || catalog.length === 0}
            className={cn(
              selectClass,
              "h-8 max-w-52 rounded-full py-0 text-xs",
            )}
          >
            {loading ? <option>Loading models…</option> : null}
            {!loading && catalog.length === 0 ? (
              <option>No models</option>
            ) : null}
            {catalog.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id} ({entry["x-provider"]})
              </option>
            ))}
          </select>

          <details className="relative ml-auto">
            <summary className="flex cursor-pointer list-none items-center rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal className="size-4" />
            </summary>
            <div className="absolute right-0 bottom-full z-10 mb-2 w-48 rounded-lg border border-border bg-card p-3 shadow-lg">
              <label
                htmlFor="stream"
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  id="stream"
                  checked={stream}
                  onCheckedChange={(checked) =>
                    onStreamChange(checked === true)
                  }
                />
                <span>Stream response</span>
              </label>
            </div>
          </details>

          {streaming ? (
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="rounded-full"
              onClick={onStop}
              aria-label="Stop"
            >
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-lg"
              className="rounded-full"
              disabled={!value.trim() || !effectiveModel}
              aria-label="Send"
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Enter to send · Shift+Enter for a new line
      </p>
    </form>
  );
}
