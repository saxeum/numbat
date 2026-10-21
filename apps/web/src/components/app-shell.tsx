import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Menu } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const STORAGE_KEY = "foonix.sidebar.collapsed";
const collapsedByDefault =
  typeof localStorage !== "undefined" &&
  localStorage.getItem(STORAGE_KEY) === "1";

/** True at ≥1280px, where the sidebar can be expanded. */
function useIsWide() {
  const [wide, setWide] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1280px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const onChange = () => setWide(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return wide;
}

/**
 * Claude-style app shell: a collapsible navigation panel on the left and the
 * routed content on the right. On mobile the panel becomes a drawer.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(collapsedByDefault);
  const [mobileOpen, setMobileOpen] = useState(false);
  const wide = useIsWide();
  // Auto-collapse to the icon rail when the window is too narrow to fit both.
  const effectiveCollapsed = collapsed || !wide;

  function toggleCollapse() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore storage failures
      }
      return next;
    });
  }

  return (
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      <div className="hidden lg:flex">
        <AppSidebar
          collapsed={effectiveCollapsed}
          onToggleCollapse={toggleCollapse}
          toggleable={wide}
        />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent className="w-72">
          <AppSidebar
            collapsed={false}
            onToggleCollapse={() => setMobileOpen(false)}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>
          <Link
            to="/"
            className="flex items-center gap-2 text-base font-bold tracking-tight"
          >
            <BrandMark />
            Foonix
          </Link>
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
