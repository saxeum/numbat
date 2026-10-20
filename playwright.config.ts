import { defineConfig, devices } from "@playwright/test";

const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  timeout: 60_000,
  // Low-memory dev machines can't run many browsers at once; CI can.
  workers: CI ? undefined : 2,
  reporter: CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev -w apps/worker -- --port 8787",
      url: "http://localhost:8787/api/health",
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      command: "npm run dev -w apps/web -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
