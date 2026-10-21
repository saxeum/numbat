import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link } from "react-router";
import { ArrowUp, ChevronDown, Square } from "lucide-react";

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
  autoFocus?: boolean;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  streaming,
  onStop,
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
          className="text-foreground underline-offset-4 hover:underline"
        >
          Connect a provider key
        </Link>{" "}
        to start chatting.
      </div>
    );
  }

  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-2">
      <div className="rounded-lg border border-border bg-card p-2 focus-within:border-ring/60">
        <Textarea
          ref={textareaRef}
          value={value}
          autoFocus={autoFocus}
          rows={1}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message Foonix…"
          className="max-h-[220px] resize-none border-0 bg-transparent px-2 py-2 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="flex items-center gap-1.5 px-1 pb-0.5 sm:gap-2">
          <details className="relative shrink-0">
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden",
              )}
            >
              <span className="max-w-[38vw] truncate sm:max-w-52">
                <span className="hidden sm:inline">{providerSummary}</span>
                <span className="sm:hidden">Providers</span>
              </span>
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

          <div className="min-w-0 flex-1 sm:max-w-64">
            <select
              aria-label="Model"
              title={effectiveModel}
              value={effectiveModel}
              onChange={(event) => setModel(event.target.value)}
              disabled={loading || catalog.length === 0}
              className={cn(selectClass, "h-8 w-full rounded-md py-0 text-xs")}
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
          </div>

          <div className="ml-auto" />

          {streaming ? (
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="rounded-md"
              onClick={onStop}
              aria-label="Stop"
            >
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-lg"
              className="rounded-md"
              disabled={!value.trim() || !effectiveModel}
              aria-label="Send"
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
