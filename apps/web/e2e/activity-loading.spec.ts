import { expect, test } from "@playwright/test";

const activity = {
  activity_id: "activity-loading",
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
  has_gps: false,
  has_hr: true,
  has_power: false,
  has_cadence: true,
};

test("加载骨架匹配核心读数与图表布局", async ({ page }) => {
  await page.route("**/api/v1/activities/activity-loading", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(activity) });
  });
  await page.goto("/activities/activity-loading");
  const skeleton = page.getByTestId("activity-detail-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton.locator("section")).toHaveCount(4);
  await expect(skeleton.locator(".grid.grid-cols-2.sm\\:grid-cols-4 > div")).toHaveCount(4);
});
