import { Link } from "react-router";

import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 text-foreground">
      <section className="flex flex-col items-center gap-4 text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <Button asChild>
          <Link to="/">Back home</Link>
        </Button>
      </section>
    </main>
  );
}
