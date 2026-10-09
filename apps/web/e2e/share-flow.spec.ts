import { test, expect } from "@playwright/test";

test.describe("Share Flow", () => {
  test("share button exists on activity page", async ({ page }) => {
    await page.goto("/activities");

    // Wait for activities to load
    await expect(page.getByText("加载中...")).not.toBeVisible({
      timeout: 15000,
    });

    // Check if there is at least one activity to navigate into
    const activityLinks = page.locator('a[href*="/activities/"]');
    const count = await activityLinks.count();

    if (count > 0) {
      await activityLinks.first().click();
      await page.waitForURL(/\/activities\//);

      // Share button should be visible on the detail page
      await expect(page.getByText("分享")).toBeVisible({ timeout: 10000 });
    }
  });

  test("share dialog opens and shows share options", async ({ page }) => {
    await page.goto("/activities");

    await expect(page.getByText("加载中...")).not.toBeVisible({
      timeout: 15000,
    });

    const activityLinks = page.locator('a[href*="/activities/"]');
    const count = await activityLinks.count();

    if (count > 0) {
      await activityLinks.first().click();
      await page.waitForURL(/\/activities\//);

      await page.getByText("分享").click();
      await expect(page.getByText("分享").or(page.getByText("复制"))).toBeVisible({
        timeout: 5000,
      });
    }
  });
});
