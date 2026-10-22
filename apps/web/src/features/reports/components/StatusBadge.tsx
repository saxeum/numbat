import type { Report } from "@numbat/api";

import { Badge } from "@/components/ui/badge";

const VARIANT: Record<
  Report["status"],
  "outline" | "secondary" | "default" | "destructive"
> = {
  queued: "outline",
  running: "secondary",
  succeeded: "default",
  failed: "destructive",
};

export function StatusBadge({ status }: { status: Report["status"] }) {
  return (
    <Badge variant={VARIANT[status]} className="capitalize">
      {status}
    </Badge>
  );
}
