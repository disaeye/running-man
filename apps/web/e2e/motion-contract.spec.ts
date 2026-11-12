import { expect, test, type Page } from "@playwright/test";
import { mockDashboard } from "./ux-dashboard-mocks";

/**
 * 动效描述状态，不是装饰。这里检查浏览器真正计算出来的规则：
 * 控件有过渡、指示条跟着选中项移动、主页只有一处遮罩揭示，
 * 以及减少动态效果时去掉位移但保留颜色反馈。
 */
async function openAnalysis(page: Page): Promise<void> {
  await mockDashboard(page);
  await page.goto("/analysis?tab=load");
  await expect(page.getByTestId("analysis-load")).toBeVisible();
}

test.describe("操作型界面的动效", () => {
  test("分段控件的选中指示条跟着选中项移动", async ({ page }) => {
    await openAnalysis(page);
    const rangePicker = page.getByRole("button", { name: "12周" }).locator("..");
    const indicator = rangePicker.getByTestId("sliding-indicator");
    await expect(indicator).toBeVisible();
    const before = await indicator.evaluate((element) => getComputedStyle(element).transform);

    await page.getByRole("button", { name: "4周" }).click();
    await expect.poll(async () => indicator.evaluate((element) => getComputedStyle(element).transform), { timeout: 5000 }).not.toBe(before);
    const after = await indicator.evaluate((element) => getComputedStyle(element).transform);
    expect(after).toContain("matrix");
  });

  test("按钮的点按反馈含 transform 过渡", async ({ page }) => {
    await mockDashboard(page);
    await page.goto("/settings?section=training");
    const save = page.getByRole("button", { name: "保存" });
    const transition = await save.evaluate((element) => {
      const style = getComputedStyle(element);
      return { property: style.transitionProperty, duration: style.transitionDuration };
    });
    expect(transition.property).toContain("transform");
    expect(Number.parseFloat(transition.duration)).toBeGreaterThan(0);
  });

  test("首页只有主决策数字带遮罩揭示", async ({ page }) => {
    // 真实账户有教练建议，能渲染今天该练什么的读数；固定空数据 fixture 只会
    // 渲染起步引导，那里本来就不该有主数字。
    await page.goto("/", { waitUntil: "networkidle" });
    const workout = page.getByTestId("home-workout");
    await expect(workout).toBeVisible();
    const reveals = page.locator(".focal-reveal");
    await expect(reveals).toHaveCount(1);
    const animation = await reveals.first().evaluate((element) => getComputedStyle(element).animationName);
    expect(animation).toBe("rm-reveal");
  });

  test("减少动态效果时移除位移并保留颜色反馈", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openAnalysis(page);
    const indicator = page.getByTestId("sliding-indicator").first();
    const indicatorStyle = await indicator.evaluate((element) => {
      const style = getComputedStyle(element);
      return { animation: style.animationName, transition: style.transitionDuration };
    });
    expect(indicatorStyle.animation).toBe("none");
    expect(indicatorStyle.transition).toBe("0s");

    const tab = page.getByRole("button", { name: "4周" });
    const tabStyle = await tab.evaluate((element) => getComputedStyle(element).transitionProperty);
    expect(tabStyle).toContain("color");
  });

  test("移动端指示条不撑出可视区", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openAnalysis(page);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const indicator = page.getByTestId("sliding-indicator").last();
    await expect(indicator).toBeVisible();
  });
});
