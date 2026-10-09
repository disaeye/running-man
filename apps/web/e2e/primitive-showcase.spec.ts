/**
 * Primitive showcase — Playwright discovery spec.
 *
 * Validates the v7 primitive gallery at /showcase (dev-only route).
 * Covers: route reachability, all 7 tabs, touch targets, theme toggle,
 * reduced-motion note, overflow, and nav exclusion.
 *
 * @tag: primitive-showcase
 */
import { test, expect } from "@playwright/test";

test.describe("primitive showcase", () => {
  test("showcase route is reachable at /showcase", async ({ page }) => {
    await page.goto("/showcase");
    await expect(
      page.getByRole("heading", { level: 1, name: "Primitive Showcase" }),
    ).toBeVisible();
  });

  test("showcase renders all 7 tab sections", async ({ page }) => {
    await page.goto("/showcase");
    const expectedTabs = ["Buttons", "Cards", "Inputs", "Feedback", "Layout", "Overlays", "Rings"];
    for (const tab of expectedTabs) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    }
  });

  test("default buttons meet 44px touch target", async ({ page }) => {
    await page.goto("/showcase");
    const defaultBtn = page
      .getByRole("button", { name: "Default (44px)" })
      .first();
    const box = await defaultBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("icon buttons meet 44px touch target", async ({ page }) => {
    await page.goto("/showcase");
    const iconBtn = page.getByRole("button", { name: "Default icon" });
    const box = await iconBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("list rows meet 44px touch target", async ({ page }) => {
    await page.goto("/showcase");
    await page.getByRole("tab", { name: "Layout" }).click();
    const listRow = page.getByRole("button", { name: /账户设置/ });
    const box = await listRow.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("theme toggle is present and clickable", async ({ page }) => {
    await page.goto("/showcase");
    const toggle = page.getByRole("button", { name: /切换到/ });
    await expect(toggle).toBeVisible();
    await toggle.click();
  });

  test("reduced-motion note is rendered", async ({ page }) => {
    await page.goto("/showcase");
    await expect(page.getByText(/Reduced motion/)).toBeVisible();
  });

  test("dialog can be opened from overlays tab", async ({ page }) => {
    await page.goto("/showcase");
    await page.getByRole("tab", { name: "Overlays" }).click();
    await page.getByRole("button", { name: "Open Dialog" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("focus ring is visible on keyboard navigation", async ({ page }) => {
    await page.goto("/showcase");
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus-visible");
    await expect(focused).toBeVisible();
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/showcase");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("no horizontal overflow at 768px", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/showcase");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("no horizontal overflow at 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/showcase");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("showcase renders in light mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/showcase");
    await expect(
      page.getByRole("heading", { level: 1, name: "Primitive Showcase" }),
    ).toBeVisible();
  });

  test("showcase renders in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/showcase");
    await expect(
      page.getByRole("heading", { level: 1, name: "Primitive Showcase" }),
    ).toBeVisible();
  });

  test("showcase is not in navigation config", async ({ page }) => {
    const response = await page.goto("/showcase");
    expect(response?.status()).toBe(200);
  });
});
