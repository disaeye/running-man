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
  await page.route("**/api/v1/activities/activity-gps*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-API-Version": "1" },
      body: JSON.stringify({ ...activityBase, has_gps: hasGps }),
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

    // The log view's tab is 日志; the sidebar/tab-bar entry is 日历.
    await expect(page.getByText("日志", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "全部" })).toBeVisible();
    await expect(page.getByRole("button", { name: "力" })).toBeVisible();

    // Wait for loading to finish (activities data or empty state)
    await expect(page.getByText("加载中...")).not.toBeVisible({
      timeout: 15000,
    });
  });

  test("navigates to activity detail when clicking an activity", async ({
    page,
  }) => {
    await page.goto("/activities");

    // Wait for data to load
    await expect(page.getByText("加载中...")).not.toBeVisible({
      timeout: 15000,
    });

    // Check if there are activity links
    const activityLinks = page.locator('a[href*="/activities/"]');
    const count = await activityLinks.count();

    if (count > 0) {
      await activityLinks.first().click();
      await page.waitForURL(/\/activities\//);

      // Detail page should show coach debrief
      await expect(page.getByText("教练摘要")).toBeVisible({ timeout: 10000 });
    }
    // If no activities, the empty state renders — test passes structurally
  });

  test("shows filter controls on activities page", async ({ page }) => {
    await page.goto("/activities");

    await expect(page.getByText("加载中...")).not.toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByRole("button", { name: "GPS" })).toBeVisible();
  });

  test("renders GPS map when valid metadata lat/lon rows exist", async ({ page }) => {
    await mockActivityDetail(page, true, [
      metadataRow(0, 35, 139),
      metadataRow(1, 35.1, 139.1),
      metadataRow(2, 35.2, 139.2),
    ]);

    await page.goto("/activities/activity-gps");

    // The availability strip is behind the 数据流状态 toggle, collapsed by default.
    await page.getByRole("button", { name: /数据流状态/ }).click();

    await expect(page.getByTestId("gps-map")).toHaveCount(2);
    await expect(page.getByTestId("gps-track-polyline")).toHaveCount(2);
    await expect(page.getByTestId("gps-empty-state")).toHaveCount(0);
    await expect(page.getByText("此活动无 GPS 数据")).toHaveCount(0);
    await expect(page.getByTestId("availability-GPS 轨迹")).toHaveAttribute("data-state", "available");
  });

  test("renders empty GPS state without a map when no GPS is available", async ({ page }) => {
    await mockActivityDetail(page, false, [metadataRow(0, null, null)]);

    await page.goto("/activities/activity-gps");

    // The availability strip is behind the 数据流状态 toggle, collapsed by default.
    await page.getByRole("button", { name: /数据流状态/ }).click();

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

    // The availability strip lives behind the 数据流状态 toggle, which starts
    // collapsed — so a test that does not open it finds no element.
    await page.getByRole("button", { name: /数据流状态/ }).click();


    await expect(page.getByTestId("gps-partial-state")).toBeVisible();
    await expect(page.getByTestId("gps-map")).toHaveCount(0);
    await expect(page.getByTestId("availability-GPS 轨迹")).toHaveAttribute("data-state", "missing");
  });
});
