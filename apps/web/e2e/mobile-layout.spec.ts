import { test, expect, type Page } from "@playwright/test";

/**
 * The phone layout contract.
 *
 * Every dashboard page owns exactly one title; on a phone the page's controls
 * sit under that title as a full-width row, tab strips share the column instead
 * of running past it, and no text is cut off inside a box that hides overflow.
 * The same header puts controls beside the title once there is room.
 */

const PAGES = ["/calendar", "/analysis", "/analysis?tab=strength", "/goals", "/profile", "/settings"] as const;

interface Geometry {
  readonly h1Count: number;
  readonly h1Bottom: number;
  readonly actionTop: number | null;
  readonly actionRight: number | null;
  readonly contentRight: number;
  readonly overflowingTabs: readonly string[];
  readonly clippedText: readonly string[];
  readonly documentOverflow: number;
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('[data-shell-region="main"]')!;
    const inner = main.querySelector<HTMLElement>(".shell-main-inner")!;
    const header = inner.firstElementChild as HTMLElement | null;
    const h1 = inner.querySelector("h1");
    const actionRow = header?.querySelector<HTMLElement>("h1 + div, h1 ~ div") ?? null;
    const contentRight = main.getBoundingClientRect().right - parseFloat(getComputedStyle(main).paddingRight);

    const overflowingTabs: string[] = [];
    for (const list of Array.from(inner.querySelectorAll<HTMLElement>('[data-slot="tabs-list"]'))) {
      if (list.scrollWidth > list.clientWidth + 2) {
        overflowingTabs.push((list.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24));
      }
    }

    const scrollAncestor = (el: Element): boolean => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowX;
        if (overflow === "auto" || overflow === "scroll") return true;
      }
      return false;
    };
    const clippedText: string[] = [];
    for (const el of Array.from(inner.querySelectorAll<HTMLElement>("*"))) {
      const style = getComputedStyle(el);
      if (style.display === "none" || scrollAncestor(el)) continue;
      const clips = style.overflowX === "hidden" || style.overflowX === "clip";
      if (clips && el.scrollWidth > el.clientWidth + 2 && (el.textContent ?? "").trim()) {
        clippedText.push((el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24));
      }
    }

    return {
      h1Count: inner.querySelectorAll("h1").length,
      h1Bottom: h1 ? h1.getBoundingClientRect().bottom : 0,
      actionTop: actionRow ? actionRow.getBoundingClientRect().top : null,
      actionRight: actionRow ? actionRow.getBoundingClientRect().right : null,
      contentRight,
      overflowingTabs,
      clippedText,
      documentOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

for (const path of PAGES) {
  test.describe(`phone ${path}`, () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("own title, stacked controls, nothing cut off", async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      await page.locator('[data-shell-region="main"] h1').first().waitFor({ state: "visible" });
      const result = await geometry(page);

      expect(result.h1Count, "one page title").toBe(1);
      expect(result.overflowingTabs, "tab strips fit the column").toEqual([]);
      expect(result.clippedText, "no text clipped by a hidden overflow").toEqual([]);
      expect(result.documentOverflow).toBeLessThanOrEqual(1);

      // Controls under the title, flush to the content edge. Pages whose header
      // carries no controls (an empty goal list, the profile summary) skip it.
      if (result.actionTop !== null && result.actionRight !== null) {
        expect(result.actionTop, "controls start below the title").toBeGreaterThanOrEqual(
          result.h1Bottom - 1,
        );
        expect(Math.abs(result.actionRight - result.contentRight)).toBeLessThanOrEqual(1);
      }
    });
  });

  test.describe(`desktop ${path}`, () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("controls sit beside the title", async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      await page.locator('[data-shell-region="main"] h1').first().waitFor({ state: "visible" });
      const result = await geometry(page);

      expect(result.overflowingTabs).toEqual([]);
      expect(result.clippedText).toEqual([]);
      if (result.actionTop !== null && result.actionRight !== null) {
        expect(result.actionTop, "controls share the title row").toBeLessThan(result.h1Bottom - 4);
        expect(Math.abs(result.actionRight - result.contentRight)).toBeLessThanOrEqual(1);
      }
    });
  });
}
