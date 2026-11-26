import { test, expect } from "@playwright/test";

/**
 * 力量训练是训练工作区的二级入口 `/strength`，与日历、记录共用页头；
 * 旧的 `?view=strength` 与 `/settings?section=strength` 都改写到这里。
 */
test.describe("Strength Flow", () => {
  test("calendar exposes the strength tab in the shared training header", async ({ page }) => {
    await page.goto("/calendar");
    const tab = page.getByTestId("training-tab-strength");
    await expect(tab).toBeVisible({ timeout: 10000 });
    await expect(tab).toHaveAttribute("href", "/strength");
  });

  test("the retired strength view redirects to the strength workbench", async ({ page }) => {
    await page.goto("/calendar?view=strength");
    await expect(page).toHaveURL(/\/strength$/);
    await expect(page.getByRole("heading", { name: "动作库" })).toBeVisible({ timeout: 10000 });
  });

  test("strength route renders the strength training session page @smoke", async ({ page }) => {
    await page.goto("/strength");
    await expect(page.getByRole("heading", { name: "动作库" })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: "历史与分析" }).click();
    await expect(page).toHaveURL(/tab=analytics/);
    await expect(page.getByText(/e1RM 趋势/)).toBeVisible();
  });

  test("legacy settings strength section redirects to the strength workbench", async ({ page }) => {
    await page.goto("/settings?section=strength");
    await expect(page).toHaveURL(/\/strength$/);
  });
});
