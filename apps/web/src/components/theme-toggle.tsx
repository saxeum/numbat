import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

const STORAGE_KEY = "foonix.theme";

export function ThemeToggle() {
  // Read the class at mount (not module load) so remounting on navigation
  // keeps the current theme.
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
    } catch {
      // ignore storage failures
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#08090a" : "#ffffff");
  }, [dark]);

  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => setDark((current) => !current)}
      className="rounded-md bg-card"
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
