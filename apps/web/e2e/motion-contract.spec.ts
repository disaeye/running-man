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
    // 首次读取期间 .reading-active .num 的 reading-value 动画覆盖主数字的遮罩揭示，
    // 读取结束后才能读到主数字自己的 animation-name。
    await expect(workout).not.toHaveClass(/reading-active/);
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

test.describe("路由、骨架与数据切换", () => {
  test("首页 HTML 自带与仪表盘同栅格的骨架", async ({ page }) => {
    const response = await page.request.get("/");
    const html = await response.text();
    expect(html).toContain("home-skeleton");
    expect(html).toContain("data-hydration-reveal");
  });

  test("切换观察周期时图表原地更新，不回到加载文案", async ({ page }) => {
    // 真实账户才有 PMC 曲线；固定空数据 fixture 不画坐标系。
    await page.goto("/analysis?tab=load");
    const chart = page.locator("svg[viewBox^='0 0 320']").first();
    await expect(chart).toBeVisible();
    await page.getByRole("button", { name: "4周" }).click();
    await expect(page.getByText("正在计算负荷曲线")).toHaveCount(0);
    await expect(page.getByText("正在计算这一期的变化")).toHaveCount(0);
    await expect(chart).toBeVisible();
    await expect(page.getByRole("button", { name: "4周" })).toHaveAttribute("aria-pressed", "true");
  });

  test("可点击按钮显示手形光标，按下过渡比松开快", async ({ page }) => {
    await page.goto("/analysis?tab=load");
    const preset = page.getByRole("button", { name: "4周" });
    await expect(preset).toHaveCSS("cursor", "pointer");
    const idle = await preset.evaluate((element) => getComputedStyle(element).transitionDuration);
    const box = await preset.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const pressed = await preset.evaluate((element) => getComputedStyle(element).transitionDuration);
    await page.mouse.up();
    expect(Number.parseFloat(pressed)).toBeLessThan(Number.parseFloat(idle));
  });

  test("路由入场没有位移，View Transition 与 template 淡入互斥", async ({ page }) => {
    await mockDashboard(page);
    await page.goto("/");
    await page.getByRole("link", { name: "训练" }).click();
    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.locator(".page-arrival")).toHaveCount(0);
    // 浏览器接管 View Transition 时，template 不再叠加自己的淡入。
    await expect(page.locator(".route-arrival")).toHaveCount(0);

    // 没有 View Transition 时由 RouteArrival 淡入，只改透明度，不做位移。
    const plain = await page.context().newPage();
    await plain.addInitScript(() => {
      Object.defineProperty(Document.prototype, "startViewTransition", {
        value: undefined,
        configurable: true,
        writable: true,
      });
    });
    await mockDashboard(plain);
    await plain.goto("/");
    await plain.getByRole("link", { name: "分析" }).click();
    await expect(plain).toHaveURL(/\/analysis/);
    const arrival = plain.locator(".route-arrival");
    await expect(arrival).toHaveCount(1);
    const style = await arrival.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { name: computed.animationName, transform: computed.transform };
    });
    expect(style.name).toBe("page-in");
    expect(style.transform).toBe("none");
    await plain.close();
  });
});
