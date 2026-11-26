/**
 * 训练工作区工作流：共享页头与二级导航、周历/月历切换、锚点日期导航、
 * 计划与实际对照、唯一的添加入口与移动端首屏顺序。
 */
import { test, expect, type Page } from "@playwright/test";

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

async function gotoCalendar(page: Page): Promise<void> {
  await page.goto("/calendar");
  await expect(page.getByTestId("plan-week-grid")).toBeVisible({ timeout: 15000 });
}

test.describe("training workflow", () => {
  test.describe("shared header and tabs", () => {
    test("the header is titled 训练 and the calendar tab is active @smoke", async ({ page }) => {
      await gotoCalendar(page);
      await expect(page.locator('[data-shell-region="main"] h1')).toHaveText("训练");
      await expect(page.getByTestId("training-tab-calendar")).toHaveAttribute("aria-current", "page");
      await expect(page.getByTestId("training-tabs").getByRole("link")).toHaveCount(3);
    });

    test("tabs switch between the archive and the strength workbench without carrying query params", async ({ page }) => {
      await page.goto("/calendar?view=month&sport=strength");
      await page.getByTestId("training-tab-activities").click();
      await page.waitForURL(/\/activities$/);
      await expect(page.getByTestId("training-tab-activities")).toHaveAttribute("aria-current", "page");
      await expect(page.getByTestId("activities-page")).toBeVisible({ timeout: 15000 });
      await page.getByTestId("training-tab-strength").click();
      await page.waitForURL(/\/strength$/);
      await expect(page.getByTestId("training-tab-strength")).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { name: "动作库" })).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe("view switching via URL state", () => {
    test("week view renders by default", async ({ page }) => {
      await gotoCalendar(page);
      await expect(page).toHaveURL(/\/calendar$/);
      const switcher = page.getByTestId("calendar-view-switch");
      await expect(switcher.getByRole("button", { name: "周历" })).toHaveAttribute("aria-pressed", "true");
    });

    test("month view activates via ?view=month deep link", async ({ page }) => {
      await page.goto("/calendar?view=month");
      await expect(
        page.getByTestId("calendar-view-switch").getByRole("button", { name: "月历" }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("plan-month-grid")).toBeVisible({ timeout: 15000 });
      await expect(page.locator('[data-testid^="plan-month-day-"]').first()).toBeVisible({ timeout: 15000 });
    });

    test("switching views writes ?view= and keeps the anchor date", async ({ page }) => {
      await page.goto("/calendar?date=2026-10-28");
      await expect(page.getByTestId("plan-week-grid")).toBeVisible({ timeout: 15000 });
      await page.getByTestId("calendar-view-switch").getByRole("button", { name: "月历" }).click();
      await expect(page).toHaveURL(/view=month/);
      await expect(page).toHaveURL(/date=2026-10-28/);
      await expect(page.getByText("10 月训练日历")).toBeVisible();
    });

    test("the retired log view redirects to the archive", async ({ page }) => {
      await page.goto("/calendar?view=list");
      await expect(page).toHaveURL(/\/activities$/);
      await expect(page.getByTestId("activities-page")).toBeVisible({ timeout: 15000 });
    });

    test("unknown ?view= falls back to week", async ({ page }) => {
      await page.goto("/calendar?view=hour");
      await expect(page.getByTestId("plan-week-grid")).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe("anchor date navigation", () => {
    test("上一周 writes ?date= and 今天 clears it", async ({ page }) => {
      await gotoCalendar(page);
      await page.getByRole("button", { name: "上一周" }).click();
      await expect(page).toHaveURL(/[?&]date=\d{4}-\d{2}-\d{2}$/);
      await expect(page.getByTestId("training-period-summary")).toContainText("该周");
      await page.getByTestId("week-back-to-today").click();
      await expect(page).toHaveURL(/\/calendar$/);
    });

    test("月历点击日期直接打开单日抽屉", async ({ page }) => {
      await page.goto("/calendar?view=month");
      const cell = page.locator('[data-testid^="plan-month-day-"]').first();
      await expect(cell).toBeVisible({ timeout: 15000 });
      await cell.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("tab", { name: "回顾" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "补录" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "编排" })).toBeVisible();
    });
  });

  test.describe("planned vs completed comparison", () => {
    test("month view renders day cells with fixed load levels", async ({ page }) => {
      await page.goto("/calendar?view=month");
      const dayCells = page.locator('[data-testid^="plan-month-day-"]');
      await expect(dayCells.first()).toBeVisible({ timeout: 15000 });
      const level = await dayCells.first().getAttribute("data-level");
      expect(Number(level)).toBeGreaterThanOrEqual(0);
      expect(Number(level)).toBeLessThanOrEqual(4);
    });
  });

  test.describe("mobile summary", () => {
    test.use({ viewport: MOBILE });

    test("period comparison labels are visible", async ({ page }) => {
      await page.goto("/calendar");
      const summary = page.getByTestId("training-period-summary");
      await expect(summary).toBeVisible({ timeout: 15000 });
      await expect(summary).toContainText(/本周(完成度|训练汇总)/);
      await expect(summary).toContainText("次数");
      await expect(summary).toContainText("距离");
      await expect(summary).toContainText("时长");
      await expect(summary).toContainText("TSS");
    });
  });

  test.describe("desktop summary", () => {
    test.use({ viewport: DESKTOP });

    test("range is visible and matches the week grid", async ({ page }) => {
      await page.goto("/calendar");
      const summary = page.getByTestId("training-period-summary");
      await expect(summary).toBeVisible();
      const range = await summary.getByTestId("period-range").textContent();
      const dates = range?.match(/\d{2}-\d{2} – \d{2}-\d{2}/)?.[0] ?? "";
      expect(dates).toMatch(/\d{2}-\d{2} – \d{2}-\d{2}/);
      await expect(page.getByTestId("plan-week-grid")).toContainText(dates);
    });
  });

  test.describe("calendar page structure", () => {
    test("an empty day opens the plan tab and can prefill a strength log", async ({ page }) => {
      const date = "2000-06-01";
      await page.goto(`/calendar?date=${date}`);
      await expect(page.locator('[data-testid^="plan-week-day-"]')).toHaveCount(7);
      await page.getByTestId(`plan-week-day-${date}`).click();
      await expect(page.getByRole("tab", { name: "编排" })).toHaveAttribute("aria-selected", "true");
      await page.getByRole("tab", { name: "补录" }).click();
      await page.getByTestId("day-log-strength").click();
      await expect(page).toHaveURL(`/strength?tab=log&date=${date}`);
      await page.getByRole("button", { name: /本次训练信息/ }).click();
      await expect(page.getByLabel("训练日期")).toHaveValue(date);
    });

    test("the strength family chip filters the calendar in place", async ({ page }) => {
      await gotoCalendar(page);
      const strengthBtn = page.getByRole("button", { name: "力量训练", exact: true });
      await strengthBtn.click();
      await expect(page).toHaveURL(/\/calendar\?.*sport=strength/);
      await expect(strengthBtn).toHaveAttribute("aria-pressed", "true");
    });
  });

  test("activity detail returns to the archive with its list view and date filters", async ({ page }) => {
    const archive = "/activities?view=list&from=2026-01-01&to=2026-12-31";
    await page.goto(archive);
    await page.getByTestId("activity-session-list").getByRole("link").first().click();
    await expect(page.getByTestId("activity-detail-page")).toBeVisible();
    await expect(page.getByTestId("training-tabs")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "训练" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expect(page).toHaveURL(archive);
  });

  test.describe("add entry (desktop)", () => {
    test.use({ viewport: DESKTOP });

    test("one header button opens the grouped add sheet", async ({ page }) => {
      await gotoCalendar(page);
      const button = page.getByTestId("training-add-button");
      await expect(button).toBeVisible();
      await expect(page.getByTestId("training-add-fab")).toBeHidden();
      await button.click();
      const sheet = page.getByRole("dialog");
      await expect(sheet.getByTestId("training-add-title")).toHaveText("添加训练");
      await expect(sheet.getByTestId("training-add-strength")).toHaveAttribute("href", /^\/strength/);
      await expect(sheet.getByRole("button", { name: /手动补录活动/ })).toBeVisible();
      await expect(sheet.getByRole("button", { name: /导入训练文件/ })).toBeVisible();
      await expect(sheet.getByRole("button", { name: /编排单日课表/ })).toBeVisible();
      await expect(sheet.getByRole("button", { name: /按目标生成周期计划/ })).toBeVisible();
    });

    test("按目标生成周期计划 closes the sheet before opening the generate dialog", async ({ page }) => {
      await gotoCalendar(page);
      await page.getByTestId("training-add-button").click();
      await page.getByRole("button", { name: /按目标生成周期计划/ }).click();
      await expect(page.getByRole("heading", { name: "从目标生成训练计划" })).toBeVisible();
      await expect(page.getByTestId("training-add-title")).toHaveCount(0);
    });
  });

  test.describe("add entry (mobile)", () => {
    test.use({ viewport: MOBILE });

    test("the FAB opens the add sheet directly while the header button is hidden", async ({ page }) => {
      await gotoCalendar(page);
      await expect(page.getByTestId("training-add-button")).toBeHidden();
      const fab = page.getByTestId("training-add-fab");
      await expect(fab).toBeVisible();
      await fab.click();
      await expect(page.getByRole("dialog").getByTestId("training-add-title")).toHaveText("添加训练");
    });
  });
});
