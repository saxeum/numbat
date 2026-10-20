import { expect, test } from "@playwright/test";

test("todo: create, edit, complete, filter, delete", async ({ page }) => {
  const title = `buy milk ${Date.now()}`;
  const edited = `${title} 2L`;

  await page.goto("/todos");

  // create
  await page.getByLabel("New todo").fill(title);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(title)).toBeVisible();

  // edit title (inline)
  await page.getByRole("button", { name: `Edit ${title}` }).click();
  const editInput = page.getByLabel(`Edit ${title}`);
  await editInput.fill(edited);
  await editInput.press("Enter");
  await expect(page.getByText(edited)).toBeVisible();

  // complete (optimistic toggle)
  await page.getByRole("checkbox", { name: `Toggle ${edited}` }).click();
  await expect(page.getByText(edited)).toHaveClass(/line-through/);

  // filters
  await page.getByRole("button", { name: /^Active/ }).click();
  await expect(page.getByText(edited)).toHaveCount(0);
  await page.getByRole("button", { name: /^Completed/ }).click();
  await expect(page.getByText(edited)).toBeVisible();
  await page.getByRole("button", { name: /^All/ }).click();

  // delete
  await page.getByRole("button", { name: `Delete ${edited}` }).click();
  await expect(page.getByText(edited)).toHaveCount(0);
});
