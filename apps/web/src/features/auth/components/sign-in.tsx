import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signIn, signUp } from "../client";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const devCredentials = import.meta.env.DEV;

  async function onGoogle() {
    setError(null);
    await signIn.social({ provider: "google", callbackURL: "/" });
  }

  async function onPassword(event: FormEvent, mode: "in" | "up") {
    event.preventDefault();
    setError(null);
    const res =
      mode === "up"
        ? await signUp.email({ email, password, name: email })
        : await signIn.email({ email, password });
    if (res.error) setError(res.error.message ?? "Authentication failed");
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-16 text-foreground">
      <section className="flex w-full max-w-sm flex-col gap-6">
        <header className="flex flex-col gap-1 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground">Sign in to continue.</p>
        </header>

        <Button onClick={onGoogle}>Continue with Google</Button>

        {devCredentials ? (
          <form
            onSubmit={(event) => onPassword(event, "in")}
            className="flex flex-col gap-3 border-t border-border pt-6"
          >
            <p className="text-xs text-muted-foreground">
              Dev credentials (non-production only)
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" variant="outline">
                Sign in with password
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={(event) => onPassword(event, "up")}
              >
                Create account
              </Button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}
