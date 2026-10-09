import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { expectAuthenticatedPage } from "./auth-login";
import { PRODUCT_ROUTE_MATRIX } from "./product-route-matrix";

interface VisualRoute {
  readonly path: string;
  readonly name: string;
}

const PUBLIC_ROUTES: readonly VisualRoute[] = PRODUCT_ROUTE_MATRIX
  .filter((entry) => entry.routeKind === "public" && entry.aliasOf === undefined)
  .map((entry) => ({ path: entry.path, name: entry.evidenceName }));

const DASHBOARD_ROUTES: readonly VisualRoute[] = PRODUCT_ROUTE_MATRIX
  .filter(
    (entry) =>
      (entry.routeKind === "dashboard" || entry.routeKind === "settings") &&
      entry.aliasOf === undefined,
  )
  .map((entry) => ({ path: entry.path, name: entry.evidenceName }));

interface ConsoleHealth {
  readonly errors: readonly string[];
  readonly failedStaticUrls: readonly string[];
}

function themeFromProject(projectName: string): "light" | "dark" {
  return projectName.endsWith("-light") ? "light" : "dark";
}

function viewportWidthFromProject(projectName: string): number {
  if (projectName.includes("mobile")) return 375;
  if (projectName.includes("tablet")) return 768;
  return 1280;
}

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("rm.theme", selectedTheme);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(selectedTheme);
  }, theme);
}

async function collectConsoleHealth(page: Page): Promise<ConsoleHealth> {
  const errors: string[] = [];
  const failedStaticUrls: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const location = msg.location();
      // Next.js emits a benign 404 console entry for its internal
      // /_not-found route when a URL has no match; not an app defect.
      if (location.url.includes("/_not-found")) return;
      errors.push(`${msg.text()} @ ${location.url}`);
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 400 && /\/_next\/static|\.js($|\?)/u.test(url)) {
      failedStaticUrls.push(`${response.status()} ${url}`);
    }
  });
  return { errors, failedStaticUrls };
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflow.scrollWidth,
    `scrollWidth (${overflow.scrollWidth}) must be <= innerWidth (${overflow.innerWidth})`,
  ).toBeLessThanOrEqual(overflow.innerWidth);
}

async function assertBottomNavClearance(
  page: Page,
  viewportWidth: number,
): Promise<void> {
  if (viewportWidth >= 768) return;
  const nav = page.locator('[data-layout-token="mobile-nav"]');
  if ((await nav.count()) === 0) return;
  const main = page.locator('[data-shell-region="main"]');
  await main.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const sentinelBottom = await page
    .getByTestId("content-end-sentinel")
    .evaluate((el) => el.getBoundingClientRect().bottom);
  const navTop = await nav.evaluate((el) => el.getBoundingClientRect().top);
  expect(sentinelBottom, "content-end sentinel must not overlap mobile nav").toBeLessThanOrEqual(navTop + 1);
}

async function captureRoute(
  page: Page,
  testInfo: TestInfo,
  route: VisualRoute,
  viewportWidth: number,
): Promise<void> {
  const health = await collectConsoleHealth(page);
  await page.goto(route.path, { waitUntil: "networkidle" });
  await expect(page.locator("body")).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertBottomNavClearance(page, viewportWidth);
  await assertUxContract(page, health);
  await expect(page).toHaveScreenshot([route.name, "page.png"], {
    animations: "disabled",
    fullPage: true,
    threshold: 0.2,
    timeout: 30_000,
  });
  expect(health.failedStaticUrls, `failed static resources: ${health.failedStaticUrls.join(", ")}`).toEqual([]);
  testInfo.annotations.push({ type: "baseline", description: route.path });
}

/**
 * UX contract gate (极致用户体验): every captured surface must have
 *  - zero console errors,
 *  - tap targets ≥ 40px tall for interactive controls (buttons, selects,
 *    inputs; inline text links are excluded by design),
 *  - WCAG contrast floors on the core text tokens in the active theme.
 */
async function assertUxContract(page: Page, health: ConsoleHealth): Promise<void> {
  expect(health.errors, `console errors: ${health.errors.join("; ")}`).toEqual([]);

  const smallTargets = await page.evaluate(() => {
    const viol: Array<{ tag: string; label: string; height: number }> = [];
    for (const el of document.querySelectorAll('button, [role="button"], [role="combobox"], select, input')) {
      if (el.hasAttribute("disabled")) continue;
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.height === 0) continue; // hidden / display:none
      if (rect.height < 40) {
        const label =
          el.getAttribute("aria-label") ||
          el.getAttribute("name") ||
          (el.textContent ?? "").trim().slice(0, 24) ||
          el.tagName;
        viol.push({ tag: el.tagName, label, height: Math.round(rect.height) });
      }
    }
    return viol;
  });
  expect(
    smallTargets,
    `touch targets <40px tall: ${JSON.stringify(smallTargets)}`,
  ).toEqual([]);

  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      primary: cs.getPropertyValue("--color-text-primary").trim(),
      secondary: cs.getPropertyValue("--color-text-secondary").trim(),
      card: cs.getPropertyValue("--color-surface-card").trim(),
    };
  });
  expect(contrastRatio(tokens.primary, tokens.card), "text-primary vs surface-card").toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(tokens.secondary, tokens.card), "text-secondary vs surface-card").toBeGreaterThanOrEqual(3.5);
}

/** WCAG relative-luminance contrast ratio for hex/rgb color strings. */
function contrastRatio(a: string, b: string): number {
  const luminance = (color: string): number => {
    const rgb = parseColor(color);
    const linear = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  };
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function parseColor(color: string): [number, number, number] {
  const hex6 = color.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (hex6) {
    const n = Number.parseInt(hex6[1]!, 16);
    return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
  }
  const hex3 = color.trim().match(/^#([0-9a-fA-F]{3})$/);
  if (hex3) {
    const parts = [...hex3[1]!].map((c) => Number.parseInt(c + c, 16) / 255);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  }
  const rgb = color.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) {
    return [
      Number(rgb[1] ?? 0) / 255,
      Number(rgb[2] ?? 0) / 255,
      Number(rgb[3] ?? 0) / 255,
    ];
  }
  return [0, 0, 0];
}

async function latestActivityRoute(page: Page): Promise<VisualRoute | null> {
  await page.goto("/calendar?view=list", { waitUntil: "networkidle" });
  const activityLink = page.locator('a[href*="/activities/"]').first();
  if ((await activityLink.count()) === 0) return null;
  const href = await activityLink.getAttribute("href");
  if (!href) return null;
  return { path: href, name: "dashboard-activity-latest" };
}

test.describe("visual regression baseline", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`captures ${route.name}`, async ({ page }, testInfo) => {
      const theme = themeFromProject(testInfo.project.name);
      const width = viewportWidthFromProject(testInfo.project.name);
      await setTheme(page, theme);
      await captureRoute(page, testInfo, route, width);
    });
  }

  for (const route of DASHBOARD_ROUTES) {
    test(`captures ${route.name}`, async ({ page }, testInfo) => {
      const theme = themeFromProject(testInfo.project.name);
      const width = viewportWidthFromProject(testInfo.project.name);
      await setTheme(page, theme);
      await expectAuthenticatedPage(page);
      await captureRoute(page, testInfo, route, width);
    });
  }

  test("captures dashboard-activity-latest when activity data exists", async ({ page }, testInfo) => {
    const theme = themeFromProject(testInfo.project.name);
    const width = viewportWidthFromProject(testInfo.project.name);
    await setTheme(page, theme);
    await expectAuthenticatedPage(page);
    const latestRoute = await latestActivityRoute(page);
    if (latestRoute) {
      await captureRoute(page, testInfo, latestRoute, width);
    }
  });
});
