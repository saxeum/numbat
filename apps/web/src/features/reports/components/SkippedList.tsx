import type { ReportModel } from "@numbat/api";

export function SkippedList({ models }: { models: ReportModel[] }) {
  const rows = models.filter((model) => !model.attempted);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">None.</p>;
  }

  return (
    <div className="flex flex-col gap-0.5 text-sm">
      {rows.map((model) => (
        <div key={model.id}>
          <code className="text-xs">{model.modelId}</code>{" "}
          <span className="text-muted-foreground">({model.kind})</span>
        </div>
      ))}
    </div>
  );
}
