import { expect, test, type Page } from "@playwright/test";
import { mockDashboard } from "./ux-dashboard-mocks";

/**
 * 训练页的认知模型：今天该做什么、这周完成度、空状态分三级、历史周不谈今天。
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

test.describe("training cognition", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(FIXED_NOW));
  });

  test("今天已完成时列出活动与 TSS", async ({ page }) => {
    await mockTraining(page, { activities: [activity("a1")] });
    await page.goto("/calendar");
    const focus = page.getByTestId("training-focus");
    await expect(focus).toBeVisible({ timeout: 15000 });
    await expect(focus).toContainText("今天已经练过");
    await expect(focus).toContainText("晨跑");
    await expect(focus).toContainText("TSS 80");
  });

  test("今天待完成时给出课名、时长与预计 TSS", async ({ page }) => {
    await mockTraining(page, { events: [event("e1")] });
    await page.goto("/calendar");
    const focus = page.getByTestId("training-focus");
    await expect(focus).toBeVisible({ timeout: 15000 });
    await expect(focus).toContainText("今天要练");
    await expect(focus).toContainText("阈值跑");
    await expect(focus).toContainText("50 min");
    await expect(focus).toContainText("预计 TSS 70");
  });

  test("今天无安排时不假装有休息日", async ({ page }) => {
    await mockTraining(page, {});
    await page.goto("/calendar");
    const focus = page.getByTestId("training-focus");
    await expect(focus).toBeVisible({ timeout: 15000 });
    await expect(focus).toContainText("今天没有安排");
    await expect(focus).not.toContainText("休息日");
  });

  test("未连接数据源时给连接引导", async ({ page }) => {
    await mockTraining(page, { connected: false });
    await page.goto("/calendar");
    const empty = page.getByTestId("training-empty-state");
    await expect(empty).toBeVisible({ timeout: 15000 });
    await expect(empty).toContainText("还没有连接数据源");
    await expect(empty.getByRole("link", { name: "去连接" })).toBeVisible();
  });

  test("已连接但整周空白时给编排入口，且计划列写未编排", async ({ page }) => {
    await mockTraining(page, {});
    await page.goto("/calendar");
    const empty = page.getByTestId("training-empty-state");
    await expect(empty).toBeVisible({ timeout: 15000 });
    await expect(empty).toContainText("这周还没有安排");
    await expect(page.getByTestId("training-period-summary")).toContainText("未编排");
  });

  test("有计划未完成时列出差哪几课", async ({ page }) => {
    await mockTraining(page, { events: [event("e1", { start_time: "2026-11-03T04:00:00Z" })] });
    await page.goto("/calendar");
    const empty = page.getByTestId("training-empty-state");
    await expect(empty).toBeVisible({ timeout: 15000 });
    await expect(empty).toContainText("阈值跑");
  });

  test("375px 首屏先给今天与周对照，不铺七张空卡", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockTraining(page, {});
    await page.goto("/calendar");
    const focus = page.getByTestId("training-focus");
    const summary = page.getByTestId("training-period-summary");
    await expect(focus).toBeVisible({ timeout: 15000 });
    await expect(summary).toBeVisible();
    const tops = await page.evaluate(() => ({
      focus: document.querySelector('[data-testid="training-focus"]')?.getBoundingClientRect().top ?? Infinity,
      summary: document.querySelector('[data-testid="training-period-summary"]')?.getBoundingClientRect().top ?? Infinity,
      viewport: window.innerHeight,
    }));
    expect(tops.focus).toBeLessThan(tops.summary);
    expect(tops.summary).toBeLessThan(tops.viewport);
    expect(await page.locator('[data-testid^="plan-week-day-"]').count()).toBeLessThan(7);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("回看历史周时不出现今天的记录块", async ({ page }) => {
    await mockTraining(page, { activities: [activity("a1")], events: [event("e1")] });
    await page.goto("/calendar");
    await expect(page.getByTestId("training-focus")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "上一周" }).click();
    await expect(page.getByTestId("training-focus")).toHaveCount(0);
    await expect(page.getByTestId("training-subjective")).toHaveCount(0);
  });
});
