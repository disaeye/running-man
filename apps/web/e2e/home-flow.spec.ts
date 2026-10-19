import { test, expect, type Page } from "@playwright/test";

/**
 * Locks in the home page's information order and first-screen priorities.
 *
 * The page used to open with a three-line display-xl headline — 203px tall, a
 * quarter of a 900px viewport — carrying no data. Below it the four load
 * metrics (CTL, ATL, TSB, ACWR) sat fourth in source order, and because the grid
 * only had placement rules at >=768px, narrow screens fell back to that order
 * and put the metrics below the fold.
 *
 * These assertions are about *priority*, not pixel values, so they survive
 * routine spacing changes but fail if a decorative block is allowed to push the
 * numbers back down. The blocks are addressed by test id: the previous version
 * keyed on `bento-*` layout classes, which vanished when the page was rebuilt
 * around the decision, and the suite then failed for a reason that had nothing
 * to do with the priority it was meant to protect.
 */

const BLOCKS = ["home-decision", "home-metrics", "home-recent"] as const;

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
  // Pinned rather than inherited: the chromium project runs at Chrome's default
  // 1280x720, and "is it on the first screen" is only meaningful against a
  // known height.
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the decision and the load metrics are both on the first screen", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);

    const shellHeight = await page.evaluate(
      () => (document.querySelector(".shell-main") as HTMLElement).clientHeight,
    );

    // An account with no history has nothing to decide, so the page shows the
    // starting point instead. Asserting a metric rail there would demand a wall
    // of dashes.
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

    // The two things an athlete opens the app for: what to do today, and what
    // state they are in. Both must be visible without scrolling at desktop size.
    expect(tops["home-decision"], "decision card must be on the first screen").toBeLessThan(
      shellHeight,
    );
    expect(tops["home-metrics"], "load metrics must be on the first screen").toBeLessThan(
      shellHeight,
    );
  });

  test("narrow screens stack in priority order", async ({ page }) => {
    // Narrow screens stack the grid in DOM order — there is no second set of
    // markup — so the document order has to be the reading order there. On
    // desktop the grid is placed explicitly and may differ, which is why this
    // asserts at a phone width only.
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
