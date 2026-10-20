import { expect, test } from "@playwright/test";

test("todo: sign in, create, edit, complete, filter, delete", async ({
  page,
}) => {
  const title = `buy milk ${Date.now()}`;
  const edited = `${title} 2L`;

  await page.goto("/todos");

  // Sign in via the dev credential form (Google OAuth can't be automated).
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password1234");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByLabel("New todo")).toBeVisible();

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
