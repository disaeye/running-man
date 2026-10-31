import { test, expect, type Page } from "@playwright/test";

/**
 * 锁住首页的阅读顺序。
 *
 * 页面先展示今天的训练安排，再列出恢复状态和身体读数；随后展示本周跑量与最近训练。
 * 所以这个顺序在手机上也不变。
 *
 * 主要内容按 testid 定位，布局调整后仍检查训练与恢复的阅读顺序。
 */

const BLOCKS = ["home-workout", "home-recovery"] as const;

async function blockTops(page: Page) {
  return page.evaluate((ids) => {
    const out: Record<string, number> = {};
    for (const id of ids) {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (element) out[id] = Math.round(element.getBoundingClientRect().top);
    }
    return out;
  }, [...BLOCKS]);
}

test.describe("home page information flow", () => {
  // Pinned rather than inherited: "is it on the first screen" is only
  // meaningful against a known viewport height.
  test.use({ viewport: { width: 1440, height: 900 } });

  test("today's workout is the first-screen focal point", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);

    const shellHeight = await page.evaluate(
      () => (document.querySelector(".shell-main") as HTMLElement).clientHeight,
    );

    // An account with no history has nothing to decide, so the page shows the
    // starting point instead. Asserting a reading strip there would demand a
    // wall of dashes.
    const starting = await page.getByTestId("home-starting-point").count();
    if (starting > 0) {
      const top = await page.evaluate(
        () =>
          Math.round(
            document
              .querySelector('[data-testid="home-starting-point"]')!
              .getBoundingClientRect().top,
          ),
      );
      expect(top, "starting point must be on the first screen").toBeLessThan(shellHeight);
      return;
    }

    const tops = await blockTops(page);
    const workoutBottom = await page.evaluate(
      () => Math.round(document.querySelector('[data-testid="home-workout"]')!.getBoundingClientRect().bottom),
    );

    expect(tops["home-workout"], "today's workout must be the first content block").toBeLessThan(
      tops["home-recovery"] ?? shellHeight,
    );
    expect(workoutBottom, "the workout hero must fit on the first screen").toBeLessThan(shellHeight);
  });

  test("narrow screens show the workout before recovery", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);

    const tops = await blockTops(page);
    const present = BLOCKS.filter((id) => id in tops);

    if (present.length === 0) {
      // Empty account: the starting point replaces the data blocks entirely.
      await expect(page.getByTestId("home-starting-point")).toBeVisible();
      return;
    }
    for (let index = 1; index < present.length; index += 1) {
      const previous = present[index - 1]!;
      const current = present[index]!;
      expect(
        tops[current],
        `${current} must come after ${previous} in reading order`,
      ).toBeGreaterThan(tops[previous]!);
    }
  });
});
