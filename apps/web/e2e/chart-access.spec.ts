import { test, expect } from "@playwright/test";

/**
 * 图表的文本替代层。
 *
 * SVG 图表对读屏与键盘都不可达，所以每条带标签的序列都要有文字摘要：
 * 键盘用户按「查看数据」展开读数表，读屏用户直接读到首尾值与拐点。
 */
test.describe("chart data alternative", () => {
  test("keyboard opens the chart data table", async ({ page }) => {
    await page.goto("/analysis?tab=load", { waitUntil: "domcontentloaded" });
    const toggle = page.getByTestId("chart-data-summary-toggle").first();
    await expect(toggle).toBeVisible({ timeout: 15000 });

    // 键盘操作：聚焦后回车展开，不依赖鼠标悬停读数。
    await toggle.focus();
    await page.keyboard.press("Enter");
    const table = page.getByTestId("chart-data-table").first();
    await expect(table).toBeVisible();
    await expect(table).toContainText("起点");
    await expect(table).toContainText("拐点");
    await expect(table).toContainText("终点");

    // 再按一次收起。
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chart-data-table").first()).toHaveCount(0);
  });

  test("the table lists the labelled series with their readings", async ({ page }) => {
    await page.goto("/analysis?tab=load", { waitUntil: "domcontentloaded" });
    const toggle = page.getByTestId("chart-data-summary-toggle").first();
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await toggle.click();
    const table = page.getByTestId("chart-data-table").first();
    await expect(table).toBeVisible();
    // PMC 图有 CTL、ATL、TSB 三条带标签的线，每条都要有一行读数。
    const rows = table.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThanOrEqual(3);
    await expect(table).toContainText("CTL");
  });
});
