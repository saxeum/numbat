import type { ReactNode } from "react";

import type { ReportModel } from "@numbat/api";

import { Badge } from "@/components/ui/badge";

function formatTtft(ttftMs: number | null | undefined): string {
  return ttftMs == null ? "—" : `${(ttftMs / 1000).toFixed(2)} s`;
}

function formatTps(
  tps: number | null | undefined,
  completionTokens: number | null | undefined,
): string {
  if (tps == null) return "—";
  return completionTokens == null
    ? `${tps.toFixed(1)} tok/s`
    : `${tps.toFixed(1)} tok/s (${completionTokens} tok)`;
}

function formatThinking(model: ReportModel): ReactNode {
  if (!model.thinking) return <span className="text-muted-foreground">no</span>;
  return (
    <span className="flex items-center gap-1">
      <Badge variant="secondary">thinking</Badge>
      {model.reasoningTokens ? (
        <span className="text-xs text-muted-foreground">
          {model.reasoningTokens} tok
        </span>
      ) : null}
    </span>
  );
}

function formatModel(model: ReportModel): ReactNode {
  const resolved = model.resolvedModel;
  return (
    <>
      <code className="text-xs">{model.modelId}</code>
      {resolved && resolved !== model.modelId ? (
        <div className="text-xs text-muted-foreground">→ {resolved}</div>
      ) : null}
    </>
  );
}

/** Compact remaining-quota summary, e.g. "RPD 999/1000 · TPM 7630/8000". */
function formatRemaining(model: ReportModel): ReactNode {
  const limits = model.quota.limits;
  if (limits.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="text-xs">
      {limits.map((limit, index) => {
        const amount =
          limit.remaining != null && limit.limit != null
            ? `${limit.remaining}/${limit.limit}`
            : limit.remaining != null
              ? `${limit.remaining}`
              : limit.limit != null
                ? `/${limit.limit}`
                : "?";
        return (
          <div key={index}>
            <span className="text-muted-foreground">
              {limit.window ?? limit.metric ?? ""}{" "}
            </span>
            {amount}
          </div>
        );
      })}
    </span>
  );
}

export function PassedTable({ models }: { models: ReportModel[] }) {
  const rows = models.filter((model) => model.attempted && model.ok);

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Thinking</th>
            <th className="px-3 py-2 font-medium">TTFT</th>
            <th className="px-3 py-2 font-medium">TPS</th>
            <th className="px-3 py-2 font-medium">Duration</th>
            <th className="px-3 py-2 font-medium">Remaining quota</th>
            <th className="px-3 py-2 font-medium">Content</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((model) => (
            <tr key={model.id}>
              <td className="px-3 py-2">{formatModel(model)}</td>
              <td className="px-3 py-2">HTTP {model.status}</td>
              <td className="px-3 py-2">{formatThinking(model)}</td>
              <td className="px-3 py-2">{formatTtft(model.ttftMs)}</td>
              <td className="px-3 py-2">
                {formatTps(model.tps, model.completionTokens)}
              </td>
              <td className="px-3 py-2">{model.durationMs ?? 0} ms</td>
              <td className="px-3 py-2">{formatRemaining(model)}</td>
              <td className="max-w-xs truncate px-3 py-2 text-muted-foreground">
                {model.content}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-3 text-muted-foreground">
                Nothing passed.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
