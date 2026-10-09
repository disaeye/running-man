import { test, expect } from "@playwright/test";

/**
 * Guards for two defects that were live in production and invisible in a
 * screenshot.
 *
 * Both rendered a correct-looking page. One only spoke in the console, the
 * other only in the network log, so neither a visual diff nor a "does this page
 * load" assertion could catch them — which is exactly why they survived the
 * other 134 e2e tests. These specs assert on those two channels directly.
 */

test.describe("client-only rendering", () => {
  /**
   * A hydration mismatch happens when the server's HTML and the client's first
   * render disagree. React reports it as an uncaught error and replaces the
   * server-rendered subtree.
   *
   * The dashboard header formatted the date with `new Date().toLocaleDateString`.
   * Vercel pre-renders in UTC while the athlete reads in Asia/Shanghai, so for
   * eight hours of every day the server said "9月13日星期日" and the browser said
   * "9月14日星期一". Every dashboard page logged hydration error 418 while looking
   * completely normal.
   */
  const PAGES = ["/", "/calendar", "/analysis", "/goals", "/settings"];

  for (const path of PAGES) {
    test(`${path} hydrates without an error`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto(path, { waitUntil: "networkidle" });
      // Hydration settles after the first paint; give React time to run the
      // comparison and report.
      await page.waitForTimeout(2500);

      expect(errors, `page errors on ${path}`).toEqual([]);
    });
  }

  test("no page ships a date baked into its HTML", async ({ request }) => {
    // The mechanism, asserted directly on every page rather than just the one.
    //
    // These routes are statically pre-rendered, so `new Date()` in a client
    // component did not merely disagree with the browser at request time — the
    // date was written into the HTML *at build time* and then served unchanged
    // for as long as the build lived. Production was built on Sep 13 and still
    // told visitors it was 9月13日星期日 the next day, in UTC, to athletes in
    // Asia/Shanghai.
    //
    // A test that renders the page and reads the date back cannot see this: the
    // browser corrects it during hydration, which is why the symptom was a
    // console error and a stale label rather than a visible break. Inspecting
    // the server's own HTML is the only way to catch a build-time value.
    const weekday = /(星期日|星期一|星期二|星期三|星期四|星期五|星期六)/;
    // The week grid renders cells as "09-14" plus a bare day number, and the
    // activity filters render `<input value="2026-09-14">`. Both appear in the
    // pre-rendered HTML when a component computes dates during render.
    const isoDay = /\b[0-9]{2}-[0-9]{2}\b/;
    const dateInput = /value="20[0-9]{2}-[0-9]{2}-[0-9]{2}"/;

    for (const path of [...PAGES, "/login", "/register", "/landing"]) {
      const response = await request.get(path);
      const html = await response.text();

      expect(
        weekday.test(html),
        `${path} HTML contains a date fixed at build time`,
      ).toBe(false);

      expect(
        dateInput.test(html),
        `${path} HTML contains a date input defaulting to build time`,
      ).toBe(false);

      // The week grid is dashboard-only.
      if (PAGES.includes(path)) {
        expect(
          isoDay.test(html),
          `${path} HTML contains a week-grid date fixed at build time`,
        ).toBe(false);
      }
    }
  });
});

test.describe("activity range guard", () => {
  /**
   * `/activities` redirects to `/calendar?view=list`, where `qualityRange`
   * returns undefined and the page passed `?? ""` into the activities hook. That
   * issued `GET /api/v1/activities?from=&to=`, which the API answers with 422.
   *
   * The list rendered from a different data path, so nothing looked broken —
   * the only trace was the failed request.
   */
  test("list view issues no empty-range request", async ({ page }) => {
    const emptyRange: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!url.includes("/activities?")) return;
      const query = url.slice(url.indexOf("?"));
      if (/[?&]from=(&|$)/.test(query) || /[?&]to=(&|$)/.test(query)) {
        emptyRange.push(url);
      }
    });

    await page.goto("/calendar?view=list", { waitUntil: "networkidle" });
    await page.waitForTimeout(3500);

    expect(emptyRange, "requests sent with an empty from/to").toEqual([]);
  });

  test("no request is answered with 422 while browsing the log", async ({ page }) => {
    const rejected: string[] = [];
    page.on("response", (response) => {
      if (response.status() === 422) {
        rejected.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto("/calendar?view=list", { waitUntil: "networkidle" });
    await page.waitForTimeout(3500);

    // 422 means the client sent a request it should never have constructed.
    expect(rejected).toEqual([]);
  });
});
