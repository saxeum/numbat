import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

interface HealthResult {
  httpOk: boolean;
  httpStatus: number;
  latencyMs: number;
  version: string | null;
  database: string | null;
  timestamp: string | null;
  checkedAtLabel: string;
}

async function fetchHealth(): Promise<HealthResult> {
  const started = performance.now();
  const res = await fetch("/api/health", { cache: "no-store" });
  const latencyMs = performance.now() - started;
  const body = (await res.json().catch(() => null)) as {
    version?: string;
    database?: string;
    timestamp?: string;
  } | null;
  return {
    httpOk: res.ok,
    httpStatus: res.status,
    latencyMs,
    version: body?.version ?? null,
    database: body?.database ?? null,
    timestamp: body?.timestamp ?? null,
    checkedAtLabel: new Date().toLocaleTimeString(),
  };
}

type Level = "operational" | "degraded" | "down" | "checking";

const STATUS: Record<
  Level,
  {
    label: string;
    description: string;
    dot: string;
    text: string;
    icon: typeof CheckCircle2;
  }
> = {
  operational: {
    label: "All systems operational",
    description: "The API and database are responding normally.",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  degraded: {
    label: "Degraded performance",
    description: "The API is up, but a dependency is unhealthy.",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    icon: AlertTriangle,
  },
  down: {
    label: "Service unavailable",
    description: "We couldn't reach the API.",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    icon: XCircle,
  },
  checking: {
    label: "Checking…",
    description: "Contacting the API.",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    icon: RefreshCw,
  },
};

function ComponentRow({
  name,
  detail,
  ok,
}: {
  name: string;
  detail: string;
  ok: boolean | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4 bg-card px-5 py-4">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <span
        className={cn(
          "flex items-center gap-2 text-sm font-medium",
          ok === null
            ? "text-muted-foreground"
            : ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400",
        )}
      >
        <span
          className={cn(
            "size-2 rounded-full",
            ok === null
              ? "bg-muted-foreground"
              : ok
                ? "bg-emerald-500"
                : "bg-red-500",
          )}
        />
        {ok === null ? "Unknown" : ok ? "Operational" : "Down"}
      </span>
    </div>
  );
}

export function StatusPage() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 15_000,
  });

  const data = health.data;
  const level: Level = health.isPending
    ? "checking"
    : health.isError || !data
      ? "down"
      : data.httpOk && data.database === "healthy"
        ? "operational"
        : "degraded";

  const config = STATUS[level];
  const Icon = config.icon;

  return (
    <AppShell>
      <div className="flex min-h-full flex-col">
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
          <header>
            <h1 className="text-3xl font-bold tracking-tight">Status</h1>
            <p className="mt-2 text-muted-foreground">
              Live health of the Foonix API.
            </p>
          </header>

          <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-4 border-b border-border p-6">
              <span
                className={cn("grid size-10 place-items-center", config.text)}
              >
                <Icon
                  className={cn(
                    "size-6",
                    level === "checking" && "animate-spin",
                  )}
                />
              </span>
              <div className="min-w-0">
                <p className={cn("text-lg font-semibold", config.text)}>
                  {config.label}
                </p>
                <p className="text-sm text-muted-foreground">
                  {config.description}
                  {data ? ` · checked ${data.checkedAtLabel}` : null}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => health.refetch()}
                disabled={health.isFetching}
              >
                <RefreshCw
                  className={cn(
                    "size-3.5",
                    health.isFetching && "animate-spin",
                  )}
                />
                Refresh
              </Button>
            </div>

            <div className="grid gap-px bg-border sm:grid-cols-2">
              <ComponentRow
                name="API"
                detail="Chat, models, and gateway endpoints"
                ok={
                  health.isPending
                    ? null
                    : !health.isError && (data?.httpStatus ?? 0) > 0
                }
              />
              <ComponentRow
                name="Database"
                detail="D1 storage"
                ok={health.isPending ? null : data?.database === "healthy"}
              />
            </div>

            <dl className="grid grid-cols-2 gap-4 border-t border-border p-6 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Version</dt>
                <dd className="mt-1 font-medium">{data?.version ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Latency</dt>
                <dd className="mt-1 font-medium">
                  {data ? `${Math.round(data.latencyMs)} ms` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">HTTP</dt>
                <dd className="mt-1 font-medium">{data?.httpStatus ?? "—"}</dd>
              </div>
            </dl>
          </section>

          <p className="mt-4 text-sm text-muted-foreground">
            Raw endpoint:{" "}
            <a
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              /api/health
            </a>{" "}
            · refreshed every 15 seconds.
          </p>
        </main>

        <SiteFooter />
      </div>
    </AppShell>
  );
}
