import { expect, test, type Page } from "@playwright/test";
import { mockDashboard } from "./ux-dashboard-mocks";

const FIXED_NOW = "2026-11-04T04:00:00Z";

async function setupCalendarMocks(
  page: Page,
  options: {
    readonly activities?: readonly unknown[];
    readonly events?: readonly unknown[];
  } = {},
) {
  await mockDashboard(page);
  await page.route("**/api/v1/integrations/intervals_icu", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-API-Version": "1" },
    body: JSON.stringify({
      source: "intervals_icu",
      connected: true,
      last_sync_at: null,
      last_sync_status: null,
      last_sync_error: null,
      last_sync_detail: null,
      created_at: null,
      updated_at: null,
      data_as_of: null,
      staleness_bucket: "fresh",
      settings: { sync_frequency: "daily", auto_sync: true },
    }),
  }));
  await page.route("**/api/v1/activities?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-API-Version": "1" },
    body: JSON.stringify(options.activities ?? []),
  }));
  await page.route("**/api/v1/calendar?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-API-Version": "1" },
    body: JSON.stringify(options.events ?? []),
  }));
}

test.describe("training interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED_NOW));
  });

  test("浏览他周时添加训练默认落在该周周一而非今天", async ({ page }) => {
    await setupCalendarMocks(page);
    await page.goto("/calendar");
    await expect(page.getByTestId("training-period-summary")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "上一周" }).click();
    await expect(page.getByTestId("training-period-summary")).toContainText("该周训练汇总");
    await page.getByLabel("展开训练操作").click();
    await page.getByRole("menuitem", { name: /记录训练/ }).click();
    await page.getByRole("button", { name: /编排训练计划/ }).click();
    await expect(page.locator("#wb-date")).toHaveValue("2026-10-26");
  });

  test("酸痛度写 1-4 原值，有活动时 RPE 独立按 1-10 保存", async ({ page }) => {
    const wellnessPayloads: unknown[] = [];
    const rpePayloads: unknown[] = [];
    await setupCalendarMocks(page, {
      activities: [{
        activity_id: "act-1",
        sport: "Run",
        start_time: FIXED_NOW,
        distance_m: 8000,
        duration_s: 2400,
        tss: 60,
        name: "晨跑",
      }],
    });
    await page.route("**/api/v1/wellness/ratings", async (route) => {
      wellnessPayloads.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "X-API-Version": "1" },
        body: JSON.stringify({ day: "2026-11-04", soreness: 3 }),
      });
    });
    await page.route("**/api/v1/activities/act-1/rpe", async (route) => {
      rpePayloads.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "X-API-Version": "1" },
        body: JSON.stringify({ activity_id: "act-1", rpe: 8 }),
      });
    });

    await page.goto("/calendar");
    const controls = page.getByTestId("training-subjective-controls");
    await expect(controls).toBeVisible({ timeout: 15000 });
    await controls.getByRole("button", { name: "酸痛度 3 偏重" }).click();
    await expect.poll(() => wellnessPayloads.length).toBe(1);
    expect(wellnessPayloads[0]).toEqual({ day: "2026-11-04", soreness: 3 });

    await controls.getByRole("button", { name: "RPE 8" }).click();
    await expect.poll(() => rpePayloads.length).toBe(1);
    expect(rpePayloads[0]).toEqual({ rpe: 8 });
  });

  test("编排间歇课使用分钟和配速格式保存结构化处方并在日详情读出", async ({ page }) => {
    const storedEvents: Record<string, unknown>[] = [];
    await setupCalendarMocks(page, {
      activities: [{
        activity_id: "act-day",
        sport: "Run",
        start_time: FIXED_NOW,
        distance_m: 9000,
        duration_s: 2700,
        tss: 68,
        name: "当日实跑",
      }],
    });
    await page.unroute("**/api/v1/calendar?*");
    await page.route("**/api/v1/calendar?*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-API-Version": "1" },
      body: JSON.stringify(storedEvents),
    }));
    await page.route("**/api/v1/calendar", async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        storedEvents.push({ ...body, status: "planned", done: false });
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          headers: { "X-API-Version": "1" },
          body: JSON.stringify({ ...body, status: "planned", done: false, athlete_edited: false }),
        });
      }
      return route.continue();
    });

    await page.goto("/calendar");
    await page.getByLabel("编辑 2026-11-04 训练").click();
    // 编辑计划落「编排」段；旧流直接出表单，新流先切段。
    await page.getByRole("tab", { name: "编排" }).click();
    await page.locator("#wb-name").fill("间歇节奏测试");
    await page.getByLabel("段落类型").click();
    await page.getByRole("option", { name: "间歇" }).click();
    await page.getByLabel("时长分钟").fill("4");
    await page.getByLabel("重复组数").fill("4");
    await page.getByLabel("恢复分钟").fill("1");
    await page.getByLabel("恢复秒").fill("30");
    await page.getByLabel("目标最快配速 (/km)").fill("4:20");
    await page.getByLabel("目标最慢配速 (/km)").fill("4:30");
    await page.getByRole("button", { name: "添加段落" }).click();
    await expect(page.getByTestId("wb-segments")).toContainText("间歇 × 4 组");
    await page.getByRole("button", { name: "保存计划" }).click();

    await expect.poll(() => storedEvents.length).toBe(1);
    expect(Number(storedEvents[0]?.predicted_distance_m)).toBeGreaterThan(3000);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByLabel("编辑 2026-11-04 训练").click();
    // 保存后重开：当天已有计划，默认落「回顾」段，处方与计划实际对照都在回顾段。
    await expect(page.getByTestId("plan-pace-prescription")).toContainText("3.6 km");
    await expect(page.getByTestId("plan-pace-prescription")).toContainText("4:20–4:30 /公里");
    await expect(page.getByTestId("day-plan-actual")).toContainText("3.6 km");
    await expect(page.getByTestId("day-plan-actual")).toContainText("4'20\"–4'30\" /km");
  });

  for (const vp of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
    test(`视口 ${vp.width}x${vp.height} 下周/月/流水视图无横向溢出`, async ({ page }) => {
      await page.setViewportSize(vp);
      await setupCalendarMocks(page);
      for (const path of ["/calendar", "/calendar?view=month", "/calendar?view=list"]) {
        await page.goto(path);
        await page.waitForTimeout(500);
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      }
    });
  }
});
