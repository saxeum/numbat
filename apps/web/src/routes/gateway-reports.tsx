import { Check, Pencil, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/features/auth/client";
import { useCredentials } from "@/features/gateway/hooks";
import {
  providerLabel,
  sectionClass,
  selectClass,
} from "@/features/gateway/ui";
import { ProgressBar } from "@/features/reports/components/ProgressBar";
import { StatusBadge } from "@/features/reports/components/StatusBadge";
import {
  useCreateReport,
  useDeleteReport,
  useRenameReport,
  useReports,
} from "@/features/reports/hooks";

export function GatewayReportsPage() {
  const { data: session } = useSession();
  const authed = Boolean(session);
  const credentials = useCredentials(authed);
  const reports = useReports(authed);
  const createReport = useCreateReport();
  const renameReport = useRenameReport();
  const deleteReport = useDeleteReport();
  const navigate = useNavigate();

  const [credentialId, setCredentialId] = useState("");
  const [label, setLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const creds = credentials.data ?? [];
  const effectiveCredential = creds.some((c) => c.id === credentialId)
    ? credentialId
    : (creds[0]?.id ?? "");
  const rows = reports.data ?? [];
  const active = rows.find(
    (report) => report.status === "queued" || report.status === "running",
  );

  async function onRun(event: FormEvent) {
    event.preventDefault();
    if (!effectiveCredential) return;
    const report = await createReport.mutateAsync({
      credentialId: effectiveCredential,
      label: label.trim() || null,
    });
    setLabel("");
    navigate(`/gateway/reports/${report.id}`);
  }

  return (
    <section className={`${sectionClass} mx-auto w-full max-w-4xl`}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Reports</h2>
        <p className="text-sm text-muted-foreground">
          Probe every model a provider lists with one of your keys. Results feed
          the chat model picker.
        </p>
      </div>

      <form onSubmit={onRun} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="credential">Credential</Label>
          <select
            id="credential"
            value={effectiveCredential}
            onChange={(event) => setCredentialId(event.target.value)}
            className={selectClass}
            disabled={creds.length === 0}
          >
            {creds.length === 0 ? (
              <option value="">No keys connected</option>
            ) : null}
            {creds.map((credential) => (
              <option key={credential.id} value={credential.id}>
                {providerLabel(credential.provider)} ·{" "}
                {credential.label || "default"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-52 flex-1 flex-col gap-1.5">
          <Label htmlFor="label">Label (optional)</Label>
          <Input
            id="label"
            value={label}
            maxLength={120}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. nightly groq"
          />
        </div>
        <Button
          type="submit"
          disabled={createReport.isPending || !effectiveCredential}
        >
          {createReport.isPending ? "Starting…" : "Run report"}
        </Button>
      </form>

      {createReport.isError ? (
        <p className="text-sm text-destructive">{createReport.error.message}</p>
      ) : null}

      {active ? (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
          <span className="flex items-center gap-2 text-sm">
            <StatusBadge status={active.status} />
            <span className="font-medium">
              {active.label ?? active.id.slice(0, 8)}
            </span>
            <span className="text-muted-foreground">
              · {providerLabel(active.provider)}
            </span>
          </span>
          <ProgressBar
            done={active.progressDone}
            total={active.progressTotal}
          />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Label</th>
              <th className="px-3 py-2 font-medium">Provider</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Models</th>
              <th className="px-3 py-2 font-medium">Passed</th>
              <th className="px-3 py-2 font-medium">Failed</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((report) => (
              <tr key={report.id} className="group">
                <td className="px-3 py-2">
                  <StatusBadge status={report.status} />
                </td>
                <td className="px-3 py-2">
                  {editingId === report.id ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        renameReport.mutate({
                          id: report.id,
                          label: draft.trim() || null,
                        });
                        setEditingId(null);
                      }}
                      className="flex items-center gap-1"
                    >
                      <Input
                        value={draft}
                        autoFocus
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setEditingId(null);
                        }}
                        className="h-8"
                      />
                      <button
                        type="submit"
                        aria-label="Save label"
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel rename"
                        onClick={() => setEditingId(null)}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate(`/gateway/reports/${report.id}`)}
                      className="font-medium hover:underline"
                    >
                      {report.label ?? report.id.slice(0, 8)}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">{providerLabel(report.provider)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(report.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {report.totals.models}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {report.totals.passed}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {report.totals.failed}
                </td>
                <td className="px-3 py-2">
                  {confirmingId === report.id ? (
                    <span className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">
                        Delete?
                      </span>
                      <button
                        type="button"
                        aria-label="Confirm delete"
                        onClick={() => {
                          deleteReport.mutate(report.id);
                          setConfirmingId(null);
                        }}
                        className="rounded p-1 text-destructive hover:text-destructive/80"
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel delete"
                        onClick={() => setConfirmingId(null)}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label="Rename report"
                        onClick={() => {
                          setDraft(report.label ?? "");
                          setEditingId(report.id);
                        }}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete report"
                        onClick={() => setConfirmingId(report.id)}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {reports.isPending ? (
              <tr>
                <td colSpan={8} className="px-3 py-3 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!reports.isPending && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-3 text-muted-foreground">
                  No reports yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
