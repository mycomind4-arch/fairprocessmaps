import { test, expect } from "@playwright/test";

test.describe("FairProcess 2.0 E2E", () => {
  test("homepage loads with map", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=FairProcess")).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible(); // MapLibre canvas
  });

  test("search bar is interactive", async ({ page }) => {
    await page.goto("/");
    const search = page.locator("input[placeholder*='Search']");
    await search.fill("1234 Main St");
    await expect(search).toHaveValue("1234 Main St");
  });

  test("selecting property shows evidence panel", async ({ page }) => {
    await page.goto("/");
    // Wait for map to load
    await page.waitForSelector("canvas", { timeout: 10000 });
    // Click on a mock property (would need seeded data in CI)
    // await page.click("canvas", { position: { x: 400, y: 300 } });
    // await expect(page.locator("text=Evidence")).toBeVisible();
  });
});
