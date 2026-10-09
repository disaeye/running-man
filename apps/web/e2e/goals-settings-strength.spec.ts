import { test, expect } from "@playwright/test";

test.describe("goals settings strength", () => {
  test.describe("goals lifecycle", () => {
    test("renders goals page with create button", async ({ page }) => {
      await page.goto("/goals");
      await expect(page.getByRole("button", { name: /创建新目标/ })).toBeVisible();
    });

    test("shows goals page content", async ({ page }) => {
      await page.goto("/goals");
      await expect(page.getByText("目标").first()).toBeVisible({ timeout: 15000 });
    });

    test("create button opens form", async ({ page }) => {
      await page.goto("/goals");
      const createBtn = page.getByRole("button", { name: /创建新目标/ });
      if (await createBtn.isVisible()) {
        await createBtn.click();
        await expect(page.getByRole("dialog").or(page.getByText("目标类型"))).toBeVisible({ timeout: 5000 });
      }
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

  test.describe("strength workflow (re-homed to /calendar?view=strength)", () => {
    test("strength view renders content via calendar deep link", async ({ page }) => {
      await page.goto("/calendar?view=strength");
      await expect(page).toHaveURL(/view=strength/);
      await expect(page.locator('section').first()).toBeVisible({ timeout: 10000 });
    });

    test("strength view shows analytics area", async ({ page }) => {
      await page.goto("/calendar?view=strength");
      await expect(page.getByRole("heading", { name: "力量分析" }).first()).toBeVisible();
    });

    test("legacy /strength redirects to calendar strength view", async ({ page }) => {
      await page.goto("/strength");
      await expect(page).toHaveURL(/calendar\?view=strength/);
    });
  });
});
