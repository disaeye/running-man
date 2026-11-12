import { test, expect } from "@playwright/test";

test.describe("goals settings strength", () => {
  test.describe("goals lifecycle", () => {
    test("renders goals page with create button", async ({ page }) => {
      await page.goto("/goals");
      // 无论是空状态还是有进行中的目标，创建入口都在页头
      await expect(
        page.getByRole("button", { name: "创建目标" }),
      ).toBeVisible({ timeout: 15000 });
    });

    test("shows goals page content @smoke", async ({ page }) => {
      await page.goto("/goals");
      await expect(page.getByText("目标").first()).toBeVisible({ timeout: 15000 });
    });

    test("create button opens form", async ({ page }) => {
      await page.goto("/goals");
      // No `if visible` guard: a conditional body passes vacuously when the
      // button is missing, which is the failure this test exists to catch.
      const createBtn = page.getByRole("button", { name: "创建目标" }).first();
      await expect(createBtn).toBeVisible({ timeout: 15000 });
      await createBtn.click();
      await expect(page.getByRole("dialog", { name: "创建目标" })).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe("settings sections", () => {
    test("renders settings page with section list", async ({ page }) => {
      await page.goto("/settings");
      await expect(page.locator('[data-testid="settings-section-data"]').or(page.locator('[data-testid="settings-section-account"]')).first()).toBeVisible({ timeout: 10000 });
    });

    test("navigates to account section via deep link", async ({ page }) => {
      await page.goto("/settings?section=account");
      await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
    });

    test("navigates to data section via deep link", async ({ page }) => {
      await page.goto("/settings?section=data");
      await expect(page.getByTestId("settings-section-data")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  test.describe("strength workflow (own route, linked from the calendar)", () => {
    test("calendar links to the strength route", async ({ page }) => {
      await page.goto("/calendar?view=list");
      // 真实数据里可能存在名为「力量训练」的活动行（链到活动详情），
      // 入口接 href 定位，不受同名活动干扰。
      const entry = page.locator('a[href="/strength"]');
      await expect(entry).toBeVisible({ timeout: 10000 });
      await entry.click();
      await page.waitForURL(/\/strength$/);
      await expect(page.getByRole("heading", { name: "力量训练" }).first()).toBeVisible({ timeout: 10000 });
    });

    test("strength route shows muscle load analytics", async ({ page }) => {
      await page.goto("/strength");
      await expect(page.getByText("近 4 周肌群训练量")).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole("heading", { name: "动作库" })).toBeVisible({ timeout: 10000 });
    });

    test("strength route renders the strength training session page", async ({ page }) => {
      await page.goto("/strength");
      await expect(page.getByRole("heading", { name: "动作库" })).toBeVisible({
        timeout: 10000,
      });
    });
  });
});
