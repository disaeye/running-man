import { expect, test, type Page } from "@playwright/test";
import { mockDashboard } from "./ux-dashboard-mocks";

/**
 * 训练页的认知模型：今天该做什么、这周完成度、空状态只提示一次、历史周不谈今天。
 * 数据通过 route 精确控制，避免依赖生产账户的活动时间。
 */
const FIXED_NOW = "2026-11-04T04:00:00Z";
const TODAY_MIDDAY = FIXED_NOW;

function activity(id: string, overrides: Record<string, unknown> = {}) {
  return {
    activity_id: id,
    sport: "Run",
    start_time: TODAY_MIDDAY,
    distance_m: 10000,
    duration_s: 3600,
    avg_hr: 150,
    tss: 80,
    name: "晨跑",
    ...overrides,
  };
}

function event(id: string, overrides: Record<string, unknown> = {}) {
  return {
    event_id: id,
    category: "workout",
    status: "planned",
    start_time: TODAY_MIDDAY,
    name: "阈值跑",
    predicted_tss: 70,
    predicted_distance_m: 8000,
    sport_type: "Run",
    workout_prescription: { type: "threshold", duration_min: 50, segments: [] },
    ...overrides,
  };
}

async function mockTraining(
  page: Page,
  data: {
    readonly activities?: readonly unknown[];
    readonly events?: readonly unknown[];
    readonly connected?: boolean;
  },
): Promise<void> {
  await mockDashboard(page);
  await page.route("**/api/v1/integrations/intervals_icu", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-API-Version": "1" },
    body: JSON.stringify({
      source: "intervals_icu",
      connected: data.connected ?? true,
      last_sync_at: null,
      last_sync_status: null,
      last_sync_error: null,
      last_sync_detail: null,
      created_at: null,
      updated_at: null,
      data_as_of: null,
      staleness_bucket: "missing",
      settings: { sync_frequency: "daily", auto_sync: true },
    }),
  }));
  await page.route("**/api/v1/activities?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-API-Version": "1" },
    body: JSON.stringify(data.activities ?? []),
  }));
  await page.route("**/api/v1/calendar?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-API-Version": "1" },
    body: JSON.stringify(data.events ?? []),
  }));
}

async function openToday(page: Page) {
  await page.getByLabel("编辑 2026-11-04 训练").click();
}

test.describe("training cognition", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED_NOW));
  });

  test("今天已完成时周列表直接列出活动与 TSS", async ({ page }) => {
    await mockTraining(page, { activities: [activity("a1")] });
    await page.goto("/calendar");
    const day = page.getByTestId("plan-week-day-2026-11-04");
    await expect(day).toBeVisible({ timeout: 15000 });
    await expect(day).toContainText("晨跑");
    await expect(day).toContainText("TSS 80");
    await expect(day).toContainText("已完成");
  });

  test("今天待完成时周列表给出课名与时长", async ({ page }) => {
    await mockTraining(page, { events: [event("e1")] });
    await page.goto("/calendar");
    const day = page.getByTestId("plan-week-day-2026-11-04");
    await expect(day).toBeVisible({ timeout: 15000 });
    await expect(day).toContainText("阈值跑");
    await expect(day).toContainText("50 min");
    await expect(day).toContainText("待完成");
  });

  test("今天无安排时不假装有休息日", async ({ page }) => {
    await mockTraining(page, {});
    await page.goto("/calendar");
    const day = page.getByTestId("plan-week-day-2026-11-04");
    await expect(day).toBeVisible({ timeout: 15000 });
    await expect(day).toContainText("没有安排");
    await expect(day).not.toContainText("休息日");
  });

  test("未连接数据源时给连接引导", async ({ page }) => {
    await mockTraining(page, { connected: false });
    await page.goto("/calendar");
    const notice = page.getByTestId("training-connection-notice");
    await expect(notice).toBeVisible({ timeout: 15000 });
    await expect(notice).toContainText("还没有连接数据源");
    await expect(notice.getByRole("link", { name: "去连接" })).toBeVisible();
  });

  test("已连接但整周空白时只在一处提示未编排", async ({ page }) => {
    await mockTraining(page, {});
    await page.goto("/calendar");
    const summary = page.getByTestId("training-period-summary");
    await expect(summary).toBeVisible({ timeout: 15000 });
    await expect(summary).toContainText("该周尚未编排计划");
    await expect(summary).toContainText("编排本周");
    await expect(summary).not.toContainText("差值");
    await expect(page.getByTestId("training-connection-notice")).toHaveCount(0);
  });

  test("同一天有晨跑但晚上有未完成阈值课时，今日行标为部分完成", async ({ page }) => {
    await mockTraining(page, {
      activities: [activity("a1", { name: "晨间轻松跑", duration_s: 1800 })],
      events: [
        event("e-done", {
          name: "晨间轻松跑",
          linked_activity_id: "a1",
          workout_prescription: { type: "easy", duration_min: 30, segments: [] },
        }),
        event("e-evening", { name: "晚间阈值跑" }),
      ],
    });
    await page.goto("/calendar");
    const day = page.getByTestId("plan-week-day-2026-11-04");
    await expect(day).toBeVisible({ timeout: 15000 });
    await expect(day).toContainText("晚间阈值跑");
    await expect(day).toContainText("部分完成");
  });

  test("课表接口 500 失败时显示错误和重试，不显示这周还没有安排", async ({ page }) => {
    await mockTraining(page, {});
    await page.unroute("**/api/v1/calendar?*");
    await page.route("**/api/v1/calendar?*", (route) => route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "upstream failure" }),
    }));
    await page.goto("/calendar");
    await expect(page.getByTestId("training-error-state")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "重新尝试" })).toBeVisible();
    await expect(page.getByTestId("training-period-summary")).toHaveCount(0);
  });

  test("当日详情里的今日体感默认收起，点开录入", async ({ page }) => {
    await mockTraining(page, { activities: [activity("a1")] });
    await page.goto("/calendar");
    await openToday(page);
    const toggle = page.getByRole("button", { name: /今日体感/ });
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("training-subjective-controls")).toHaveCount(0);
    await toggle.click();
    await expect(page.getByTestId("training-subjective-controls")).toBeVisible();
  });

  test("375px 首屏先给周摘要与周日程", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockTraining(page, {});
    await page.goto("/calendar");
    const summary = page.getByTestId("training-period-summary");
    await expect(summary).toBeVisible({ timeout: 15000 });
    const weekTop = await page.getByTestId("plan-week-grid").evaluate((element) => element.getBoundingClientRect().top);
    const summaryTop = await summary.evaluate((element) => element.getBoundingClientRect().top);
    expect(summaryTop).toBeLessThan(weekTop);
    expect(weekTop).toBeLessThan(812);
    await expect(page.locator('[data-testid^="plan-week-day-"]')).toHaveCount(7);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("回看历史周时不出现今天标记", async ({ page }) => {
    await mockTraining(page, { activities: [activity("a1")], events: [event("e1")] });
    await page.goto("/calendar");
    await expect(page.getByTestId("plan-week-day-2026-11-04")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "上一周" }).click();
    await expect(page.getByTestId("plan-week-day-2026-11-04")).toHaveCount(0);
  });
});
