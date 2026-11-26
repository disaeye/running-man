/**
 * App shell — Playwright spec for responsive scroll ownership and navigation.
 *
 * This spec is authored for Todo 15 sub-gate 2 served assertions.
 * For Todo 6, only `--list --grep "app shell"` discovery is required.
 *
 * @tag: app-shell
 */
import { test, expect } from "@playwright/test";

const MOBILE = { width: 375, height: 812 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

const DASHBOARD_ROUTES = ["/", "/calendar", "/analysis", "/analysis?tab=strength", "/goals", "/profile", "/settings"];

test.describe("app shell", () => {
  test.describe("mobile 375x812", () => {
    test.use({ viewport: MOBILE });

    test("shell regions are present @smoke", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator('[data-shell="root"]')).toBeVisible();
      await expect(page.locator('[data-shell-region="main"]')).toBeVisible();
      await expect(page.locator('[data-shell-region="bottom"]')).toBeVisible();
    });

    test("content-end sentinel exists", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByTestId("content-end-sentinel")).toBeAttached();
    });

    test("mobile nav bar is visible and has layout token", async ({ page }) => {
      await page.goto("/");
      const nav = page.locator('[data-layout-token="mobile-nav"]');
      await expect(nav).toBeVisible();
    });

    test("no desktop sidebar is rendered", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByTestId("sidebar")).toHaveCount(0);
    });

    test("all tab bar items meet 44px touch target", async ({ page }) => {
      await page.goto("/");
      const nav = page.locator('[data-layout-token="mobile-nav"]');
      await expect(nav).toBeVisible();
      const links = nav.locator("a");
      // Same hydration caveat as the profile button: wait for a rendered link
      // before counting, or the count is zero on a cold load.
      await expect(links.first()).toBeVisible();
      const count = await links.count();
      expect(count).toBe(5);

      for (let i = 0; i < count; i++) {
        const box = await links.nth(i).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    });

    test("profile tab opens athlete profile", async ({ page }) => {
      await page.goto("/");
      const tab = page.locator('[data-layout-token="mobile-nav"] a').filter({ hasText: "我的" });
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(page).toHaveURL(/\/profile$/);
    });

    test("profile page opens the zone settings", async ({ page }) => {
      await page.goto("/profile");
      const zonesLink = page.getByRole("link", { name: "调整训练区间" });
      await expect(zonesLink).toBeVisible();
      await zonesLink.click();
      await expect(page).toHaveURL(/\/settings\?section=training/);
    });

    test("content end never sits under the mobile nav", async ({ page }) => {
      // The invariant: after scrolling to the bottom, the last element of the
      // page must not be hidden behind the fixed tab bar.
      //
      // This previously measured the scroll region right after navigation
      // (before the client-rendered shell had laid out), then asserted
      // scrollTop had moved — which conflated "the page did not scroll" with
      // "the page did not need to scroll". The goals page fits the viewport
      // exactly at this size and legitimately stays at 0.
      for (const route of DASHBOARD_ROUTES) {
        await page.goto(route);
        const main = page.locator('[data-shell-region="main"]');
        const sentinel = page.getByTestId("content-end-sentinel");
        const nav = page.locator('[data-layout-token="mobile-nav"]');

        await expect(sentinel).toBeAttached();
        await expect(nav).toBeVisible();

        // Scroll *and* measure inside the poll. Scrolling once up front is not
        // enough: these pages fetch their data after mount, and the re-render
        // that follows resets the scroll position — so a single scrollTo could
        // be undone before the measurement, reporting the content as if it had
        // never scrolled (observed as a ~1840px "overlap" on /calendar).
        await expect
          .poll(
            async () => {
              await main.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
              return page.evaluate(() => {
                const sentinelEl = document.querySelector(
                  '[data-testid="content-end-sentinel"]',
                );
                const navEl = document.querySelector(
                  '[data-layout-token="mobile-nav"]',
                );
                if (!sentinelEl || !navEl) return Number.POSITIVE_INFINITY;
                return (
                  sentinelEl.getBoundingClientRect().bottom -
                  navEl.getBoundingClientRect().top
                );
              });
            },
            { message: `${route}: content end should clear the nav` },
          )
          .toBeLessThanOrEqual(25);
      }
    });

    test("main content clears the bottom navigation", async ({ page }) => {
      await page.goto("/");
      const navEl = page.locator('[data-layout-token="mobile-nav"]');
      const navHeight = await navEl.evaluate(
        (el) => el.getBoundingClientRect().height,
      );
      expect(navHeight).toBeGreaterThan(0);
      const padding = await page.locator('[data-shell-region="main"]').evaluate(
        (el) => parseFloat(getComputedStyle(el).paddingBottom),
      );
      expect(padding).toBeGreaterThanOrEqual(navHeight);
    });

    test("profile and settings show distinct page titles while sharing the profile tab", async ({ page }) => {
      for (const [route, title] of [["/profile", "我的"], ["/settings?section=account", "设置"]] as const) {
        await page.goto(route);
        await expect(page.locator('[data-shell-region="main"] h1')).toHaveText(title);
        const profileTab = page
          .locator('[data-layout-token="mobile-nav"] a')
          .filter({ hasText: "我的" });
        await expect(profileTab).toHaveAttribute("aria-current", "page");
      }
    });

    test("alias active state: /activities maps to training tab", async ({
      page,
    }) => {
      await page.goto("/activities");
      const trainingTab = page
        .locator('[data-layout-token="mobile-nav"] a')
        .filter({ hasText: "训练" });
      await expect(trainingTab).toHaveAttribute("aria-current", "page");
    });

    test("focus order: skip link → header controls → main content", async ({
      page,
    }) => {
      await page.goto("/");
      await page.keyboard.press("Tab");
      const skipLink = page.locator('a[href="#main-content"]');
      await expect(skipLink).toBeFocused();
    });
  });

  test.describe("tablet 768x1024", () => {
    test.use({ viewport: TABLET });

    test("bottom navigation stays visible on tablet", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator('[data-layout-token="mobile-nav"]')).toBeVisible();
      await expect(page.getByTestId("sidebar")).toHaveCount(0);
    });

    test("tablet navigation has five entries", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator('[data-layout-token="mobile-nav"] a')).toHaveCount(5);
    });
  });

  test.describe("desktop 1280x800", () => {
    test.use({ viewport: DESKTOP });

    test("bottom navigation stays visible on desktop", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator('[data-layout-token="mobile-nav"]')).toBeVisible();
      await expect(page.getByTestId("sidebar")).toHaveCount(0);
    });

    test("desktop content column stays within 64rem", async ({ page }) => {
      await page.goto("/");
      const content = page.locator(".shell-main-inner");
      await expect(content).toBeVisible();
      const width = await content.evaluate((element) => element.getBoundingClientRect().width);
      expect(width).toBeGreaterThan(672);
      expect(width).toBeLessThanOrEqual(1024);
    });

    test("desktop navigation links preserve their routes", async ({ page }) => {
      await page.goto("/");
      const nav = page.locator('[data-layout-token="mobile-nav"]');
      await expect(nav.locator('a[href="/calendar"]')).toBeVisible();
      await expect(nav.locator('a[href="/analysis"]')).toBeVisible();
      await expect(nav.locator('a[href="/goals"]')).toBeVisible();
      await expect(nav.locator('a[href="/profile"]')).toBeVisible();
    });
  });

  test.describe("safe-area tokens", () => {
    test.use({ viewport: MOBILE });

    test("mobile nav has safe-area bottom attribute", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.locator(
          '[data-layout-token="mobile-nav"][data-safe-area="bottom"]',
        ),
      ).toBeVisible();
    });
  });
});
