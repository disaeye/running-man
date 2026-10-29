import { test, expect } from "@playwright/test";
import { mockDashboard } from "./ux-dashboard-mocks";

test.describe("analysis separates running and strength sessions", () => {
  test("strength tab shows activity details and session-based strength metrics", async ({ page }) => {
    await mockDashboard(page, { includeStrengthActivities: true });
    await page.goto("/analysis?tab=strength");

    await expect(page.getByTestId("analysis-strength")).toBeVisible();
    await expect(page.getByRole("heading", { name: "力量训练", exact: true })).toBeVisible();
    await expect(page.getByTestId("strength-session-metrics")).toBeVisible();
    await expect(page.getByRole("heading", { name: "动作与组数据" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "训练量" })).toBeVisible();
    await expect(page.getByText("2 / 2 组", { exact: true })).toBeVisible();
    await expect(page.getByText("已完成", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("strength-analysis-empty")).toHaveCount(0);
    await expect(page.getByTestId("demo-biomechanics-grid")).toHaveCount(0);
    await expect(page.getByTestId("demo-zone-distribution")).toHaveCount(0);
    await expect(page.getByTestId("demo-split-table")).toHaveCount(0);
  });

  test("strength detail keeps activity summary and exercise analysis separate from running metrics", async ({ page }) => {
    await mockDashboard(page, { includeStrengthActivities: true });
    await page.goto("/activities/activity-strength");

    await expect(page.getByTestId("strength-session-metrics")).toBeVisible();
    await expect(page.getByRole("heading", { name: "动作与组数据" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "e1RM" })).toBeVisible();
    await expect(page.getByTestId("demo-activity-hero")).toHaveCount(0);
    await expect(page.getByTestId("demo-biomechanics-grid")).toHaveCount(0);
    await expect(page.getByTestId("demo-zone-distribution")).toHaveCount(0);
    await expect(page.getByTestId("demo-split-table")).toHaveCount(0);
  });

  test("strength activity with no exercises shows its activity-specific empty state", async ({ page }) => {
    await mockDashboard(page, { includeStrengthActivities: true });
    await page.goto("/activities/activity-strength-empty");

    await expect(page.getByTestId("demo-activity-report")).toBeVisible();
    await expect(page.getByText("这次训练没有记录动作组。")).toBeVisible();
    await expect(page.getByTestId("demo-activity-hero")).toHaveCount(0);
  });

  test("running single-session tab stays limited to run activities", async ({ page }) => {
    await mockDashboard(page);
    await page.goto("/analysis?tab=session");

    await expect(page.getByTestId("analysis-session-empty")).toBeVisible();
    await expect(page.getByRole("link", { name: "去同步数据" })).toHaveAttribute(
      "href",
      "/settings?section=data",
    );
    await expect(page.getByTestId("analysis-strength")).toHaveAttribute("hidden", "");
  });
});
