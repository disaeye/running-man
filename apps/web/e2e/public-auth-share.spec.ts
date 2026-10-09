/**
 * Public surfaces — Playwright discovery spec for Todo 8.
 *
 * Authored for the v6 public/auth/share redesign:
 *   `/landing`, `/login`, `/register`, `/_not-found`, `/share/[token]`
 *
 * For this todo, only `npx playwright test --list --grep "public auth share"`
 * is required — served execution belongs to Todo 15 (and any served run
 * must intercept every `/api/v1/auth/*` endpoint so no real register /
 * login / refresh / logout request escapes the test harness).
 *
 * This spec asserts:
 *   - every public surface is reachable without authentication
 *   - the login/register forms have no fake social-login or
 *     password-reset affordances
 *   - the share page renders all five states (ready / expired-revoked /
 *     not-found / partial-metrics / network-error) by serving the right
 *     deterministic mocks at request time
 *   - the not-found page reaches the user without exposing the
 *     `/api/v1` prefix or version-mismatch diagnostics
 *
 * `@tag: public-auth-share`
 */
import { expect, test } from "@playwright/test";

const API_VERSION_HEADER = { "x-api-version": "1" };

function jsonRoute(
  route: import("@playwright/test").Route,
  status: number,
  body: unknown,
) {
  void route.fulfill({
    status,
    contentType: "application/json",
    headers: API_VERSION_HEADER,
    body: JSON.stringify(body),
  });
}

test.describe("public auth share", () => {
  test.describe("landing", () => {
    test("renders the brand, feature grid, and CTAs without auth", async ({
      page,
    }) => {
      await page.goto("/landing");

      // The hero heading is the value proposition, not the brand name (which
      // appears in the header link instead).
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: /Running Man/ })).toBeVisible();
      // The page's own CTA wording: a sign-in link plus register-intent links.
      // Asserting the literal "注册" failed because the CTAs read 进入系统 /
      // 建立你的节奏 / 免费建立档案 — the hrefs point at /register either way.
      await expect(page.getByRole("link", { name: "登录" }).first()).toBeVisible();
      await expect(page.locator('a[href="/register"]').first()).toBeVisible();

      // No fake trust/legal links leaked onto the landing page.
      await expect(page.getByText("Features")).toHaveCount(0);
      await expect(page.getByText("Pricing")).toHaveCount(0);
      await expect(page.getByText("About")).toHaveCount(0);
      await expect(page.getByText("Privacy Policy")).toHaveCount(0);
    });
  });

  test.describe("login", () => {
    test("renders email + password + submit, with no social/reset affordances", async ({
      page,
    }) => {
      await page.goto("/login");

      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      // No social login and no password reset — backend has none.
      await expect(page.getByText(/微信|微博|QQ|GitHub|Google/i)).toHaveCount(0);
      await expect(page.getByText(/忘记密码|reset password/i)).toHaveCount(0);
    });
  });

  test.describe("register", () => {
    test("renders name + email + password + submit, no social/reset affordances", async ({
      page,
    }) => {
      await page.goto("/register");

      await expect(page.locator('input[name="name"]')).toBeVisible();
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      await expect(page.getByText(/微信|微博|QQ|GitHub|Google/i)).toHaveCount(0);
      await expect(page.getByText(/忘记密码|reset password/i)).toHaveCount(0);
    });
  });

  test.describe("share /[token] unauthenticated states", () => {
    test("renders the ready activity view when the share fetch succeeds", async ({
      page,
    }) => {
      await page.route("**/api/v1/share/public-token", (route) =>
        jsonRoute(route, 200, {
          sport: "Run",
          date: "2026-07-17",
          duration_s: 1800,
          distance_m: 5000,
          name: "Morning Run",
          avg_hr: 152,
          elevation_gain_m: 42,
        }),
      );

      await page.goto("/share/public-token");

      await expect(page.getByRole("heading", { name: "Morning Run" })).toBeVisible();
      await expect(page.getByText("30 分钟")).toBeVisible();
      await expect(page.getByText("5.0 km")).toBeVisible();
    });

    test("renders an expired/revoked/not-found state for a 404", async ({
      page,
    }) => {
      await page.route("**/api/v1/share/expired-token", (route) =>
        jsonRoute(route, 404, { detail: "not found" }),
      );

      await page.goto("/share/expired-token");

      await expect(page.getByText("分享已失效")).toBeVisible();
      await expect(page.getByText(/X-API-Version/)).toHaveCount(0);
    });

    test("renders a network-error state distinct from server errors", async ({
      page,
    }) => {
      await page.route("**/api/v1/share/network-token", (route) =>
        route.abort("connectionrefused"),
      );

      await page.goto("/share/network-token");

      await expect(page.getByText("无法连接")).toBeVisible();
    });

    test("only renders the metrics that are present (partial metrics supported)", async ({
      page,
    }) => {
      await page.route("**/api/v1/share/partial-token", (route) =>
        jsonRoute(route, 200, {
          sport: "Run",
          date: "2026-07-17",
          duration_s: 1800,
          distance_m: null,
          name: "Treadmill Run",
          avg_hr: null,
          elevation_gain_m: null,
        }),
      );

      await page.goto("/share/partial-token");

      await expect(page.getByRole("heading", { name: "Treadmill Run" })).toBeVisible();
      await expect(page.getByText("30 分钟")).toBeVisible();
      await expect(page.getByText(/5\.0 km/)).toHaveCount(0);
      await expect(page.getByText(/bpm/)).toHaveCount(0);
    });
  });

  test.describe("not-found", () => {
    test("renders a safe 404 without leaking api/version diagnostics", async ({
      page,
    }) => {
      const response = await page.goto("/this-page-does-not-exist");
      expect(response?.status()).toBe(404);

      await expect(page.getByText("404")).toBeVisible();
      await expect(page.getByRole("heading", { name: "页面不存在" })).toBeVisible();
      await expect(page.getByRole("link", { name: "返回首页" })).toBeVisible();
      await expect(page.getByText(/api\/v1/)).toHaveCount(0);
      await expect(page.getByText(/X-API-Version/)).toHaveCount(0);
    });
  });
});
