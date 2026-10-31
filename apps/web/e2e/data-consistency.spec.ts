import { test, expect, type Page } from "@playwright/test";

/**
 * The dashboard and the data page must not disagree about the connection.
 *
 * The Today page used to derive "you have no data" from the last seven days
 * and answer it with a setup card whose first step was 「连接数据源 / 去连接」,
 * whether or not Intervals.icu was connected. An athlete who had connected and
 * synced was told to connect while the data page showed 已连接 — and an athlete
 * who had rested for a week received the same instruction despite having prior activity records.
 *
 * These cases pin the three connection states.
 */

const NOW = new Date();
const ISO_DAY = (daysAgo: number): string =>
  new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() - daysAgo))
    .toISOString()
    .slice(0, 10);
const ISO_TIME = (daysAgo: number): string => `${ISO_DAY(daysAgo)}T06:00:00+00:00`;

interface Freshness {
  readonly daysAgo: number | null;
  readonly bucket: "fresh" | "stale" | "missing";
}

function integration(connected: boolean, freshness: Freshness) {
  return {
    source: "intervals_icu",
    connected,
    settings: { sync_frequency: "daily", auto_sync: true },
    name: "Intervals.icu",
    created_at: null,
    updated_at: null,
    last_sync_detail: null,
    last_sync_error: null,
    last_sync_at: connected ? ISO_TIME(0) : null,
    last_sync_status: connected ? "success" : null,
    data_as_of: freshness.daysAgo === null ? null : ISO_TIME(freshness.daysAgo),
    staleness_bucket: freshness.bucket,
  };
}

function coachContext(freshness: Freshness) {
  const entry = {
    data_as_of: freshness.daysAgo === null ? null : ISO_DAY(freshness.daysAgo),
    staleness_bucket: freshness.bucket,
  };
  return {
    data_freshness: { activities: entry, wellness: entry },
    missing_data_caveats: [],
    plan_adherence: { adherence_pct: 0, completed_tss_7d: 0, planned_tss_7d: 0 },
    readiness: {
      data_sufficient: false,
      factors: [],
      level: "moderate",
      max_intensity: "moderate",
      recommendation: "",
      score: 50,
    },
    recent_load: {
      ctl_history_days: 0,
      ctl_warming_up: true,
      current_atl: 0,
      current_ctl: 0,
      current_tsb: 0,
      d28_tss: 0,
      d7_tss: 0,
      d90_tss: 0,
    },
    recommendation: {
      action: "rest",
      duration_min: 0,
      intensity: "none",
      next_workout: null,
      pace_targets: null,
      reason: "",
      risks: [],
      target_tss: 0,
      workout_type: "rest",
    },
    recovery_signals: {
      hrv_trend_direction: "stable",
      readiness_score: 50,
      rhr_trend_direction: "stable",
      sleep_avg_7d: 0,
    },
  };
}

const API_HEADERS = { "X-API-Version": "1" };

function json(route: import("@playwright/test").Route, body: unknown): Promise<void> {
  return route.fulfill({ json: body, headers: API_HEADERS });
}

async function mockBackend(
  page: Page,
  options: { connected: boolean; freshness: Freshness; withLoad: boolean },
): Promise<void> {
  const { connected, freshness, withLoad } = options;

  const integrationResponse = integration(connected, freshness);
  await page.route("**/api/v1/integrations/intervals_icu", (route) =>
    json(route, integrationResponse),
  );
  await page.route("**/api/v1/integrations", (route) =>
    json(route, connected ? [integrationResponse] : []),
  );
  await page.route("**/api/v1/insights/coach-context*", (route) => json(route, coachContext(freshness)));
  await page.route("**/api/v1/activities*", (route) => json(route, []));
  await page.route("**/api/v1/metrics/series/batch*", (route) => json(route, []));
  await page.route("**/api/v1/pmc*", (route) =>
    json(
      route,
      withLoad
        ? [
            {
              day: ISO_DAY(6),
              ctl: 40,
              atl: 42,
              tsb: -2,
              tss: 50,
              acwr: 1.02,
              mode: "authoritative_all_sports",
              ctl_warming_up: false,
              algorithm_version: "1.0.0",
            },
            {
              day: ISO_DAY(1),
              ctl: 42,
              atl: 44,
              tsb: -2,
              tss: 55,
              acwr: 1.05,
              mode: "authoritative_all_sports",
              ctl_warming_up: false,
              algorithm_version: "1.0.0",
            },
          ]
        : [],
    ),
  );
}

const CONNECTED_NO_DATA = { connected: true, freshness: { daysAgo: null, bucket: "missing" } as const };
const CONNECTED_OLD_DATA = { connected: true, freshness: { daysAgo: 5, bucket: "stale" } as const };
const DISCONNECTED = { connected: false, freshness: { daysAgo: null, bucket: "missing" } as const };

test.describe("connection state consistency", () => {
  test("connected with nothing synced yet never asks to connect", async ({ page }) => {
    await mockBackend(page, { ...CONNECTED_NO_DATA, withLoad: false });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const setup = page.getByTestId("home-starting-point");
    await expect(setup).toBeVisible();
    await expect(setup).toContainText("已连接，还没有同步到训练数据");
    await expect(page.getByRole("link", { name: "去连接" })).toHaveCount(0);
    await expect(page.getByTestId("home-portrait")).not.toContainText("未连接数据源");
    await expect(page.getByTestId("home-portrait")).toContainText("已连接，等待首次同步");
    await expect(page.getByTestId("home-portrait")).not.toContainText("数据已过期");
  });

  test("a disconnected account is asked to connect", async ({ page }) => {
    await mockBackend(page, { ...DISCONNECTED, withLoad: false });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const setup = page.getByTestId("home-starting-point");
    await expect(setup).toBeVisible();
    await expect(page.getByRole("link", { name: "去连接" })).toHaveCount(1);
    await expect(page.getByTestId("home-portrait")).toContainText("未连接数据源");
  });

  test("old but present data keeps the dashboard and never reads as unconnected", async ({
    page,
  }) => {
    await mockBackend(page, { ...CONNECTED_OLD_DATA, withLoad: true });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("home-readings")).toBeVisible();
    await expect(page.getByTestId("home-starting-point")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "去连接" })).toHaveCount(0);
    // Age is stated as a fact, not as an alarm, and never as a missing source.
    await expect(page.getByTestId("home-portrait")).toContainText("数据截至");
    await expect(page.getByTestId("home-portrait")).not.toContainText("数据已过期");
    await expect(page.getByTestId("home-portrait")).not.toContainText("未连接数据源");
  });
});
