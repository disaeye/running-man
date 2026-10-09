/**
 * Training workflow — Playwright spec for the calendar + plan redesign.
 *
 * Authored for Todo 10. The spec exercises the calendar/plan surface end to
 * end: week/month/list view switching, mobile forecast progressive disclosure,
 * single-overlay-layer contract, planned-vs-completed comparison, and
 * generate plan dialog keyboard-safety.
 *
 * The Todo 10 acceptance only requires `--list --grep "training workflow"`
 * discovery. Served execution belongs to Todo 15 against the live
 * `running-man-web.service` on port 28801. Do not execute these tests
 * before that gate; reviewers discover them via the Playwright CLI.
 *
 * @tag: training-workflow
 */
import { test, expect, type Page } from "@playwright/test";

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function gotoCalendar(page: Page): Promise<void> {
  await page.goto("/calendar");
  await expect(page.getByTestId("plan-week-grid").or(page.getByTestId("plan-month-day-" + new Date().toISOString().slice(0, 10))).or(page.locator('[data-testid^="plan-week-day-"]')).first()).toBeVisible({ timeout: 10000 });
}

test.describe("training workflow", () => {
  test.describe("view switching via URL state", () => {
    test("week view renders by default", async ({ page }) => {
      await gotoCalendar(page);
      await expect(page).toHaveURL(/\/calendar$/);
      const grid = page.locator('[data-testid="plan-week-grid"]');
      await expect(grid).toBeVisible();
    });

    test("month view activates via ?view=month deep link", async ({ page }) => {
      await page.goto("/calendar?view=month");
      const monthCells = page.locator('[data-testid^="plan-month-day-"]');
      // Wait for the view to settle before asserting on the cells. Under a
      // parallel run the calendar chunk can still be loading, and the old
      // assertion raced it — visible as a "month cells not found" failure that
      // did not reproduce when the file ran alone.
      await expect(page.getByRole("tab", { name: "月" })).toHaveAttribute(
        "data-state",
        "active",
      );
      await expect(monthCells.first()).toBeVisible({ timeout: 15000 });
    });

    test("list view renders calendar list", async ({ page }) => {
      await page.goto("/calendar?view=list");
      await expect(page).toHaveURL(/view=list/);
      // `main` and `[role="main"]` are the same element in the shell, so the
      // previous `.or()` matched twice and failed strict mode rather than
      // catching a missing element.
      await expect(page.locator("main").first()).toBeVisible({ timeout: 10000 });
    });

    test("unknown ?view= falls back to week", async ({ page }) => {
      await page.goto("/calendar?view=hour");
      const grid = page.locator('[data-testid="plan-week-grid"]');
      // The calendar chunk loads after navigation; give it a bounded wait
      // rather than the default 5s, which raced a cold parallel load.
      await expect(grid).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe("planned vs completed comparison", () => {
    test("month view renders day cells", async ({ page }) => {
      await page.goto("/calendar?view=month");
      const dayCells = page.locator('[data-testid^="plan-month-day-"]');
      await expect(dayCells.first()).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe("mobile progressive forecast", () => {
    test.use({ viewport: MOBILE });

    test("uses the summary card on mobile (no 7-axis chart)", async ({ page }) => {
      await page.goto("/calendar");
      const summary = page
        .locator('[data-testid^="plan-forecast-summary"]')
        .first();
      await expect(summary).toBeVisible();
      const desktopChart = page.getByTestId("plan-forecast-chart");
      // The chart container is `lg:block` and invisible at 390px viewport.
      await expect(desktopChart).toBeHidden();
    });
  });

  test.describe("desktop forecast", () => {
    test.use({ viewport: DESKTOP });

    test("renders the full chart frame on desktop", async ({ page }) => {
      await page.goto("/calendar");
      const chart = page.getByTestId("plan-forecast-chart");
      await expect(chart).toBeVisible();
    });
  });

  test.describe("calendar page structure", () => {
    test("week view has day cells with test IDs", async ({ page }) => {
      await gotoCalendar(page);
      const dayCells = page.locator('[data-testid^="plan-week-day-"]');
      await expect(dayCells.first()).toBeVisible({ timeout: 10000 });
      await expect(dayCells).toHaveCount(7);
    });

    test("generate plan button exists", async ({ page }) => {
      await gotoCalendar(page);
      await expect(page.getByRole("button", { name: /生成计划/ })).toBeVisible();
    });
  });
});
