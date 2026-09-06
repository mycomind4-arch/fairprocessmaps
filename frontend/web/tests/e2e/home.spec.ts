import { test, expect } from "@playwright/test";

test("landing page loads with header and hero content", async ({ page }) => {
  await page.goto("/");

  // Header logo/wordmark should be visible
  await expect(page.locator("header").getByText("FairProcessMaps", { exact: true })).toBeVisible();

  // Hero heading should be present
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Build the record");
});

test("sign in button opens the login modal", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Sign in" }).click();

  const dialog = page.getByRole("dialog", { name: "Sign in" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
});
