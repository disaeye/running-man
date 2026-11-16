/**
 * 训练页工作流：视图切换、计划与实际对照、录入入口与移动端首屏顺序。
 */
import { test, expect, type Page } from "@playwright/test";

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

async function gotoCalendar(page: Page): Promise<void> {
  await page.goto("/calendar");
  await expect(page.getByTestId("plan-week-grid")).toBeVisible({ timeout: 15000 });
}

test.describe("training workflow", () => {
  test.describe("view switching via URL state", () => {
    test("week view renders by default @smoke", async ({ page }) => {
      await gotoCalendar(page);
      await expect(page).toHaveURL(/\/calendar$/);
      await expect(page.getByTestId("plan-week-grid")).toBeVisible();
      await expect(page.getByRole("tab", { name: "本周" })).toHaveAttribute("aria-selected", "true");
    });

    test("month view activates via ?view=month deep link", async ({ page }) => {
      await page.goto("/calendar?view=month");
      await expect(page.getByRole("tab", { name: "负荷" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.getByTestId("plan-month-grid")).toBeVisible({ timeout: 15000 });
      await expect(page.locator('[data-testid^="plan-month-day-"]').first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId("month-legend")).toContainText("档位按近 8 周固定分位");
    });

    test("list view renders the activity stream", async ({ page }) => {
      await page.goto("/calendar?view=list");
      await expect(page).toHaveURL(/view=list/);
      await expect(page.getByRole("tab", { name: "记录" })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByText("全部活动")).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole("button", { name: /加载更早/ })).toBeVisible();
    });

    test("unknown ?view= falls back to week", async ({ page }) => {
      await page.goto("/calendar?view=hour");
      await expect(page.getByTestId("plan-week-grid")).toBeVisible({ timeout: 15000 });
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
    test("only days with content or today are rendered", async ({ page }) => {
      await gotoCalendar(page);
      const dayCells = page.locator('[data-testid^="plan-week-day-"]');
      await expect(dayCells.first()).toBeVisible({ timeout: 15000 });
      expect(await dayCells.count()).toBeLessThanOrEqual(7);
    });

    test("creation actions sit behind one FAB button", async ({ page }) => {
      await gotoCalendar(page);
      const fab = page.getByLabel("展开训练操作");
      await expect(fab).toBeVisible();
      await expect(page.getByLabel("导入文件")).toHaveCount(0);
      await expect(page.getByLabel("手动添加")).toHaveCount(0);
      // 展开后三个动作项都在菜单里。
      await fab.click();
      const menu = page.getByRole("menu", { name: "训练操作" });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: /记录训练/ })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: /生成计划/ })).toBeVisible();
    });

    test("the strength family chip leads to the strength view", async ({ page }) => {
      await gotoCalendar(page);
      await page.getByRole("button", { name: "力量训练" }).click();
      await page.waitForURL(/\/strength$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  });
});
