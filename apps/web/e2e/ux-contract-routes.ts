/**
 * Route matrix, API fixtures and layer layout for the UX contract gate.
 *
 * The surfaces themselves are declared in `ux-contract.spec.ts`; this module
 * only answers "which routes, at which widths, under which theme, with which
 * mocked responses" so the spec file stays a declaration and not a data blob.
 */
import type { Page } from "@playwright/test";
import { PRODUCT_ROUTE_MATRIX } from "./product-route-matrix";

export const ACTIVITY = {
  activity_id: "e2e-overflow", start_time: "2026-07-01T08:00:00Z", sport: "Run",
  distance_m: 21100, duration_s: 6420, avg_hr: 152, max_hr: 174,
  avg_power: null, np: null, intensity_factor: null, tss: 118, icu_ctl: 54,
  avg_cadence: 178, avg_speed: 3.28, elevation_gain_m: 240, calories: 1400,
  external_id: "i12345", source: "intervals_icu", file_type: "fit",
  device_name: "Garmin Forerunner 265", raw_data: null, has_gps: false,
  has_hr: true, has_power: false, has_cadence: true, weather: null,
  summary_polyline: null,
};

export const SHARE = {
  sport: "Run", date: "2026-07-17", duration_s: 6420, distance_m: 21100,
  name: "周末长距离：滨江往返",
};

/**
 * 分析响应：`ActivityAnalysisResponse` 的 zod 契约要求 `hr_zones` 是一个
 * 五个区间都在的数值对象（不可为 null），`laps` 与 `power_curve` 是数组，
 * `summary` 的四个数字字段可为 null。没有区间数据就把五段时长给 0——
 * 前端把总时长为 0 判成「暂无数据」，不会渲染出一堆假的区间。
 */
export const ACTIVITY_ANALYSIS = { hr_zones: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 }, laps: [], power_curve: [], summary: { np: null, if: null, tss: null, decoupling_pct: null } };

export async function json(page: Page, pattern: string, body: unknown): Promise<void> {
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-API-Version": "1" },
      body: JSON.stringify(body),
    }),
  );
}

export const MOCKS: ReadonlyMap<string, (page: Page) => Promise<void>> = new Map([
  ["/activities/e2e-overflow", async (page: Page) => {
    await json(page, "**/api/v1/activities/e2e-overflow*", ACTIVITY);
    // 两个子资源各是一条 URL：`/analysis` 是分段与心率区间，`/laps` 是设备圈段。
    // 没有它们，详情页会打出两条 404 console 错误。
    await json(page, "**/api/v1/activities/e2e-overflow/analysis", ACTIVITY_ANALYSIS);
    await json(page, "**/api/v1/activities/e2e-overflow/laps", []);
  }],
  ["/share/e2e-overflow", (page: Page) => json(page, "**/api/v1/share/e2e-overflow", SHARE)],
]);

export interface RouteCase {
  readonly path: string;
  readonly public: boolean;
  readonly mock: ((page: Page) => Promise<void>) | undefined;
}

export const ALL_ROUTES: readonly RouteCase[] = [
  ...PRODUCT_ROUTE_MATRIX.filter((entry) => entry.fixtureId === undefined).map((entry) => ({
    path: entry.path,
    public: entry.routeKind === "public",
    mock: MOCKS.get(entry.path),
  })),
  { path: "/activities/e2e-overflow", public: false, mock: MOCKS.get("/activities/e2e-overflow") },
  { path: "/share/e2e-overflow", public: true, mock: MOCKS.get("/share/e2e-overflow") },
];

export const CORE_ROUTES: readonly RouteCase[] = [
  { path: "/", public: false, mock: undefined },
  { path: "/calendar", public: false, mock: undefined },
  { path: "/activities", public: false, mock: undefined },
  { path: "/analysis", public: false, mock: undefined },
  { path: "/goals", public: false, mock: undefined },
  { path: "/settings", public: false, mock: undefined },
  { path: "/activities/e2e-overflow", public: false, mock: MOCKS.get("/activities/e2e-overflow") },
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
