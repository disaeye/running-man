import { test, expect } from "@playwright/test";

test.describe("goals settings strength", () => {
  test.describe("goals lifecycle", () => {
    test("renders goals page with create button", async ({ page }) => {
      await page.goto("/goals");
      // An empty account carries the only create action in its empty state, so
      // the header button is hidden; both labels open the same form.
      await expect(
        page.getByRole("button", { name: /创建(新|第一个)目标/ }).first(),
      ).toBeVisible({ timeout: 15000 });
    });

    test("shows goals page content", async ({ page }) => {
      await page.goto("/goals");
      await expect(page.getByText("目标").first()).toBeVisible({ timeout: 15000 });
    });

    test("create button opens form", async ({ page }) => {
      await page.goto("/goals");
      // No `if visible` guard: a conditional body passes vacuously when the
      // button is missing, which is the failure this test exists to catch.
      const createBtn = page.getByRole("button", { name: /创建(新|第一个)目标/ }).first();
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

  test.describe("strength workflow (rendered inside the calendar log view)", () => {
    test("strength content renders on the calendar page", async ({ page }) => {
      await page.goto("/calendar?view=list");
      await expect(page.getByRole("heading", { name: "训练日志" }).first()).toBeVisible({
        timeout: 10000,
      });
    });

    test("strength view shows analytics area", async ({ page }) => {
      await page.goto("/calendar?view=list");
      await expect(page.getByRole("heading", { name: "力量分析" }).first()).toBeVisible();
    });

    test("legacy /strength redirects to the calendar log view", async ({ page }) => {
      await page.goto("/strength");
      await expect(page).toHaveURL(/calendar\?view=list/);
    });
  });
});
