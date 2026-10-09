import { expect, test, type Page, type Response } from "@playwright/test";
import type { ActivityDetail, StreamPoint } from "../shared/types/activity";

const EVIDENCE_DIR = "../../../.omo/evidence/running-analysis-gps-forecast-v1/visual";

type ForecastFixture = "empty" | "partial" | "valid";
type SportFixture = "Run" | "Ride";

type ApiFixture = {
  readonly sport: SportFixture;
  readonly forecast: ForecastFixture;
  readonly hasGps: boolean;
  readonly streams: readonly StreamPoint[];
};

const activity: Omit<ActivityDetail, "has_gps"> = {
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

function streamRow(index: number, lat: number | null, lon: number | null): StreamPoint {
  return {
    sample_time: new Date(Date.UTC(2026, 6, 1, 8, 0, index)).toISOString(),
    metric_type: "heart_rate",
    value: 140 + index,
    lat,
    lon,
    alt: 20 + index,
  };
}

function criticalMonitor(page: Page): () => void {
  const consoleErrors: string[] = [];
  const failedAssets: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response: Response) => {
    const url = response.url();
    if (response.status() === 404 && /\/_next\/static|\.js($|\?)/.test(url)) {
      failedAssets.push(`${response.status()} ${url}`);
    }
  });
  return () => {
    expect(consoleErrors, "critical console errors").toEqual([]);
    expect(failedAssets, "critical static asset 404s").toEqual([]);
  };
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png`, fullPage: true, animations: "disabled" });
}

function forecastEvents(fixture: ForecastFixture) {
  return fixture === "empty" ? [] : [{ event_id: "w1", name: "阈值跑", start_time: "2026-07-08T08:00:00Z", category: "workout", status: "planned", done: false, predicted_tss: fixture === "partial" ? null : 64 }];
}

async function mockApi(page: Page, fixture: ApiFixture): Promise<void> {
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const data = responseForPath(url.pathname, fixture);
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "X-API-Version": "1" }, body: JSON.stringify(data) });
  });
}

function responseForPath(pathname: string, fixture: ApiFixture): unknown {
  switch (pathname) {
    case "/api/v1/activities/activity-gps":
      return { ...activity, has_gps: fixture.hasGps };
    case "/api/v1/activities/activity-gps/streams":
      return fixture.streams;
    case "/api/v1/activities/activity-gps/analysis":
      return { laps: [], hr_zones: null, power_curve: [] };
    case "/api/v1/activities":
      return [];
    case "/api/v1/athletes/me":
      return { id: "athlete", email: "qa@example.com", preferred_sport: fixture.sport, lthr: 172, threshold_pace: 245, sex: "male" };
    case "/api/v1/insights/zones":
      return { hr_max: 190, hr_zones: [], power_zones: [] };
    case "/api/v1/wellness":
      return [{ day: "2026-06-30", vo2max: 52.4 }];
    case "/api/v1/insights/ability":
      return [{ date: "2026-06-30", vo2max: 52.4, avgPace: 4.2 }];
    case "/api/v1/insights/personal-records":
      return [];
    case "/api/v1/race/predict":
      return { predictions: [] };
    case "/api/v1/insights/intensity-distribution":
      return { zones: [], summary: null };
    case "/api/v1/insights/readiness":
      return { score: 72, factors: [] };
    case "/api/v1/insights/plan-quality":
      return { grade: "B", score: 82, message: "计划负荷可执行", weekly_tss: 310, target_tss: 360, key_sessions_completed: 2, key_sessions_total: 3, concerns: [] };
    case "/api/v1/calendar":
      return forecastEvents(fixture.forecast);
    case "/api/v1/pmc":
      return Array.from({ length: 10 }, (_, index) => ({ day: `2026-06-${String(20 + index).padStart(2, "0")}`, tss: 45 + index, ctl: 42 + index, atl: 48 + index, tsb: -6 + index }));
    case "/api/v1/workouts/predict":
      return Array.from({ length: 28 }, (_, index) => ({
        day: `2026-07-${String(index + 1).padStart(2, "0")}`,
        projected_tss: index === 7 ? 64 : 0,
        projected_ctl: 50 + index * 0.3,
        projected_atl: 55 - index * 0.1,
        projected_tsb: -4 + index * 0.2,
        projected_acwr: 1.1,
        is_overtraining_risk: false,
        is_high_load_risk: index === 7,
        is_fresh: false,
      }));
    default:
      return [];
  }
}

async function mockActivity(page: Page, hasGps: boolean, streams: readonly StreamPoint[]): Promise<void> {
  await mockApi(page, { sport: "Run", forecast: "empty", hasGps, streams });
}

async function mockCommon(page: Page, sport: SportFixture = "Run"): Promise<void> {
  await mockApi(page, { sport, forecast: "empty", hasGps: false, streams: [] });
}

async function mockForecast(page: Page, fixture: ForecastFixture): Promise<void> {
  await mockApi(page, { sport: "Run", forecast: fixture, hasGps: false, streams: [] });
}

test.describe("Todo 15 deterministic GPS, forecast, and analysis QA", () => {
  test.describe("analysis workflow", () => {
  test("valid GPS activity detail state is deterministic", async ({ page }) => {
    const assertClean = criticalMonitor(page);
    await mockActivity(page, true, [streamRow(0, 35, 139), streamRow(1, 35.1, 139.1), streamRow(2, 35.2, 139.2)]);
    await page.goto("/activities/activity-gps");
    await expect(page.getByTestId("gps-map")).toHaveCount(2);
    await expect(page.getByTestId("gps-track-polyline")).toHaveCount(2);
    await screenshot(page, "activity-gps-valid-1280");
    assertClean();
  });

  test("no GPS activity detail state is deterministic", async ({ page }) => {
    const assertClean = criticalMonitor(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await mockActivity(page, false, [streamRow(0, null, null)]);
    await page.goto("/activities/activity-gps");
    await expect(page.getByTestId("gps-empty-state")).toBeVisible();
    await expect(page.getByTestId("gps-map")).toHaveCount(0);
    await screenshot(page, "activity-gps-empty-375");
    assertClean();
  });

  test("partial GPS activity detail state is deterministic", async ({ page }) => {
    const assertClean = criticalMonitor(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockActivity(page, true, [streamRow(0, 35, 139), streamRow(1, 91, 139.1), streamRow(2, 35.2, 181)]);
    await page.goto("/activities/activity-gps");
    await expect(page.getByTestId("gps-partial-state")).toBeVisible();
    await expect(page.getByTestId("gps-map")).toHaveCount(0);
    await screenshot(page, "activity-gps-partial-768");
    assertClean();
  });

  for (const fixture of ["empty", "partial", "valid"] as const) {
    test(`forecast ${fixture} state is deterministic`, async ({ page }) => {
      const assertClean = criticalMonitor(page);
      await page.setViewportSize({ width: 1280, height: 812 });
      await mockForecast(page, fixture);
      await page.goto("/calendar?view=week");
      const testId = fixture === "valid" ? "plan-forecast-chart" : `plan-forecast-${fixture}`;
      await expect(page.getByTestId(testId)).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await screenshot(page, `forecast-${fixture}-1280`);
      assertClean();
    });
  }

  for (const tab of ["overview", "load", "performance", "intensity"] as const) {
    test(`analysis ${tab} section renders deterministically`, async ({ page }) => {
      const assertClean = criticalMonitor(page);
      await page.setViewportSize({ width: tab === "overview" ? 375 : tab === "load" ? 768 : 1280, height: 900 });
      await mockCommon(page);
      await page.goto(`/analysis?tab=${tab}`);
      const region = tab === "load" ? "analysis-load-adaptation" : tab === "performance" ? "analysis-performance" : tab === "intensity" ? "analysis-intensity" : "analysis-overview";
      await expect(page.getByTestId(region)).toBeVisible();
      await screenshot(page, `analysis-${tab}-${page.viewportSize()?.width ?? 1280}`);
      assertClean();
    });
  }

  test("power metrics are absent for running and honest for cycling", async ({ page }) => {
    // Cycling is still a resolvable sport family, so a Ride profile asks for an
    // FTP card — but power support has been removed and there is no FTP to
    // show. The card must say that rather than print a number, and it must not
    // appear for a runner at all. The previous version of this test asserted a
    // cycle-era contract: that `ftp-history` fed the card and that the running
    // view never mentioned power.
    const assertClean = criticalMonitor(page);
    await mockCommon(page, "Run");
    await page.goto("/analysis?tab=performance");
    await expect(page.getByTestId("primary-running-ftp-card")).toHaveCount(0);
    await expect(page.getByTestId("analysis-ability-summary")).not.toContainText("FTP");
    await screenshot(page, "analysis-running-ftp-semantics-1280");

    await page.unroute(/\/api\/athletes\/me(?:\?.*)?$/);
    await mockCommon(page, "Ride");
    await page.goto("/analysis?tab=performance");
    const cyclingFtp = page.getByTestId("primary-cycling-ftp-card");
    await expect(cyclingFtp).toContainText("FTP");
    await expect(cyclingFtp).toContainText("不再支持");
    await screenshot(page, "analysis-cycling-ftp-semantics-1280");
    assertClean();
  });
  });
});
