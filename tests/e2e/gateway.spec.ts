import { expect, test } from "@playwright/test";

test("gateway requires sign-in (no anonymous access)", async ({ page }) => {
  await page.goto("/gateway");

  // Unauthenticated visitors get the sign-in screen, not the GUI.
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gateway" })).toHaveCount(0);
});

test("models endpoint is not public", async ({ request }) => {
  const res = await request.get("/api/models");
  expect(res.status()).toBe(401);
});
