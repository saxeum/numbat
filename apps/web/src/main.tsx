import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { Providers } from "@/app/providers";
import { router } from "@/app/router";
import { ErrorBoundary } from "@/components/error-boundary";
import "@/styles/globals.css";

// A deploy can replace hashed chunks while a tab is still open; Vite emits
// `vite:preloadError` when a lazy import 404s. Reload once (rate-limited) to
// pick up the new assets instead of leaving a broken screen.
const RELOAD_KEY = "foonix.preload-reload";
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // ignore storage failures
  }
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </ErrorBoundary>
  </StrictMode>,
);
