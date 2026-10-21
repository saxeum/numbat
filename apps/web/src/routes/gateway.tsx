import { Outlet, useLocation } from "react-router";

import { AppShell } from "@/components/app-shell";
import { useSession } from "@/features/auth/client";
import { SignIn } from "@/features/auth/components/sign-in";

export function GatewayLayout() {
  const { data: session, isPending } = useSession();
  const { pathname } = useLocation();
  const isChat = pathname.startsWith("/gateway/chat");

  if (isPending) {
    return (
      <AppShell>
        <div className="grid h-full place-items-center">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </AppShell>
    );
  }

  // Gate: no anonymous access to the gateway.
  if (!session) {
    return <SignIn />;
  }

  return (
    <AppShell>
      <div className={isChat ? "h-full" : "mx-auto w-full max-w-3xl px-6 py-8"}>
        <Outlet />
      </div>
    </AppShell>
  );
}
