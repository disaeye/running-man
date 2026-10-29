import { test, expect, type Page } from "@playwright/test";

/**
 * 锁住首页的阅读顺序。
 *
 * 页面先答「今天练什么」（34px 结论与说明），紧跟它的四格读数说明这个决定的
 * 四个口径；然后是近 42 天负荷趋势，最后是本周训练清单与课表。
 * 所以这个顺序在手机上也不变。
 *
 * 四个块按 testid 定位而不是布局类名，日常的间距与分栏调整不会让这套断言失败：
 * - `home-decision`        34px 结论句与说明
 * - `home-readings`        结论句下面的四格读数
 * - `home-load`            负荷趋势卡（PMC）
 * - `home-weekly-horizon`  本周训练清单卡
 */

const BLOCKS = [
  "home-decision",
  "home-readings",
  "home-load",
  "home-weekly-horizon",
] as const;

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

  test("the conclusion and its four numbers are both on the first screen", async ({ page }) => {
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
    const readingsBottom = await page.evaluate(
      () =>
        Math.round(
          document
            .querySelector('[data-testid="home-readings"]')!
            .getBoundingClientRect().bottom,
        ),
    );

    expect(tops["home-decision"], "the conclusion must be on the first screen").toBeLessThan(
      shellHeight,
    );
    expect(
      readingsBottom,
      "the reading strip under the conclusion must be on the first screen",
    ).toBeLessThan(shellHeight);
  });

  test("narrow screens stack in priority order", async ({ page }) => {
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
