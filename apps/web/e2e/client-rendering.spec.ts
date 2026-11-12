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
  const PAGES = ["/", "/calendar", "/analysis", "/analysis?tab=strength", "/goals", "/profile", "/settings"];

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

  test("dashboard HTML carries the current week, not a build-time date", async ({ request }) => {
    // 以前这些路由是静态预渲染的，`new Date()` 在构建时执行一次，HTML 里写死当天的
    // 日期（生产在 9 月 13 日构建，次日仍在说 9月13日星期日）。浏览器水合时会改正，
    // 所以只有直接看服务端返回的 HTML 才能发现。
    //
    // 现在这些路由按请求渲染，正确的断言是：HTML 里的周范围就是此刻的周范围。
    const response = await request.get("/calendar");
    const html = await response.text();
    const week = currentWeekRange();
    const shortRange = `${week.from.slice(5)} – ${week.to.slice(5)}`;
    expect(html, "calendar HTML must render this week").toContain(shortRange);

    const weekday = /(星期日|星期一|星期二|星期三|星期四|星期五|星期六)/;
    const dateInput = /value="20[0-9]{2}-[0-9]{2}-[0-9]{2}"/;
    for (const path of ["/login", "/register"]) {
      const page = await (await request.get(path)).text();
      expect(weekday.test(page), `${path} HTML contains a date`).toBe(false);
      expect(dateInput.test(page), `${path} HTML contains a date input`).toBe(false);
    }
  });
});

/** 今天所在周（周一到周日），与页面 `weekRangeOf(today)` 同一套日历算术。 */
function currentWeekRange(): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  const anchor = Date.UTC(year, month - 1, day);
  const weekday = new Date(anchor).getUTCDay();
  const monday = new Date(anchor + (weekday === 0 ? -6 : 1 - weekday) * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

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

  test("first data wave starts alongside the profile request", async ({ page }) => {
    const apiStarts: { path: string; at: number }[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/v1/")) {
        apiStarts.push({ path: url.pathname, at: Date.now() });
      }
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    const profile = apiStarts.find((entry) => entry.path === "/api/v1/athletes/me");
    const activities = apiStarts.find((entry) => entry.path === "/api/v1/activities");
    expect(profile, "profile request missing").toBeDefined();
    expect(activities, "first-wave data request missing").toBeDefined();
    // 时区解析完成后数据请求在同一波发出；等待 profile 往返会把它推后
    // 至少整个 /athletes/me 的响应时间。
    expect(Math.abs((activities?.at ?? 0) - (profile?.at ?? 0))).toBeLessThan(300);
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
