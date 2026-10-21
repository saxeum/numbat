import { NavLink, Outlet } from "react-router";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/features/auth/client";
import { SignIn } from "@/features/auth/components/sign-in";

const tabs = [
  { to: "/gateway/chat", label: "Chat" },
  { to: "/gateway/credentials", label: "Provider credentials" },
  { to: "/gateway/tokens", label: "API tokens" },
];

export function GatewayLayout() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex min-h-svh flex-col">
        <SiteHeader />
        <main className="grid flex-1 place-items-center">
          <p className="text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  // Gate: no anonymous access to the gateway.
  if (!session) {
    return <SignIn />;
  }

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Gateway</h1>
          <nav className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
