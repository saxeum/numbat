import type { ReportModel } from "@numbat/api";

import { Badge } from "@/components/ui/badge";

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function FailedList({ models }: { models: ReportModel[] }) {
  const rows = models.filter((model) => model.attempted && !model.ok);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">None.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((model) => (
        <details
          key={model.id}
          className="rounded-lg border border-border bg-card px-3 py-2"
        >
          <summary className="flex cursor-pointer items-center gap-2 text-sm">
            <code className="text-xs">{model.modelId}</code>
            <Badge variant="destructive">
              {model.status !== null ? `HTTP ${model.status}` : "no response"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {model.durationMs ?? 0} ms
            </span>
          </summary>
          {model.error ? (
            <p className="mt-2 text-xs text-muted-foreground">
              error: {model.error.name}: {model.error.message}
            </p>
          ) : null}
          {model.body ? (
            <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-2 text-xs">
              {pretty(model.body)}
            </pre>
          ) : null}
          {model.headers && Object.keys(model.headers).length > 0 ? (
            <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-2 text-xs">
              {JSON.stringify(model.headers, null, 2)}
            </pre>
          ) : null}
        </details>
      ))}
    </div>
  );
}
