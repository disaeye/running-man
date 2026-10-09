import { test, expect } from "@playwright/test";

test.describe("Smoke", () => {
  test("login → dashboard → logout", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: /Running Man/ })).toBeVisible();
    await expect(page.getByTestId("profile-button")).toBeVisible();

    await page.goto("/settings?section=account");

    await page.getByRole("button", { name: "退出登录" }).click();

    await page.waitForURL(/\/login(\?|$)/);

    await expect(page.locator('input[name="email"]')).toBeVisible();
  });
});
