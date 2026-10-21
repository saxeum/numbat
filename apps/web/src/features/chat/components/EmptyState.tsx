import type { ReactNode } from "react";

import { AnimatedMark } from "@/components/brand";

export function EmptyState({ composer }: { composer: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4">
      <AnimatedMark />
      <div className="w-full max-w-2xl">{composer}</div>
    </div>
  );
}
