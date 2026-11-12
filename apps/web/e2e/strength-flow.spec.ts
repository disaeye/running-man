import { test, expect } from "@playwright/test";

/**
 * 力量训练有自己的路由 `/strength`，日历页只提供入口卡片；
 * `?view=strength` 已不再是一个独立标签页，归一化为 `?view=list`。
 */
test.describe("Strength Flow", () => {
  test("calendar offers the strength entry", async ({ page }) => {
    await page.goto("/calendar?view=list");
    await expect(page.getByRole("link", { name: /力量训练/ }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("the retired strength view normalises to the log view", async ({ page }) => {
    await page.goto("/calendar?view=strength");
    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByRole("link", { name: /力量训练/ }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("strength route renders the strength training session page @smoke", async ({ page }) => {
    await page.goto("/strength");
    await expect(page.getByRole("heading", { name: "动作库" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("heading", { name: "后蹲 e1RM 趋势" })).toBeVisible();
  });

  test("legacy settings strength section redirects to the calendar log view", async ({ page }) => {
    await page.goto("/settings?section=strength");
    await expect(page).toHaveURL(/\/calendar.*view=list/);
  });
});
