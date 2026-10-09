import { test, expect } from "@playwright/test";

test.describe("Plan Flow", () => {
  test("renders calendar page via /plan redirect", async ({ page }) => {
    await page.goto("/plan");
    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.locator('[data-testid^="plan-week-day-"]').or(page.locator('[data-testid^="plan-month-day-"]')).first()).toBeVisible({ timeout: 10000 });
  });

  test("shows week view with navigation controls", async ({ page }) => {
    await page.goto("/calendar");

    const grid = page.locator('[data-testid="plan-week-grid"]');
    await expect(grid).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button").first()).toBeAttached();
  });

  test("switches between week and month views via URL", async ({ page }) => {
    await page.goto("/calendar?view=week");
    await expect(page.locator('[data-testid="plan-week-grid"]')).toBeVisible();

    await page.goto("/calendar?view=month");
    await expect(page.locator('[data-testid^="plan-month-day-"]').first()).toBeVisible();
  });
});
