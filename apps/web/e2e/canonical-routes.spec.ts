/**
 * Canonical routes — Playwright discovery spec.
 *
 * This spec is authored for Todo 7. For this todo, only
 * `npx playwright test --list --grep "canonical routes"` is required —
 * the spec is intentionally thin and serves a documented `@tag` so the
 * orchestrator can isolate it from `visual-baseline` and the served QA
 * suites in later todos.
 *
 * The redirect-alias assertions below exercise the next.config.js redirect
 * surface; the in-page alias-settling assertions verify the canonical
 * URL the `useEffect` writes when the page mounts on a legacy URL —
 * the page-level effect calls a pure helper that decides either to
 * `router.replace(nextUrl)` or skip the call and short-circuit the
 * infinite-loop risk. That decision is the same code path the page
 * runs, so the spec asserts the helper output for every alias case to
 * give the served QA suite (Todo 15) an unambiguous expected URL.
 *
 * `@tag: canonical-routes`
 */
import { test, expect, type APIResponse } from "@playwright/test";
import {
  canonicalAnalysisSearch,
  canonicalCalendarSearch,
  canonicalSettingsSearch,
} from "@shared/config/canonical-routes";

interface AliasCase {
  readonly source: string;
  readonly canonical: string;
  readonly note: string;
}

const ALIAS_REDIRECTS: readonly AliasCase[] = [
  { source: "/performance", canonical: "/analysis?tab=performance", note: "/performance maps to analysis performance tab" },
  { source: "/health", canonical: "/analysis?tab=load", note: "/health maps to load adaptation" },
  { source: "/trends", canonical: "/analysis?tab=load", note: "/trends maps to load adaptation" },
  { source: "/data", canonical: "/settings?section=data", note: "/data maps to settings data section" },
  { source: "/export", canonical: "/settings?section=data", note: "/export maps to settings data section" },
  { source: "/plan", canonical: "/calendar", note: "/plan maps to calendar default view" },
];

interface InPageAlias {
  readonly search: string;
  readonly settled: string;
}

const ANALYSIS_INPAGE_ALIASES: readonly InPageAlias[] = [
  { search: "?tab=ability", settled: "/analysis?tab=performance" },
  { search: "?tab=recovery", settled: "/analysis" },
  { search: "?tab=load", settled: "/analysis" },
  { search: "?tab=performance", settled: "/analysis?tab=performance" },
  { search: "?tab=body", settled: "/analysis?tab=body" },
  // 强度分布与总览并入了负荷与恢复，旧链接落在默认视图
  { search: "?tab=intensity", settled: "/analysis" },
  // 默认模式是负荷与恢复；单次战报与力量训练继续通过显式 URL 访问。
  // 单次战报与力量分析不再属于分析页；旧链接回到默认视图
  { search: "?tab=session", settled: "/analysis" },
  { search: "?tab=strength", settled: "/analysis" },
  { search: "?tab=overview", settled: "/analysis" },
  { search: "?tab=garbage", settled: "/analysis" },
  { search: "?tab=ABILITY", settled: "/analysis" },
];

const CALENDAR_INPAGE_ALIASES: readonly InPageAlias[] = [
  { search: "?view=week", settled: "/calendar" },
  { search: "?view=month", settled: "/calendar?view=month" },
  // 流水视图与力量视图已是独立路由，由 middleware 在到达页面前改写
  { search: "?view=bad", settled: "/calendar" },
  { search: "?view=MONTH", settled: "/calendar" },
];

const SETTINGS_INPAGE_ALIASES: readonly InPageAlias[] = [
  { search: "?section=profile", settled: "/settings?section=account" },
  { search: "?section=training", settled: "/settings?section=training" },
  { search: "?tab=profile", settled: "/settings?section=account" },
  { search: "?tab=data", settled: "/settings" },
  { search: "?tab=garbage", settled: "/settings" },
];

function settledUrl(
  pathname: string,
  rawSearch: string,
  helperReturn: string | null,
): string {
  if (helperReturn !== null) return helperReturn;
  return rawSearch.length > 0 ? `${pathname}${rawSearch}` : pathname;
}

test.describe("canonical routes", () => {
  test.describe("redirect aliases (next.config.js)", () => {
    for (const aliasCase of ALIAS_REDIRECTS) {
      test(`${aliasCase.source} settles on ${aliasCase.canonical}`, async ({ request }) => {
        const response = await request.get(aliasCase.source, {
          maxRedirects: 0,
          failOnStatusCode: false,
        });

        expect([301, 308]).toContain(response.status());
        const location = response.headers()["location"];
        expect(location).toBe(aliasCase.canonical);
      });
    }
  });

  test.describe("redirect aliases (middleware)", () => {
    // 每个用例写死请求路径：只访问本站路由，Location 可能是绝对地址，只比较路径与查询串。
    const locationPath = (response: APIResponse) => {
      const location = response.headers()["location"] ?? "";
      const originEnd = location.startsWith("http") ? location.indexOf("/", location.indexOf("//") + 2) : 0;
      return location.slice(originEnd);
    };

    test("/calendar?view=list settles on /activities", async ({ request }) => {
      const response = await request.get("/calendar?view=list", {
        maxRedirects: 0,
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(308);
      expect(locationPath(response)).toBe("/activities");
    });

    test("/calendar?view=strength settles on /strength", async ({ request }) => {
      const response = await request.get("/calendar?view=strength", {
        maxRedirects: 0,
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(308);
      expect(locationPath(response)).toBe("/strength");
    });

    test("/settings?section=strength settles on /strength", async ({ request }) => {
      const response = await request.get("/settings?section=strength", {
        maxRedirects: 0,
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(308);
      expect(locationPath(response)).toBe("/strength");
    });
  });

  test.describe("in-page analysis alias settling", () => {
    for (const tuple of ANALYSIS_INPAGE_ALIASES) {
      test(`/analysis${tuple.search} settles the page to ${tuple.settled}`, () => {
        const params = new URLSearchParams(tuple.search.slice(1));
        expect(
          settledUrl("/analysis", tuple.search, canonicalAnalysisSearch(params)),
        ).toBe(tuple.settled);
      });
    }
  });

  test.describe("in-page calendar alias settling", () => {
    for (const tuple of CALENDAR_INPAGE_ALIASES) {
      test(`/calendar${tuple.search} settles the page to ${tuple.settled}`, () => {
        const params = new URLSearchParams(tuple.search.slice(1));
        expect(
          settledUrl("/calendar", tuple.search, canonicalCalendarSearch(params)),
        ).toBe(tuple.settled);
      });
    }
  });

  test.describe("in-page settings alias settling", () => {
    for (const tuple of SETTINGS_INPAGE_ALIASES) {
      test(`/settings${tuple.search} settles the page to ${tuple.settled}`, () => {
        const params = new URLSearchParams(tuple.search.slice(1));
        expect(
          settledUrl("/settings", tuple.search, canonicalSettingsSearch(params)),
        ).toBe(tuple.settled);
      });
    }
  });

  test.describe("deep links remain shareable", () => {
    test("analysis tab deep link keeps its query param", async ({ request }) => {
      const response = await request.get("/analysis?tab=performance", {
        maxRedirects: 0,
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(200);
    });

    test("calendar view deep link keeps its query param", async ({ request }) => {
      const response = await request.get("/calendar?view=month", {
        maxRedirects: 0,
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(200);
    });

    test("settings section deep link keeps its query param", async ({ request }) => {
      const response = await request.get("/settings?section=profile", {
        maxRedirects: 0,
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(200);
    });
  });

  test("matrix excludes legacy tab=ability and tab=recovery canonical entries", async () => {
    const { PRODUCT_ROUTE_MATRIX } = await import("./product-route-matrix");
    const canonicalPaths = PRODUCT_ROUTE_MATRIX.filter(
      (entry) => entry.aliasOf === undefined,
    ).map((entry) => entry.path);

    expect(canonicalPaths).not.toContain("/analysis?tab=ability");
    expect(canonicalPaths).not.toContain("/analysis?tab=recovery");
  });
});
