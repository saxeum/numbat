import { useQuery } from "@tanstack/react-query";

import { getHealth } from "@/lib/api";

const statusDot = {
  checking: "bg-muted-foreground",
  online: "bg-emerald-400 shadow-[0_0_10px_var(--primary)]",
  offline: "bg-destructive",
} as const;

export function ApiStatus() {
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth });

  const status = health.isPending
    ? "checking"
    : health.isError
      ? "offline"
      : "online";
  const label =
    status === "checking"
      ? "Checking API…"
      : status === "offline"
        ? "API offline"
        : "API online";

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
      aria-live="polite"
    >
      <span className={`size-1.5 rounded-full ${statusDot[status]}`} />
      {label}
    </span>
  );
}
