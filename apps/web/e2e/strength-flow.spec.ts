import { test, expect } from "@playwright/test";

test.describe("Strength Flow", () => {
  test("renders strength view via calendar deep link", async ({ page }) => {
    await page.goto("/calendar?view=strength");
    await expect(page).toHaveURL(/view=strength/);
    await expect(page.locator('section').first()).toBeVisible({ timeout: 10000 });
  });

  test("shows training log or analytics area", async ({ page }) => {
    await page.goto("/calendar?view=strength");

    await expect(
      page.getByRole("heading", { name: "训练日志" }).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("strength route redirects to calendar strength view", async ({ page }) => {
    await page.goto("/strength");
    await expect(page).toHaveURL(/calendar\?view=strength/);
  });

  test("strength analytics route redirects to calendar strength view", async ({ page }) => {
    await page.goto("/strength/analytics");
    await expect(page).toHaveURL(/calendar\?view=strength/);
  });

  test("legacy settings strength section redirects to calendar strength view", async ({ page }) => {
    await page.goto("/settings?section=strength");
    await expect(page).toHaveURL(/\/calendar.*view=strength/);
  });
});
