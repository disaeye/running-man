import type { Page } from "@playwright/test";
import { ACTIVITY, ACTIVITY_ANALYSIS, SHARE } from "./ux-activity-fixtures";
import { mockDashboard } from "./ux-dashboard-mocks";
import { PRODUCT_ROUTE_MATRIX } from "./product-route-matrix";

export interface RouteCase {
  readonly path: string;
  readonly public: boolean;
  readonly mock: ((page: Page) => Promise<void>) | undefined;
}

async function json(page: Page, pattern: string, body: unknown): Promise<void> {
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-API-Version": "1" },
      body: JSON.stringify(body),
    }),
  );
}

async function mockOverflowActivity(page: Page): Promise<void> {
  await json(page, "**/api/v1/activities/e2e-overflow", ACTIVITY);
  await json(page, "**/api/v1/activities/e2e-overflow/analysis", ACTIVITY_ANALYSIS);
  await json(page, "**/api/v1/activities/e2e-overflow/streams", []);
  await json(page, "**/api/v1/activities/e2e-overflow/laps", []);
}

async function mockOverflowShare(page: Page): Promise<void> {
  await json(page, "**/api/v1/share/e2e-overflow", SHARE);
}

export const MOCKS: ReadonlyMap<string, RouteCase["mock"]> = new Map([
  ["/", mockDashboard],
  ["/calendar", mockDashboard],
  ["/calendar?view=week", mockDashboard],
  ["/calendar?view=month", mockDashboard],
  ["/calendar?view=list", mockDashboard],
  ["/analysis", mockDashboard],
  ["/analysis?tab=strength", mockDashboard],
  ["/analysis?tab=overview", mockDashboard],
  ["/analysis?tab=load", mockDashboard],
  ["/analysis?tab=performance", mockDashboard],
  ["/analysis?tab=intensity", mockDashboard],
  ["/goals", mockDashboard],
  ["/profile", mockDashboard],
  ["/settings", mockDashboard],
  ["/settings?section=data", mockDashboard],
  ["/settings?section=training", mockDashboard],
  ["/settings?section=account", mockDashboard],
  ["/activities", mockDashboard],
  ["/plan", mockDashboard],
  ["/calendar/full", mockDashboard],
  ["/health", mockDashboard],
  ["/trends", mockDashboard],
  ["/data", mockDashboard],
  ["/export", mockDashboard],
  ["/strength", mockDashboard],
  ["/strength/analytics", mockDashboard],
  ["/calendar?view=strength", mockDashboard],
  ["/performance", mockDashboard],
  ["/gear", mockDashboard],
  ["/library", mockDashboard],
  ["/activities/e2e-overflow", mockOverflowActivity],
  ["/share/e2e-overflow", mockOverflowShare],
]);

export const ALL_ROUTES: readonly RouteCase[] = [
  ...PRODUCT_ROUTE_MATRIX.filter((entry) => entry.fixtureId === undefined).map((entry) => ({
    path: entry.path,
    public: entry.routeKind === "public",
    mock: MOCKS.get(entry.path),
  })),
  { path: "/activities/e2e-overflow", public: false, mock: mockOverflowActivity },
  { path: "/share/e2e-overflow", public: true, mock: mockOverflowShare },
];

export const CORE_ROUTES: readonly RouteCase[] = [
  { path: "/", public: false, mock: mockDashboard },
  { path: "/calendar", public: false, mock: mockDashboard },
  { path: "/activities", public: false, mock: mockDashboard },
  { path: "/analysis", public: false, mock: mockDashboard },
  { path: "/analysis?tab=strength", public: false, mock: mockDashboard },
  { path: "/goals", public: false, mock: mockDashboard },
  { path: "/profile", public: false, mock: mockDashboard },
  { path: "/settings", public: false, mock: mockDashboard },
  { path: "/activities/e2e-overflow", public: false, mock: mockOverflowActivity },
];

export interface Layer {
  readonly label: string;
  readonly theme: "light" | "dark";
  readonly widths: readonly number[];
  readonly routes: readonly RouteCase[];
}

export const LAYERS: readonly Layer[] = [
  { label: "A", theme: "light", widths: [390, 768, 1280], routes: ALL_ROUTES },
  { label: "B", theme: "light", widths: [844, 1024, 1440], routes: CORE_ROUTES },
  { label: "C", theme: "dark", widths: [390, 768, 844, 1024, 1280, 1440], routes: CORE_ROUTES },
];

export const VIEWPORTS = [
  { name: "desktop 1440", width: 1440, height: 900 },
  { name: "desktop 1280", width: 1280, height: 800 },
  { name: "tablet landscape 1024", width: 1024, height: 768 },
  { name: "phone landscape 844x390", width: 844, height: 390 },
  { name: "tablet portrait 768", width: 768, height: 1024 },
  { name: "phone portrait 390", width: 390, height: 844 },
] as const;

const VIEWPORT_BY_WIDTH: ReadonlyMap<number, { readonly width: number; readonly height: number }> = new Map(
  VIEWPORTS.map((viewport) => [viewport.width, viewport] as const),
);

export function viewportFor(width: number): { readonly width: number; readonly height: number } {
  return VIEWPORT_BY_WIDTH.get(width) ?? { width, height: 900 };
}
