import { expect, test } from "@playwright/test";

test("home page renders and reports the API online", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "numbat" })).toBeVisible();
  await expect(page.getByText("API online")).toBeVisible();
});

test("unknown deep links fall back to the SPA and render the 404 route", async ({
  page,
}) => {
  const res = await page.goto("/some/client/route");

  expect(res?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});

test("API health is reachable through the web origin", async ({ request }) => {
  const res = await request.get("/api/health");

  expect(res.ok()).toBeTruthy();
  await expect(res.json()).resolves.toMatchObject({ ok: true });
});
