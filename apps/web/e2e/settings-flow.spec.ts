import { test, expect } from "@playwright/test";

test.describe("Settings Flow", () => {
  test("renders settings page with section list", async ({ page }) => {
    await page.goto("/settings");

    // Labels come from the page's PROFILE_TABS; assert on the testids (stable)
    // and check the label inside each.
    const expectedSections = [
      { id: "data", label: "数据源与同步" },
      { id: "training", label: "生理与区间" },
      { id: "account", label: "账户与偏好" },
    ];
    for (const { id, label } of expectedSections) {
      await expect(
        page.locator(`[data-testid="settings-section-${id}"]`).getByText(label, { exact: true }),
      ).toBeVisible();
    }
  });

  test("navigates between setting sections via deep links", async ({ page }) => {
    const sections = ["data", "training", "account"] as const;

    for (const id of sections) {
      await page.goto(`/settings?section=${id}`);
      await expect(page.getByTestId(`settings-section-${id}`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });

  test("legacy strength section deep link redirects to calendar strength view", async ({ page }) => {
    await page.goto("/settings?section=strength");
    await expect(page).toHaveURL(/\/calendar.*view=strength/);
  });

  test("legacy profile deep link lands on account", async ({ page }) => {
    // `profile` is the legacy alias for `account`; resolveSettingsSection maps it.
    await page.goto("/settings?section=profile");
    await expect(page.getByTestId("settings-section-account")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("account section displays logout button and logs out", async ({ page }) => {
    await page.goto("/settings?section=account");

    await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();

    await page.getByRole("button", { name: "退出登录" }).click();
    await page.waitForURL(/\/login$/);
    // Assert on the login form itself. Matching the text "Running Man" was
    // ambiguous — it appears in the shell header and the landing page — and
    // that ambiguity, not a missing logout, is what the test was reporting.
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });
});
