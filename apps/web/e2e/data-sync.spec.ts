import { test, expect } from "@playwright/test";

/**
 * The data section (`/settings?section=data`).
 *
 * Assertions target the section's own testid and the connection status text.
 * They previously matched on "Strava", which has been removed, and on
 * `aria-label="设置详情"`, which no element ever carried — so the tests were
 * passing on an unrelated element or failing for reasons unrelated to the page.
 */
test.describe("Data Sync", () => {
  test("renders the data section with its source list", async ({ page }) => {
    await page.goto("/settings?section=data");

    await expect(page.getByTestId("settings-section-data")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText("数据源连接状态")).toBeVisible();
  });

  test("shows the intervals.icu source and its connection state", async ({ page }) => {
    await page.goto("/settings?section=data");

    // The only supported source. Strava was removed, so asserting its presence
    // would now fail for a reason that is not a regression.
    await expect(page.getByText(/Intervals\.icu/).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows sync health content", async ({ page }) => {
    await page.goto("/settings?section=data");

    await expect(page.getByText("同步稳定性与健康")).toBeVisible({
      timeout: 10000,
    });
  });
});
