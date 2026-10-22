import type { ReportTotals } from "@numbat/api";

type TotalKey =
  | "models"
  | "chat"
  | "skipped"
  | "passed"
  | "failed"
  | "withinQuota"
  | "exhausted"
  | "unavailable"
  | "thinking";

const CARDS: Array<[TotalKey, string]> = [
  ["models", "models"],
  ["chat", "chat"],
  ["passed", "passed"],
  ["failed", "failed"],
  ["thinking", "thinking"],
  ["withinQuota", "within quota"],
  ["exhausted", "exhausted"],
  ["unavailable", "unavailable"],
  ["skipped", "skipped"],
];

export function TotalsCards({ totals }: { totals: ReportTotals }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
      {CARDS.map(([key, label]) => (
        <div
          key={key}
          className="flex flex-col items-center rounded-xl border border-border bg-card px-2 py-3 text-center"
        >
          <span className="text-lg font-semibold tabular-nums">
            {totals[key] ?? 0}
          </span>
          <span className="text-[11px] text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}
