import { test, expect } from "@playwright/test";

test("home page loads with map and search", async ({ page }) => {
  await page.goto("/");

  // Header should be visible
  await expect(page.locator("text=FairProcess")).toBeVisible();

  // Search bar should be present
  await expect(page.locator("placeholder=Search properties, evidence, addresses...")).toBeVisible();

  // Map container should be rendered
  await expect(page.locator(".maplibregl-map")).toBeVisible({ timeout: 15000 });
});

test("sidebar shows upload tab when no property selected", async ({ page }) => {
  await page.goto("/");

  // Upload tab should be clickable
  await page.click("text=Upload");

  // Should show "Select a property first" message
  await expect(page.locator("text=Select a property first to upload evidence")).toBeVisible();
});
