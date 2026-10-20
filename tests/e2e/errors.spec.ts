import { expect, test } from "@playwright/test";

test("route errors render the error fallback", async ({ page }) => {
  await page.goto("/__error");

  await expect(
    page.getByRole("heading", { name: "Something went wrong" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Back home" })).toBeVisible();
});
