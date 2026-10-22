import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import { Input } from "@/components/ui/input";
import { useSession } from "@/features/auth/client";
import { providerLabel, sectionClass } from "@/features/gateway/ui";
import { FailedList } from "@/features/reports/components/FailedList";
import { PassedTable } from "@/features/reports/components/PassedTable";
import { ProgressBar } from "@/features/reports/components/ProgressBar";
import { QuotaTable } from "@/features/reports/components/QuotaTable";
import { SkippedList } from "@/features/reports/components/SkippedList";
import { StatusBadge } from "@/features/reports/components/StatusBadge";
import { TotalsCards } from "@/features/reports/components/TotalsCards";
import { useReport } from "@/features/reports/hooks";

export function GatewayReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const report = useReport(id, Boolean(session));
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");

  const status = report.data?.status;
  const isActive = status === "queued" || status === "running";

  // Once a report finishes, availability changed — refresh the model picker.
  useEffect(() => {
    if (status === "succeeded" || status === "failed") {
      queryClient.invalidateQueries({ queryKey: ["models"] });
    }
  }, [status, queryClient]);

  const models = useMemo(() => report.data?.models ?? [], [report.data]);
  const needle = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      models.filter((model) =>
        needle ? model.modelId.toLowerCase().includes(needle) : true,
      ),
    [models, needle],
  );

  if (report.isError) {
    return <p className="text-sm text-destructive">{report.error.message}</p>;
  }
  if (!report.data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const data = report.data;
  const elapsedSec = data.finishedAt
    ? Math.max(
        0,
        Math.round(
          (new Date(data.finishedAt).getTime() -
            new Date(data.createdAt).getTime()) /
            1000,
        ),
      )
    : null;

  return (
    <section className={`${sectionClass} mx-auto w-full max-w-4xl`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {data.label ?? `Report ${data.id.slice(0, 8)}`}
        </h2>
        <Link
          to="/gateway/reports"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← all reports
        </Link>
      </div>

      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <StatusBadge status={data.status} />
        <span>{new Date(data.createdAt).toLocaleString()}</span>
        {elapsedSec !== null ? <span>· {elapsedSec}s</span> : null}
        <span>· {providerLabel(data.provider)}</span>
      </p>

      {isActive ? (
        <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
          <ProgressBar done={data.progressDone} total={data.progressTotal} />
        </div>
      ) : null}

      {data.error ? (
        <p className="text-sm text-destructive">{data.error}</p>
      ) : null}

      <TotalsCards totals={data.totals} />

      <Input
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter models…"
        className="max-w-xs"
      />

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Quota</h3>
        <p className="text-xs text-muted-foreground">
          Rate limits show the provider&apos;s currently-available capacity.
          Some providers refill continuously, so the numbers recover over time
          rather than counting cumulative usage.
        </p>
        <QuotaTable models={visible} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Passed</h3>
        <PassedTable models={visible} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Failed</h3>
        <FailedList models={visible} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Skipped (non-chat)</h3>
        <SkippedList models={visible} />
      </div>
    </section>
  );
}
