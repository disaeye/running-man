import { test, expect } from "@playwright/test";
import { mockDashboard } from "./ux-dashboard-mocks";

test.describe("analysis separates running and strength sessions", () => {
  test("strength activity detail shows exercise and set data", async ({ page }) => {
    await mockDashboard(page, { includeStrengthActivities: true });
    await page.goto("/activities/activity-strength");

    const region = page.getByTestId("strength-session-analysis-detail");
    await expect(region).toBeVisible();
    await expect(page.getByRole("heading", { name: "动作与组数据" })).toBeVisible();
    await expect(region.getByRole("columnheader", { name: "e1RM" })).toBeVisible();
    await expect(region.getByRole("columnheader", { name: "训练量" })).toBeVisible();
    await expect(page.getByTestId("demo-activity-report")).toHaveCount(0);
  });

  test("strength activity with no exercises shows its activity-specific empty state", async ({ page }) => {
    await mockDashboard(page, { includeStrengthActivities: true });
    await page.goto("/activities/activity-strength-empty");

    await expect(page.getByTestId("strength-exercise-empty")).toBeVisible();
    await expect(page.getByText("这次训练没有记录动作组。")).toBeVisible();
    await expect(page.getByTestId("strength-session-analysis-detail")).toHaveCount(0);
  });

  test("run activity detail uses the endurance report, not the strength one", async ({ page }) => {
    await mockDashboard(page);
    await page.goto("/activities/activity-gps");

    await expect(page.getByTestId("demo-activity-report")).toBeVisible();
    await expect(page.getByTestId("strength-session-analysis-detail")).toHaveCount(0);
    await expect(page.getByTestId("strength-exercise-empty")).toHaveCount(0);
  });
});
