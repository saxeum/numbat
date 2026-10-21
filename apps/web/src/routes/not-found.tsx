import { Link } from "react-router";

import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 text-foreground">
      <section className="flex flex-col items-center gap-4 text-center">
        <BrandMark className="size-11 text-lg" />
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
        <p className="max-w-sm text-muted-foreground">
          The page you were looking for doesn&apos;t exist or has moved.
        </p>
        <Button asChild>
          <Link to="/">Back home</Link>
        </Button>
      </section>
    </main>
  );
}
