import type { Page } from "@playwright/test";
import { activityFixture } from "./ux-activity-fixtures";
import { dashboardFixture } from "./ux-dashboard-fixtures";

function requestPath(requestUrl: string): string {
  try {
    return new URL(requestUrl).pathname;
  } catch (error) {
    throw new Error("Playwright returned a malformed request URL", { cause: error });
  }
}

export async function mockDashboard(page: Page): Promise<void> {
  await page.route("**/api/v1/**", (route) => {
    const pathname = requestPath(route.request().url());
    const body = activityFixture(pathname) ?? dashboardFixture(pathname);
    if (body === undefined) throw new Error(`Missing UX fixture for ${pathname}`);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-API-Version": "1" },
      body: JSON.stringify(body),
    });
  });
}
