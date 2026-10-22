import type { QuotaInfo, QuotaLimit, ReportModel } from "@numbat/api";

import { Badge } from "@/components/ui/badge";

const STATE_ORDER: Record<QuotaInfo["state"], number> = {
  "within-quota": 0,
  exhausted: 1,
  unavailable: 2,
  unknown: 3,
};

const STATE_VARIANT: Record<
  QuotaInfo["state"],
  "secondary" | "destructive" | "outline"
> = {
  "within-quota": "secondary",
  exhausted: "destructive",
  unavailable: "outline",
  unknown: "outline",
};

function humanDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h${minutes ? ` ${minutes}m` : ""}`;
  if (minutes > 0) return `${minutes}m${seconds ? ` ${seconds}s` : ""}`;
  return `${seconds}s`;
}

function formatRetry(ms?: number | null): string {
  return ms && ms > 0 ? humanDuration(ms) : "—";
}

/**
 * e.g. "requests (RPD): 6999/7000 remaining". We render only currently
 * available capacity: Groq/OpenAI limits are continuously-refilling buckets,
 * so the actionable wait is the `Retry` column, not a "reset" duration.
 */
function formatLimit(limit: QuotaLimit): string {
  const label = limit.metric ?? limit.scope ?? "limit";
  const window = limit.window ? ` (${limit.window})` : "";
  const parts: string[] = [];

  if (limit.remaining != null && limit.limit != null) {
    parts.push(`${limit.remaining}/${limit.limit} remaining`);
  } else if (limit.limit != null) {
    parts.push(`limit ${limit.limit}`);
  } else if (limit.remaining != null) {
    parts.push(`${limit.remaining} remaining`);
  }

  return parts.length > 0
    ? `${label}${window}: ${parts.join(", ")}`
    : `${label}${window}`;
}

export function QuotaTable({ models }: { models: ReportModel[] }) {
  const rows = models
    .filter((model) => model.attempted)
    .sort(
      (a, b) =>
        STATE_ORDER[a.quota.state] - STATE_ORDER[b.quota.state] ||
        a.modelId.localeCompare(b.modelId),
    );

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 font-medium">State</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Retry</th>
            <th className="px-3 py-2 font-medium">Remaining quota</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((model) => (
            <tr key={model.id}>
              <td className="px-3 py-2">
                <code className="text-xs">{model.modelId}</code>
              </td>
              <td className="px-3 py-2">
                <Badge
                  variant={STATE_VARIANT[model.quota.state]}
                  className="capitalize"
                >
                  {model.quota.state}
                </Badge>
              </td>
              <td className="px-3 py-2">
                {model.status !== null ? `HTTP ${model.status}` : "—"}
              </td>
              <td className="px-3 py-2">
                {formatRetry(model.quota.retryAfterMs)}
              </td>
              <td className="px-3 py-2">
                {model.quota.limits.map((limit, index) => (
                  <div key={index} className="text-xs text-muted-foreground">
                    {formatLimit(limit)}
                  </div>
                ))}
                {model.quota.limits.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : null}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-3 text-muted-foreground">
                No probes.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
