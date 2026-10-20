import { expect, test } from "@playwright/test";

test("todo CRUD happy path", async ({ page }) => {
  const title = `buy milk ${Date.now()}`;

  await page.goto("/todos");

  await page.getByLabel("New todo").fill(title);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(title)).toBeVisible();

  await page.getByRole("checkbox", { name: `Toggle ${title}` }).click();
  await expect(page.getByText(title)).toHaveClass(/line-through/);

  await page.getByRole("button", { name: `Delete ${title}` }).click();
  await expect(page.getByText(title)).toHaveCount(0);
});
