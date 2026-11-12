import { test, expect, type Page } from "@playwright/test";
import type { ActivityDetail, StreamPoint } from "../shared/types/activity";

const activityBase: Omit<ActivityDetail, "has_gps"> = {
  activity_id: "activity-gps",
  start_time: "2026-07-01T08:00:00Z",
  sport: "Run",
  distance_m: 10000,
  duration_s: 2700,
  avg_hr: 150,
  max_hr: 170,
  avg_power: null,
  np: null,
  intensity_factor: null,
  tss: 80,
  icu_ctl: null,
  avg_cadence: 180,
  avg_speed: 3.7,
  elevation_gain_m: 50,
  calories: null,
  external_id: null,
  source: "intervals_icu",
  file_type: "fit",
  device_name: null,
  raw_data: null,
  has_hr: true,
  has_power: false,
  has_cadence: true,
};

function metadataRow(index: number, lat: number | null, lon: number | null): StreamPoint {
  return {
    sample_time: new Date(Date.UTC(2026, 6, 1, 8, 0, index)).toISOString(),
    metric_type: "heart_rate",
    value: 140 + index,
    lat,
    lon,
    alt: 20 + index,
  };
}

async function mockActivityDetail(page: Page, hasGps: boolean, streams: readonly StreamPoint[]): Promise<void> {
  await page.route("**/api/v1/activities/activity-gps", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-API-Version": "1" },
      body: JSON.stringify({ ...activityBase, has_gps: hasGps }),
    }),
  );
  await page.route("**/api/v1/activities/activity-gps/laps*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-API-Version": "1" },
      body: JSON.stringify([]),
    }),
  );
  await page.route("**/api/v1/activities/activity-gps/streams*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-API-Version": "1" },
      body: JSON.stringify(streams),
    }),
  );
  await page.route("**/api/v1/activities/activity-gps/analysis*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-API-Version": "1" },
      body: JSON.stringify({ laps: [], hr_zones: null, power_curve: [] }),
    }),
  );
}

test.describe("activity workflow", () => {
  test("renders activities list page", async ({ page }) => {
    // /activities redirects to the training log (/calendar?view=list).
    await page.goto("/activities");
    await page.waitForURL(/\/calendar\?view=list/);

    // 流水视图是活动记录的默认入口，运动类型筛选只在这里生效。
    await expect(page.getByRole("tab", { name: "流水" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "全部" })).toBeVisible();
    await expect(page.getByRole("button", { name: "力量", exact: true })).toBeVisible();

    // Wait for the activity list to leave its loading state.
    await expect(page.getByRole("status")).not.toBeVisible({ timeout: 15000 });
  });

  test("navigates to activity detail when clicking an activity @smoke", async ({
    page,
  }) => {
    await page.goto("/activities");
    await page.waitForURL(/\/calendar\?view=list/);

    // 取列表里第一条活动：数据来自真实库，活动名称不是固定的
    const activityLink = page.locator('a[href^="/activities/"]').first();
    await expect(activityLink).toBeVisible({ timeout: 15000 });
    await activityLink.click();
    await page.waitForURL(/\/activities\//);

    await expect(page.getByTestId("activity-detail-page")).toBeVisible({ timeout: 10000 });
  });

  test("renders a stored course expression and quality metrics for a real run", async ({ page }) => {
    const response = await page.request.get("/api/v1/activities/classifications");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.activity_count).toBeGreaterThan(0);
    const first = body.results[0];
    const activityId = first.session_classification.activity_id as string;
    const displayLine = first.session_classification.display_line as string;
    expect(activityId.length).toBeGreaterThan(0);
    expect(displayLine.length).toBeGreaterThan(0);

    await page.goto(`/activities/${activityId}`);
    await expect(page.getByTestId("activity-detail-page")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("session-classification-panel")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("session-display-line")).toContainText(
      displayLine.slice(0, 12),
      { timeout: 15000 },
    );
    await expect(page.getByTestId("session-quality-metrics")).toContainText("证据");
    await expect(page.getByTestId("session-quality-metrics")).toContainText("置信度");
    await expect(page.getByTestId("session-quality-metrics")).toContainText("工作配速波动");
  });

  test("shows stored classification in the activity log", async ({ page }) => {
    const response = await page.request.get("/api/v1/activities/classifications");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.activity_count).toBeGreaterThan(0);

    await page.goto("/calendar?view=list");
    await expect(page.getByTestId("activity-list")).toBeVisible({ timeout: 15000 });
    const course = page.getByTestId("activity-list-course").first();
    await expect(course).toBeVisible({ timeout: 15000 });
    await expect(course).toContainText(" km", { timeout: 15000 });
    await expect(page.getByTestId("activity-list-quality").first()).toContainText("证据");
    await expect(page.getByTestId("activity-list-quality").first()).toContainText("置信度");
  });

  test("shows filter controls on activities page", async ({ page }) => {
    await page.goto("/activities");

    await expect(page.getByRole("status")).not.toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByRole("button", { name: "GPS" })).toHaveCount(0);
    for (const name of ["全部", "跑步", "力量"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
  });

  test("analysis and laps start in the same wave as the activity", async ({ page }) => {
    const starts: Record<string, number> = {};
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/v1/activities/activity-gps")) {
        starts[url.pathname] ??= Date.now();
      }
    });

    await mockActivityDetail(page, true, [metadataRow(0, 35, 139)]);
    await page.goto("/activities/activity-gps", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const detail = starts["/api/v1/activities/activity-gps"];
    expect(detail, "activity detail request missing").toBeDefined();
    for (const suffix of ["/streams", "/analysis", "/laps"]) {
      const at = starts[`/api/v1/activities/activity-gps${suffix}`];
      expect(at, `${suffix} request missing`).toBeDefined();
      expect(Math.abs((at ?? 0) - (detail ?? 0)), `${suffix} started a wave late`).toBeLessThan(300);
    }
  });

  test("renders GPS map when valid metadata lat/lon rows exist", async ({ page }) => {
    await mockActivityDetail(page, true, [
      metadataRow(0, 35, 139),
      metadataRow(1, 35.1, 139.1),
      metadataRow(2, 35.2, 139.2),
    ]);

    await page.goto("/activities/activity-gps");

    await expect(page.getByTestId("gps-map")).toBeVisible();
    await expect(page.getByTestId("gps-track-polyline")).toBeVisible();
    await expect(page.getByTestId("gps-empty-state")).toHaveCount(0);
    await expect(page.getByText("此活动无 GPS 数据")).toHaveCount(0);
    await expect(page.getByTestId("availability-GPS 轨迹")).toHaveAttribute("data-state", "available");
  });

  test("renders empty GPS state without a map when no GPS is available", async ({ page }) => {
    await mockActivityDetail(page, false, [metadataRow(0, null, null)]);

    await page.goto("/activities/activity-gps");

    await expect(page.getByTestId("gps-empty-state")).toBeVisible();
    await expect(page.getByTestId("gps-map")).toHaveCount(0);
    await expect(page.getByTestId("availability-GPS 轨迹")).toHaveAttribute("data-state", "missing");
  });

  test("renders partial GPS state for backend-flagged invalid coordinates", async ({ page }) => {
    await mockActivityDetail(page, true, [
      metadataRow(0, 35, 139),
      metadataRow(1, 91, 139.1),
      metadataRow(2, 35.2, 181),
    ]);

    await page.goto("/activities/activity-gps");

    await expect(page.getByTestId("gps-partial-state")).toBeVisible();
    await expect(page.getByTestId("gps-map")).toHaveCount(0);
    await expect(page.getByTestId("availability-GPS 轨迹")).toHaveAttribute("data-state", "missing");
  });
});
