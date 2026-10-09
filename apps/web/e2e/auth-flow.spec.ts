import { expect, test } from "@playwright/test";

test.describe("public auth share", () => {
  test("login form renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("login form POSTs (not GETs) — CDN hydration regression guard", async ({ page }) => {
    let reqMethod = "";
    await page.route("**/api/v1/auth/login", async (route) => {
      reqMethod = route.request().method();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("qa@example.test");
    await page.locator('input[name="password"]').fill("not-a-real-password");
    await page.locator('button[type="submit"]').click();
    await expect.poll(() => reqMethod, { timeout: 5000 }).toBe("POST");
  });

  test("login form submits only to its intercepted endpoint", async ({ page }) => {
    let intercepted = false;
    await page.route("**/api/v1/auth/login", async (route) => {
      intercepted = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("qa@example.test");
    await page.locator('input[name="password"]').fill("not-a-real-password");
    await page.locator('button[type="submit"]').click();
    await expect.poll(() => intercepted).toBe(true);
  });

  test("register form POSTs (not GETs) — CDN hydration regression guard", async ({ page }) => {
    const reqMethods: string[] = [];
    await page.route("**/api/v1/auth/register", async (route) => {
      reqMethods.push(`register:${route.request().method()}`);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: { "X-API-Version": "1" },
        body: JSON.stringify({ access_token: "mock-register-token" }),
      });
    });
    await page.route("**/api/v1/auth/login", async (route) => {
      reqMethods.push(`login:${route.request().method()}`);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "X-API-Version": "1" },
        body: JSON.stringify({ access_token: "mock-login-token" }),
      });
    });
    await page.goto("/register");
    await page.locator('input[name="name"]').fill("QA User");
    await page.locator('input[name="email"]').fill("qa@example.test");
    await page.locator('input[name="password"]').fill("not-a-real-password");
    await page.locator('button[type="submit"]').click();
    await expect.poll(() => reqMethods, { timeout: 5000 }).toEqual([
      "register:POST",
      "login:POST",
    ]);
  });

  test("register form submits only to its intercepted endpoints", async ({ page }) => {
    const interceptedEndpoints: string[] = [];
    await page.route("**/api/v1/auth/register", async (route) => {
      interceptedEndpoints.push("register");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: { "X-API-Version": "1" },
        body: JSON.stringify({ access_token: "mock-register-token" }),
      });
    });
    await page.route("**/api/v1/auth/login", async (route) => {
      interceptedEndpoints.push("login");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "X-API-Version": "1" },
        body: JSON.stringify({ access_token: "mock-login-token" }),
      });
    });
    await page.goto("/register");
    await page.locator('input[name="name"]').fill("QA User");
    await page.locator('input[name="email"]').fill("qa@example.test");
    await page.locator('input[name="password"]').fill("not-a-real-password");
    await page.locator('button[type="submit"]').click();
    await expect.poll(() => interceptedEndpoints).toEqual(["register", "login"]);
  });

  test("redirects to login when accessing protected route without auth", async ({
    context,
    page,
  }) => {
    await context.clearCookies();
    // /activities is a permanent redirect to /calendar?view=list, which then
    // hits the auth check — so the final URL carries ?next= rather than being
    // the bare /login the test used to expect.
    await page.goto("/activities");
    await page.waitForURL(/\/login(\?|$)/);
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });
});
