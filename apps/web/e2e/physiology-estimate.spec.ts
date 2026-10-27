import { test, expect, type Page } from "@playwright/test";

/**
 * The physiology estimate, as one flow.
 *
 * It used to exist twice: 「自动计算」 inside the parameter form and a separate
 * 「自动估算」 card below it. The second one wrote to the API immediately, so the
 * same estimate had two buttons, two result layouts and two meanings for
 * "apply", and the form above could disagree with what had just been saved.
 *
 * These cases pin the single flow: one trigger, one comparison, applying fills
 * the form without writing, and only 保存 persists.
 */

const API_HEADERS = { "X-API-Version": "1" };

const PROFILE = {
  id: 7,
  email: "qa@example.com",
  name: "Xu Zhe",
  timezone: "Asia/Shanghai",
  hr_max: 190,
  lthr: 165,
  threshold_pace: 272,
  resting_hr: 52,
  dob: "1994-03-02",
  sex: "male",
  weight_goal: 68,
  weekly_training_days: 5,
  max_session_duration_min: 120,
  preferred_sport: "running",
  notification_prefs: null,
};

const ZONES = {
  has_overrides: false,
  hr_max: 190,
  hr_max_estimated: false,
  hr_scheme: "lthr",
  hr_scheme_label: "LTHR",
  hr_schemes: [],
  unavailable_requirements: [],
  lthr: 165,
  resting_hr: 52,
  threshold_pace: 272,
  hr_zones: [
    { zone: 1, name: "恢复", min_pct: 0.6, max_pct: 0.7, min_value: 99, max_value: 116 },
    { zone: 2, name: "有氧", min_pct: 0.7, max_pct: 0.8, min_value: 116, max_value: 132 },
    { zone: 3, name: "节奏", min_pct: 0.8, max_pct: 0.9, min_value: 132, max_value: 149 },
    { zone: 4, name: "阈值", min_pct: 0.9, max_pct: 1.0, min_value: 149, max_value: 165 },
    { zone: 5, name: "最大", min_pct: 1.0, max_pct: null, min_value: 165, max_value: null },
  ],
  pace_zones: [
    { zone: 1, name: "轻松", min_pct: 1.29, max_pct: null, min_value: 350, max_value: null },
    { zone: 2, name: "有氧", min_pct: 1.14, max_pct: 1.29, min_value: 310, max_value: 350 },
    { zone: 3, name: "节奏", min_pct: 1.06, max_pct: 1.14, min_value: 288, max_value: 310 },
    { zone: 4, name: "阈值", min_pct: 1.0, max_pct: 1.06, min_value: 272, max_value: 288 },
    { zone: 5, name: "最大", min_pct: 0.0, max_pct: 1.0, min_value: 240, max_value: 272 },
  ],
};

const ESTIMATE = {
  hr_max: {
    hr_max: 186,
    method: "tangent",
    confidence: "medium",
    data_sufficient: true,
    near_max_count: 4,
    session_count: 12,
    required_sessions: 5,
    input_window_days: 42,
    algorithm_version: "1.0.0",
  },
  lthr: {
    lthr: null,
    method: null,
    confidence: null,
    data_sufficient: false,
    near_threshold_count: 2,
    source_20min: null,
    source_60min: null,
    required_efforts: 5,
    input_window_days: 42,
    algorithm_version: "1.0.0",
  },
  threshold_pace: {
    threshold_pace_s_per_km: 265,
    critical_speed_ms: 3.9,
    critical_speed_s_per_km: 271,
    method: "daniels_vdot_threshold",
    confidence: "high",
    data_sufficient: true,
    effort_count: 6,
    required_efforts: 4,
    input_window_days: 42,
    algorithm_version: "1.0.0",
  },
  computed_at: "2026-10-22T01:41:00Z",
};

async function mockSettings(page: Page, writes: string[]): Promise<void> {
  // The mock keeps the saved profile, so a PUT is visible on the next GET the
  // way the real API behaves (a new dated threshold step).
  let profile = { ...PROFILE };

  page.on("request", (request) => {
    if (request.method() === "PUT" || request.method() === "POST") {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });

  await page.route("**/api/v1/athletes/me", (route) => {
    if (route.request().method() === "PUT") {
      profile = { ...profile, ...(JSON.parse(route.request().postData() ?? "{}") as object) };
    }
    void route.fulfill({ json: profile, headers: API_HEADERS });
  });
  await page.route("**/api/v1/insights/zones", (route) =>
    route.fulfill({ json: ZONES, headers: API_HEADERS }),
  );
  await page.route("**/api/v1/athletes/me/auto-calculate", (route) =>
    route.fulfill({ json: ESTIMATE, headers: API_HEADERS }),
  );
  await page.route("**/api/v1/athletes/me/physiology", (route) =>
    route.fulfill({
      json: {
        hr_max: 190,
        lthr: 165,
        threshold_pace: 272,
        data_sufficient: true,
        confidence: "cached",
        algorithm_version: "1.0.0",
        computation_run_id: null,
        freshness: "fresh",
        source: "derived_metric_facts",
        computed_at: "2026-10-21T23:05:00Z",
      },
      headers: API_HEADERS,
    }),
  );
  await page.route("**/api/v1/integrations**", (route) => route.fulfill({ json: [], headers: API_HEADERS }));
}

test.describe("physiology estimate", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("one trigger, one comparison, and applying does not write", async ({ page }) => {
    const writes: string[] = [];
    await mockSettings(page, writes);
    await page.goto("/settings?section=training");

    const panel = page.getByTestId("physiology-estimate");
    await expect(panel).toBeVisible();
    // The stored estimate's timestamp is readable before anything is pressed.
    await expect(page.getByTestId("estimate-computed-at")).toHaveText(
      /上次估算 \d{2}-\d{2} \d{2}:\d{2}/,
    );
    // One estimate entry point on the section, not two.
    await expect(page.getByRole("button", { name: /估算/ })).toHaveCount(1);

    // Every field says where its number comes from: the three the estimator can
    // derive, the two carried in from synced wellness data, and the two only the
    // athlete knows. Weight is read from Intervals.icu, not calculated.
    await expect(page.getByLabel("最大心率 (bpm)")).toHaveAccessibleName(/自动估算/);
    await expect(page.getByLabel("乳酸阈值心率 (bpm)")).toHaveAccessibleName(/自动估算/);
    // Threshold pace is a two-input group with a fixed aria-label, so its source
    // tag is asserted on the field label rather than the group.
    await expect(
      page.locator("label").filter({ hasText: "阈值配速 (min/km)" }),
    ).toContainText("自动估算");
    await expect(page.getByLabel("静息心率 (bpm)")).toHaveAccessibleName(/同步带入/);
    await expect(page.getByLabel("体重 (kg)")).toHaveAccessibleName(/同步带入/);
    await expect(page.getByLabel("出生日期")).toHaveAccessibleName(/手动填写/);
    await expect(page.getByLabel("性别")).toHaveAccessibleName(/手动填写/);

    await panel.getByRole("button", { name: "开始估算" }).click();

    const hrRow = page.getByTestId("estimate-row-hr_max");
    await expect(hrRow).toContainText("190 bpm");
    await expect(hrRow).toContainText("186 bpm");
    await expect(hrRow).toContainText("12 次活动");
    // The row states the direction of the change; no confidence grade, because
    // a grade asks the athlete to trust a label rather than read two numbers.
    await expect(hrRow).toContainText("退步");
    await expect(hrRow).not.toContainText("置信度");

    // Pace is seconds per kilometre on both sides; formatting it as a speed
    // printed 0'03" for a 4:54 threshold. Faster is 进步 here even though the
    // number went down.
    const paceRow = page.getByTestId("estimate-row-threshold_pace");
    await expect(paceRow).toContainText("4'32\"");
    await expect(paceRow).toContainText("4'25\"");
    await expect(paceRow).toContainText("进步");
    await expect(paceRow).toContainText("6 次跑步");
    await expect(paceRow).toContainText("跑力换算");

    // The estimator refused LTHR; the row says what it needs, from the API's
    // own rule rather than a number typed into the component.
    const lthrRow = page.getByTestId("estimate-row-lthr");
    await expect(page.getByTestId("estimate-short-lthr")).toContainText("需要至少 5 次");
    await expect(page.getByTestId("estimate-short-lthr")).toContainText("目前 2 次");
    await expect(lthrRow.getByRole("button", { name: "采用" })).toHaveCount(0);

    // Applying fills the form. It must not save: the write belongs to 保存.
    await hrRow.getByRole("button", { name: "采用" }).click();
    await expect(page.getByLabel("最大心率 (bpm)")).toHaveValue("186");
    await expect(page.getByRole("button", { name: "保存" })).toBeEnabled();
    expect(writes).not.toContain("PUT /api/v1/athletes/me");
    expect(writes.filter((entry) => entry.endsWith("/auto-calculate"))).toHaveLength(1);
  });

  test("all applicable estimates can be applied at once", async ({ page }) => {
    const writes: string[] = [];
    await mockSettings(page, writes);
    await page.goto("/settings?section=training");

    await page.getByTestId("physiology-estimate").getByRole("button", { name: "开始估算" }).click();
    await page.getByRole("button", { name: "全部采用" }).click();

    await expect(page.getByLabel("最大心率 (bpm)")).toHaveValue("186");
    const paceGroup = page.getByRole("group", { name: "阈值配速" });
    await expect(paceGroup.getByLabel("分")).toHaveValue("4");
    await expect(paceGroup.getByLabel("秒")).toHaveValue("25");
    // LTHR had no estimate, so its field keeps the saved value.
    await expect(page.getByLabel("乳酸阈值心率 (bpm)")).toHaveValue("165");
    expect(writes).not.toContain("PUT /api/v1/athletes/me");
  });

  test("saving revalidates the zone tables", async ({ page }) => {
    const writes: string[] = [];
    await mockSettings(page, writes);

    let zoneReads = 0;
    await page.route("**/api/v1/insights/zones", (route) => {
      zoneReads += 1;
      void route.fulfill({ json: ZONES, headers: API_HEADERS });
    });

    await page.goto("/settings?section=training");
    const before = zoneReads;

    await page.getByLabel("乳酸阈值心率 (bpm)").fill("168");
    await page.getByRole("button", { name: "保存" }).click();

    await expect(page.getByRole("status")).toContainText("已保存");
    // A threshold save changes the boundaries derived from it, so the zone
    // query must refetch instead of showing the previous LTHR's zones.
    await expect.poll(() => zoneReads).toBeGreaterThan(before);
    expect(writes).toContain("PUT /api/v1/athletes/me");
  });
});
