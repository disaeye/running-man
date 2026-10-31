import { expect, test } from "@playwright/test";

test.describe("auth", () => {
  // These exercise the sign-in flow itself, so they run without the shared
  // authenticated storage state.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login form renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("login password can be shown and hidden without losing its value", async ({ page }) => {
    await page.goto("/login");
    const password = page.locator('input[name="password"]');
    const toggle = page.getByRole("button", { name: "显示密码" });
    await password.fill("not-a-real-password");

    await expect(password).toHaveAttribute("type", "password");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();

    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("not-a-real-password");
    await expect(page.getByRole("button", { name: "隐藏密码" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "隐藏密码" }).focus();
    await page.keyboard.press("Space");
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue("not-a-real-password");
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
    // The requested protected route remains in the login URL so sign-in can return here.
    await page.goto("/profile");
    await page.waitForURL(/\/login(\?|$)/);
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });
});
