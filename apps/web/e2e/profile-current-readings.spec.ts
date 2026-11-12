import { expect, test, type Page } from "@playwright/test";
import { mockDashboard } from "./ux-dashboard-mocks";

/**
 * 最大摄氧量由设备在符合条件的训练日写入，常常几个月不更新。
 * 档案页读取的是「当前值」，不能因为页面选择的时间窗口里没有记录就留空。
 */
const STALE_VO2MAX = {
  grain: "daily",
  series: [
    {
      metric: "vo2max",
      grain: "daily",
      unit: "ml_kg_min",
      label: "最大摄氧量 (VO2max)",
      coverage: { expected: 20800, observed: 1, ratio: 0.0001 },
      points: [{ period: "2026-06-28", value: 57, samples: 1 }],
    },
  ],
};

async function mockProfileWithStaleReading(page: Page): Promise<void> {
  await mockDashboard(page);
  await page.route("**/api/v1/metrics/series/batch*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-API-Version": "1" },
      body: JSON.stringify(STALE_VO2MAX),
    }),
  );
}

test.describe("档案页当前生理读数", () => {
  test("时间窗口之外的最近一次设备读数仍显示值并记录日期", async ({ page }) => {
    await mockProfileWithStaleReading(page);
    await page.goto("/profile");

    const vo2Row = page.getByTestId("physiology-vo2max");
    await expect(vo2Row).toContainText("最大摄氧量");
    await expect(vo2Row).toContainText("57.0 ml/kg/min");
    await expect(vo2Row).toContainText("记录于 2026-06-28");
    await expect(page.getByTestId("physiology-resting_hr")).toContainText("尚未记录");
  });
});
