import { test, expect } from "@playwright/test";

test.describe("Smoke", () => {
  test("login → dashboard → logout @smoke", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "今天", exact: true })).toBeVisible();

    await page.goto("/settings?section=account");

    await page.getByRole("button", { name: "退出登录" }).click();

    await page.waitForURL(/\/login(\?|$)/);

    await expect(page.locator('input[name="email"]')).toBeVisible();
  });
});
