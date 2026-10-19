import { test, expect } from "@playwright/test";

/**
 * Strength training is rendered inside the calendar page, in every view, as
 * `CalendarStrengthView`. `?view=strength` was a fourth tab whose content was
 * identical to the log view, so it normalises to `?view=list`; the aliases
 * follow it.
 */
test.describe("Strength Flow", () => {
  test("renders strength content on the calendar page", async ({ page }) => {
    await page.goto("/calendar?view=list");
    await expect(page.getByRole("heading", { name: "训练日志" }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("the retired strength view normalises to the log view", async ({ page }) => {
    await page.goto("/calendar?view=strength");
    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByRole("heading", { name: "训练日志" }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("strength route redirects to the calendar log view", async ({ page }) => {
    await page.goto("/strength");
    await expect(page).toHaveURL(/calendar\?view=list/);
  });

  test("strength analytics route redirects to the calendar log view", async ({ page }) => {
    await page.goto("/strength/analytics");
    await expect(page).toHaveURL(/calendar\?view=list/);
  });

  test("legacy settings strength section redirects to the calendar log view", async ({ page }) => {
    await page.goto("/settings?section=strength");
    await expect(page).toHaveURL(/\/calendar.*view=list/);
  });
});
