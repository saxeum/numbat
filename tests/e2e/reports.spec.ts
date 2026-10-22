import { expect, test, type Page } from "@playwright/test";

const credential = {
  id: "cred-1",
  provider: "groq",
  label: "default",
  fingerprint: "abc",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

const totals = {
  models: 2,
  chat: 2,
  skipped: 0,
  passed: 1,
  failed: 1,
  withinQuota: 1,
  exhausted: 0,
  unavailable: 1,
  thinking: 0,
};

const summary = {
  id: "report-1",
  provider: "groq",
  label: "nightly",
  status: "succeeded",
  trigger: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  startedAt: "2026-01-01T00:00:01.000Z",
  finishedAt: "2026-01-01T00:00:05.000Z",
  durationMs: 4000,
  progressDone: 2,
  progressTotal: 2,
  totals,
  error: null,
};

const detail = {
  ...summary,
  models: [
    {
      id: "m1",
      modelId: "llama-3.3-70b",
      kind: "chat",
      attempted: true,
      ok: true,
      status: 200,
      statusText: "OK",
      durationMs: 800,
      ttftMs: 210,
      completionTokens: 12,
      reasoningTokens: null,
      tps: 15,
      thinking: false,
      content: "pong",
      error: null,
      quota: {
        state: "within-quota",
        retryAfterMs: null,
        limits: [
          { metric: "requests", window: "RPD", remaining: 999, limit: 1000 },
        ],
      },
      requestBody: null,
      body: null,
      headers: null,
    },
    {
      id: "m2",
      modelId: "broken-model",
      kind: "chat",
      attempted: true,
      ok: false,
      status: 404,
      statusText: "Not Found",
      durationMs: 120,
      ttftMs: null,
      completionTokens: null,
      reasoningTokens: null,
      tps: null,
      thinking: null,
      content: null,
      error: { name: "HttpError", message: "model not found" },
      quota: { state: "unavailable", retryAfterMs: null, limits: [] },
      requestBody: null,
      body: '{"error":"not found"}',
      headers: null,
    },
  ],
};

async function mockReports(page: Page) {
  await page.route("**/api/credentials", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([credential]),
    }),
  );
  await page.route("**/api/reports**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const id = path.split("/").filter(Boolean)[2];
    const body = id ? { report: detail } : { reports: [summary] };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function signIn(page: Page) {
  const email = `reports-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.fill("#email", email);
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "Create account" }).click();
}

test("reports: list and detail render for a signed-in user", async ({
  page,
}) => {
  await mockReports(page);
  await page.goto("/gateway/reports");
  await signIn(page);

  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("nightly")).toBeVisible();

  await page.getByRole("button", { name: "nightly" }).click();

  await expect(page.getByText("llama-3.3-70b").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("broken-model").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "← all reports" })).toBeVisible();
});
