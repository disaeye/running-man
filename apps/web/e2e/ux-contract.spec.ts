/**
 * Combined UX contract: horizontal overflow, touch-target size and console
 * errors, measured on one load per (theme, width, route).
 *
 * The three questions belong together — "is this surface usable?" — but they
 * answer it from different angles: an overflowing document hides content, an
 * undersized control cannot be hit with a thumb, a console error means the
 * render is not the render that was designed. Measuring them on the same
 * loaded document costs one load instead of three, and a page load is the
 * expensive part of an e2e run (route boot, `networkidle`, chart settle). It
 * also keeps the findings comparable: an overflow, a 32px button and a
 * console error seen on one render describe one surface, not three unrelated
 * ones.
 *
 * Public routes are measured with no session. The middleware sends a
 * signed-in visitor away from `/login` and `/register`, so measuring them
 * with a session would measure the dashboard redirect instead of the form;
 * `/share/...` is public for the same reason — a share link is opened by
 * someone who is not signed in. Every other route is the authenticated
 * dashboard shell and is measured with the session the project ships.
 *
 * One surface is one test, not one test with a width loop. The loop form
 * kept all of a route's widths on one worker, so the file's 153 loads ran
 * back to back — a page load is ~1.8s of waiting and the assertions are
 * microseconds, so the wall clock was all waiting. Declaring a test per
 * (layer, route, width) lets Playwright spread the loads across workers.
 * The measurement itself is unchanged: same document, same settle, same
 * thresholds, same `[probe]` line.
 */
import { expect, test } from "@playwright/test";
import { expectAuthenticatedPage } from "./auth-login";
import { findOverflowCulprits, isUnavoidableConsoleEntry, measureSurface, setTheme, SETTLE_SCRIPT } from "./ux-contract-measure";
import { LAYERS, viewportFor } from "./ux-contract-routes";

/**
 * Parallel is scoped to this file. `fullyParallel` in the shared config would
 * also split the other specs, which each drive one multi-step flow inside a
 * single test — splitting those costs setup without saving any load. Here
 * every test is one independent surface, so running them concurrently costs
 * nothing extra.
 */
test.describe.configure({ mode: "parallel" });

for (const layer of LAYERS) {
  const groups = [
    { public: true, routes: layer.routes.filter((route) => route.public) },
    { public: false, routes: layer.routes.filter((route) => !route.public) },
  ];

  for (const group of groups) {
    if (group.routes.length === 0) continue;

    test.describe(`layer ${layer.label} · ${layer.theme} · ${group.public ? "public" : "authenticated"}`, () => {
      // A signed-in visitor is redirected away from /login and /register, so
      // the public surfaces are measured with no session at all.
      if (group.public) test.use({ storageState: { cookies: [], origins: [] } });

      test.beforeEach(async ({ page }) => {
        await setTheme(page, layer.theme);
      });

      for (const route of group.routes) {
        for (const width of layer.widths) {
          test(`${route.path} · ${width}`, async ({ page }) => {
            const consoleErrors: string[] = [];
            const pageErrors: string[] = [];
            page.on("console", (msg) => {
              if (msg.type() !== "error") return;
              if (isUnavoidableConsoleEntry(msg.location().url)) return;
              consoleErrors.push(`${msg.text()} @ ${msg.location().url}`);
            });
            page.on("pageerror", (error) => pageErrors.push(error.message));

            await route.mock?.(page);
            if (!route.public) await expectAuthenticatedPage(page);

            const viewport = viewportFor(width);
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.goto(route.path, { waitUntil: "networkidle" });
            await expect(page.locator("body")).toBeVisible();
            await page.evaluate(SETTLE_SCRIPT);

            const surface = await measureSurface(page);
            const head = `${route.path} | ${width}`;
            const findings: string[] = [];

            console.log(
              `[probe] ${head} | targets=${surface.targetCount} | scrollWidth=${surface.scrollWidth}/${surface.clientWidth} | under40=${surface.rows.length}`,
            );

            if (surface.overflowed) {
              findings.push(
                `${head} | 横向溢出 | scrollWidth=${surface.scrollWidth} > clientWidth=${surface.clientWidth} | - | - | -`,
              );
              for (const culprit of await findOverflowCulprits(page)) {
                findings.push(`${head} | 越界元素 | ${culprit} | - | - | -`);
              }
            }
            for (const row of surface.rows) {
              findings.push(`${head} | ${row.kind} | ${row.value} | ${row.tag} | ${row.height}px | ${row.html}`);
            }
            for (const error of consoleErrors) findings.push(`${head} | console | ${error} | - | - | -`);
            for (const error of pageErrors) findings.push(`${head} | pageerror | ${error} | - | - | -`);

            if (findings.length > 0) {
              console.log(`\n[ux-contract violations] ${head}\n  ${findings.join("\n  ")}\n`);
            }

            expect(
              findings,
              `路由 ${route.path} 触控尺寸/横向溢出/控制台违规 (${findings.length}):\n${findings.join("\n")}`,
            ).toEqual([]);
          });
        }
      }
    });
  }
}
