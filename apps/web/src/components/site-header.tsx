import { Link } from "react-router";

import { ApiStatus } from "@/components/api-status";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/client";
import { UserMenu } from "@/features/auth/components/user-menu";

const navItems = [
  { to: "/gateway", label: "Gateway" },
  { href: "/api/docs", label: "Docs" },
  { href: "/api/health", label: "Status" },
  { href: "https://github.com/saxeum/numbat", label: "GitHub", external: true },
] as const;

function HeaderAuth() {
  const { data: session } = useSession();

  if (session) return <UserMenu />;

  return (
    <Button asChild size="sm">
      <Link to="/gateway">Sign in</Link>
    </Button>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/72 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-8 px-6">
        <Brand />
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {navItems.map((item) =>
            "to" in item ? (
              <Link
                key={item.label}
                to={item.to}
                className="transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.label}
                href={item.href}
                target={"external" in item ? "_blank" : undefined}
                rel="noreferrer"
                className="transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <ApiStatus />
          <HeaderAuth />
        </div>
      </div>
    </header>
  );
}
