import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { getHealth } from "@/lib/api";

const statusDot = {
  checking: "bg-muted-foreground",
  online: "bg-emerald-500",
  offline: "bg-destructive",
} as const;

export function HomePage() {
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth });

  const status = health.isPending ? "checking" : health.isError ? "offline" : "online";
  const label =
    status === "checking"
      ? "Checking API…"
      : status === "offline"
        ? "API offline"
        : "API online";

  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-16 text-foreground">
      <section className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          foonix.net
        </span>
        <h1 className="text-5xl font-semibold tracking-tight">numbat</h1>
        <p className="text-balance text-muted-foreground">
          A React SPA served by the web Worker, calling the Hono API on the same
          origin.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild>
            <a href="/api/health" target="_blank" rel="noreferrer">
              View API response
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="https://github.com/saxeum/numbat" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </Button>
        </div>
        <p
          className="inline-flex items-center gap-2 font-mono text-sm text-muted-foreground"
          aria-live="polite"
        >
          <span className={`size-2 rounded-full ${statusDot[status]}`} />
          {label}
        </p>
      </section>
    </main>
  );
}
