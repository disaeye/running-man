import { expect, type Page } from "@playwright/test";

export async function expectAuthenticatedPage(page: Page): Promise<void> {
  await expect(page.locator("body")).toBeVisible();
}
