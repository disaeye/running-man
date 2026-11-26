import { expect, test } from "@playwright/test";
import { findRunWithPace } from "./activity-data";

test("PMC 鼠标预览与点选保留读数", async ({ page }) => {
  await page.goto("/analysis");
  const chart = page.locator("svg[viewBox^='0 0 320']").first().locator("..");
  await expect(chart).toBeVisible();
  const readout = chart.locator("..");
  await expect(readout).toContainText("最新");
  await expect(page.getByText("ATL 疲劳", { exact: true }).locator("line")).toHaveAttribute("stroke-dasharray", "4 3");
  await expect(page.getByText("TSB 状态", { exact: true }).locator("line")).toHaveAttribute("stroke-dasharray", "1 3");
  // 图表在首屏折叠线以下时，鼠标坐标必须落在视口内才有 hover 事件。
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
  await expect(readout).not.toContainText("最新");
  await chart.click({ position: { x: box.width * 0.45, y: box.height * 0.5 } });
  const selectedText = (await readout.innerText()).replaceAll("\n", "");
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await readout.innerText()).replaceAll("\n", "")).toBe(selectedText);
  await chart.click({ position: { x: box.width * 0.45, y: box.height * 0.5 } });
  await expect(readout).toContainText("最新");
});

test("首页首次读取后返回保持静态，减少动态效果始终静态", async ({ page }) => {
  await page.goto("/");
  const workout = page.getByTestId("home-workout");
  await expect(workout).toBeVisible();
  await expect(workout).not.toHaveClass(/reading-active/);
  await page.goto("/calendar");
  await page.goto("/");
  await expect(workout).not.toHaveClass(/reading-active/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(workout).not.toHaveClass(/reading-active|reading-updated/);
});

test("周切换只给日期列表一个方向过渡", async ({ page }) => {
  await page.goto("/calendar");
  const grid = page.getByTestId("plan-week-grid");
  await grid.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(grid.locator(".week-shift")).toHaveAttribute("data-week-direction", "next");
  await grid.getByRole("button", { name: "上一周", exact: true }).click();
  await expect(grid.locator(".week-shift")).toHaveAttribute("data-week-direction", "previous");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(grid.locator(".week-shift")).toHaveCSS("animation-duration", "1e-05s");
});

test("窄屏恢复与负荷标签保持完整可读", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const readings = page.getByTestId("home-readings");
  const hrv = readings.getByText("HRV", { exact: true });
  const source = readings.getByText(/Intervals\.icu|^\d{2}-\d{2}$/).first();
  await expect(hrv).toBeVisible();
  await expect(source).toBeVisible();
  const hrvBox = await hrv.boundingBox();
  const sourceBox = await source.boundingBox();
  expect(sourceBox!.y).toBeGreaterThanOrEqual(hrvBox!.y);
  const load = page.getByTestId("home-load");
  await expect(load).toBeVisible();
  await expect(load).toContainText("训练状态");
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
});

test("活动页头在窄屏分行，平板导航不显示数字提示", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/activities/${await findRunWithPace(page.request)}`);
  const title = page.locator("h1");
  const share = page.getByRole("button", { name: "分享" });
  await expect(share).toBeVisible();
  const titleBox = await title.boundingBox();
  const shareBox = await share.boundingBox();
  expect(shareBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height - 1);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.locator("nav kbd:visible")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("nav kbd:visible")).toHaveCount(5);
});

test("桌面悬浮导航不遮挡首屏内容，横屏底部留白匹配图标导航", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const nav = await page.locator("nav[data-shell-region='bottom']").boundingBox();
  const content = await page.locator("main .page-stack").first().boundingBox();
  expect(content!.y).toBeGreaterThanOrEqual(nav!.y + nav!.height);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/calendar");
  const padding = await page.locator("main").evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingBottom));
  const navHeight = await page.locator("nav[data-shell-region='bottom']").evaluate((element) => element.getBoundingClientRect().height);
  expect(padding).toBeLessThanOrEqual(navHeight + 17);
});

test("添加训练抽屉里手动补录 Escape 关闭后焦点返回页头入口", async ({ page }) => {
  await page.goto("/activities");
  const trigger = page.getByTestId("training-add-button");
  await trigger.click();
  await page.getByRole("button", { name: /手动补录活动/ }).click();
  await expect(page.getByRole("form", { name: "手动记录训练" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("设置页外观切换和 Alt+T 都能切换主题", async ({ page }) => {
  await page.goto("/settings?section=account");
  await page.getByRole("button", { name: /训练习惯与偏好/ }).click();
  const selector = page.getByTestId("theme-mode-selector");
  await expect(selector).toBeVisible();
  const before = await page.locator("html").evaluate((element) => element.classList.contains("dark"));
  const target = before ? "日光图谱" : "夜间遥测";
  await selector.getByRole("button", { name: target }).click();
  await expect.poll(() => page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(!before);
  await page.keyboard.press("Alt+t");
  await expect.poll(() => page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(before);
});
