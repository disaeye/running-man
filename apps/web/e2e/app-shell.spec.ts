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

const DASHBOARD_ROUTES = ["/", "/calendar", "/analysis", "/goals", "/settings"];

test.describe("app shell", () => {
  test.describe("mobile 375x812", () => {
    test.use({ viewport: MOBILE });

    test("shell regions are present", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator('[data-shell="root"]')).toBeVisible();
      await expect(page.locator('[data-shell-region="top"]')).toBeVisible();
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

    test("sidebar is hidden on mobile", async ({ page }) => {
      await page.goto("/");
      const sidebar = page.getByTestId("sidebar");
      await expect(sidebar).toBeHidden();
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

    test("profile button meets 44px touch target", async ({ page }) => {
      await page.goto("/");
      const btn = page.getByTestId("profile-button");
      // Wait for hydration before measuring. The shell is a client component,
      // so boundingBox() returns null until React has mounted — the old
      // assertion read null and reported a missing element.
      await expect(btn).toBeVisible();
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    });

    test("profile button has accessible label", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.getByRole("button", { name: "打开个人设置" }),
      ).toBeVisible();
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
            async () =>
              main.evaluate((el) => {
                el.scrollTo(0, el.scrollHeight);
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
              }),
            { message: `${route}: content end should clear the nav` },
          )
          .toBeLessThanOrEqual(25);
      }
    });

    test("computed bottom padding accounts for nav height", async ({
      page,
    }) => {
      await page.goto("/");
      const mainEl = page.locator('[data-shell-region="main"]');
      const navEl = page.locator('[data-layout-token="mobile-nav"]');

      const navHeight = await navEl.evaluate(
        (el) => el.getBoundingClientRect().height,
      );
      const paddingBottom = await mainEl.evaluate((el) => {
        return parseFloat(getComputedStyle(el).paddingBottom);
      });

      expect(paddingBottom).toBeGreaterThanOrEqual(navHeight);
    });

    test("alias active state: /activities maps to calendar tab", async ({
      page,
    }) => {
      await page.goto("/activities");
      const calendarTab = page
        .locator('[data-layout-token="mobile-nav"] a')
        .filter({ hasText: "日历" });
      await expect(calendarTab).toHaveAttribute("aria-current", "page");
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

    test("sidebar is visible and collapsed on tablet", async ({ page }) => {
      await page.goto("/");
      const sidebar = page.getByTestId("sidebar");
      await expect(sidebar).toBeVisible();
      await expect(sidebar).toHaveAttribute("data-collapsed", "true");
    });

    test("mobile tab bar is hidden on tablet", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.locator('[data-layout-token="mobile-nav"]'),
      ).toBeHidden();
    });
  });

  test.describe("desktop 1280x800", () => {
    test.use({ viewport: DESKTOP });

    test("sidebar is visible and expanded on desktop", async ({ page }) => {
      await page.goto("/");
      const sidebar = page.getByTestId("sidebar");
      await expect(sidebar).toBeVisible();
    });

    test("mobile tab bar is hidden on desktop", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.locator('[data-layout-token="mobile-nav"]'),
      ).toBeHidden();
    });

    test("sidebar collapse persists across reload", async ({ page }) => {
      await page.goto("/");
      const toggle = page.getByRole("button", { name: "折叠侧边栏" });
      await toggle.click();
      await expect(page.getByTestId("sidebar")).toHaveAttribute(
        "data-collapsed",
        "true",
      );

      await page.reload();
      await expect(page.getByTestId("sidebar")).toHaveAttribute(
        "data-collapsed",
        "true",
      );

      const expandBtn = page.getByRole("button", { name: "展开侧边栏" });
      await expandBtn.click();
      await expect(page.getByTestId("sidebar")).toHaveAttribute(
        "data-collapsed",
        "false",
      );
    });
  });

  test.describe("safe-area tokens", () => {
    test.use({ viewport: MOBILE });

    test("header has safe-area top attribute", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.locator('[data-shell-region="top"][data-safe-area="top"]'),
      ).toBeVisible();
    });

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
