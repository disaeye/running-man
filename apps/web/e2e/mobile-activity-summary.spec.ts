import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 375, height: 812 } });

test("训练摘要展示主要数据并进入活动详情", async ({ page }) => {
  await page.goto("/activities", { waitUntil: "domcontentloaded" });
  const summary = page.getByTestId("activity-table").locator("a[href^='/activities/']").filter({ has: page.getByTestId("session-card-label") }).first();
  await expect(summary).toBeVisible({ timeout: 15000 });
  await expect(summary.getByTestId("session-card-label")).toBeVisible();
  await expect(summary.getByTestId("session-card-metric")).toHaveCount(3);
  await expect(summary).toContainText("时长");
  await expect(summary).toContainText("TSS");
  const typography = await summary.evaluate((element) => {
    const title = element.querySelector('[data-testid="session-card-label"]')!;
    const metric = element.querySelector('[data-testid="session-card-metric"] dd span')!;
    return {
      titleSize: parseFloat(getComputedStyle(title).fontSize),
      metricSize: parseFloat(getComputedStyle(metric).fontSize),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(typography.titleSize).toBeGreaterThanOrEqual(16);
  expect(typography.metricSize).toBeGreaterThanOrEqual(14);
  expect(typography.overflow).toBeLessThanOrEqual(1);
  await summary.click();
  await expect(page.getByTestId("activity-detail-page")).toBeVisible({ timeout: 15000 });
});

test("列表按训练日期分组", async ({ page }) => {
  await page.goto("/activities?view=list", { waitUntil: "domcontentloaded" });
  const list = page.getByTestId("activity-session-list");
  await expect(list).toBeVisible({ timeout: 15000 });
  await expect(list.locator("section").first().locator("h2")).toBeVisible();
  await expect(list.getByTestId("session-card").first().getByTestId("session-card-metric")).toHaveCount(3);
});
