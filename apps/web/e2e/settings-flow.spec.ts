import { test, expect } from "@playwright/test";

test.describe("Profile and settings flow", () => {
  test("renders settings page with clear profile navigation and sections @smoke", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
    const backToProfileLink = page.getByTestId("settings-page").getByRole("link", { name: "我的" });
    await expect(backToProfileLink).toHaveAttribute("href", "/profile");

    // Assert stable section test ids and their visible labels.
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

  test("profile page contains read-only information and links to settings", async ({ page }) => {
    await page.goto("/profile");

    await expect(page.getByRole("heading", { name: "我的", exact: true })).toBeVisible();
    await expect(page.getByTestId("settings-section-data")).toHaveCount(0);
    await expect(page.getByTestId("profile-pb-grid")).toBeVisible();
    // 没有登记跑鞋时，跑鞋卡换成一行待登记入口；设置入口在两种状态下都存在。
    await expect(page.getByRole("heading", { name: "跑鞋与装备", exact: true }).or(page.getByTestId("profile-pending-setup"))).toBeVisible();
    // 个人画像页保持只读：不在此页暴露跑鞋编辑弹窗或生理重算按钮
    await expect(page.getByRole("button", { name: "新增跑鞋" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "自动测算" })).toHaveCount(0);

    const zonesLink = page.getByRole("link", { name: "调整训练区间" });
    await expect(zonesLink).toHaveAttribute("href", "/settings?section=training");
    await zonesLink.click();
    await expect(page).toHaveURL(/\/settings\?section=training/);
    await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
    await page.getByTestId("settings-page").getByRole("link", { name: "我的" }).click();
    await expect(page).toHaveURL(/\/profile$/);

    // 跑鞋管理入口跳转到「设置 → 账户与偏好」后再执行新增跑鞋弹窗交互
    const manageGearLink = page.getByRole("link", { name: /管理装备|去登记/ }).first();
    await expect(manageGearLink).toHaveAttribute("href", "/settings?section=account");
    await manageGearLink.click();
    await expect(page).toHaveURL(/\/settings\?section=account/);
    await expect(page.getByRole("heading", { name: "跑鞋与装备", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("名称", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "新增跑鞋" }).click();
    await expect(page.getByRole("dialog").getByLabel("名称", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "添加跑鞋" })).toBeDisabled();
    await page.getByRole("button", { name: "取消" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("名称", { exact: true })).toHaveCount(0);
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

  test("legacy strength section deep link redirects to the strength workbench", async ({ page }) => {
    // Middleware drops the settings query and lands on the strength workbench.
    await page.goto("/settings?section=strength");
    await expect(page).toHaveURL(/\/strength$/);
  });

  test("legacy profile section deep link lands on account", async ({ page }) => {
    // `profile` remains the legacy alias for the account settings section.
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
    // ambiguous — it appears in the shell header and the auth wordmark — and
    // that ambiguity, not a missing logout, is what the test was reporting.
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });
});
