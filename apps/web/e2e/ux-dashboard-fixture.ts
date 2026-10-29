import { expect, type Page } from "@playwright/test";

/** Records failing responses from the real dashboard API used by the browser. */
export function monitorDashboardApi(page: Page): () => void {
  const failures: string[] = [];
  page.on("response", (response) => {
    if (!response.url().includes("/api/v1/") || response.status() < 400) return;
    failures.push(`${response.status()} ${response.url()}`);
  });
  return () => expect(failures, "dashboard API responses").toEqual([]);
}
