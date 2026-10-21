import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand";

export function ErrorFallback({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  children,
}: {
  title?: string;
  message?: string;
  children?: ReactNode;
}) {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-16 text-foreground">
      <section className="flex max-w-md flex-col items-center gap-4 text-center">
        <BrandMark className="size-10" />
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{message}</p>
        {children}
      </section>
    </main>
  );
}
