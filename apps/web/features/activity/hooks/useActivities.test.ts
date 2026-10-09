import { describe, expect, it } from "vitest";
import { hasUsableRange } from "./useActivities";

/**
 * Regression test for a 422 that fired on every visit to /activities.
 *
 * `/activities` redirects to `/calendar?view=list` (see next.config.js), and in
 * list view `qualityRange` returns `undefined`. The page then called
 * `usePlanMatch(planRange?.from ?? "", planRange?.to ?? "", events)`, so the
 * hook issued `GET /api/v1/activities?from=&to=` — which the API rejects with
 * 422. The failure was invisible in normal use because the list view has its
 * own data path; only a listener on the network log saw it.
 *
 * The hook now treats an incomplete range as "do not fetch yet" rather than
 * "fetch everything", so the guard is what this asserts.
 */
describe("hasUsableRange", () => {
  it("rejects the empty range a not-yet-resolved caller builds", () => {
    expect(hasUsableRange("", "")).toBe(false);
  });

  it("rejects a half-specified range", () => {
    // One bound missing is still a 422, not a valid open-ended query.
    expect(hasUsableRange("2026-09-01", "")).toBe(false);
    expect(hasUsableRange("", "2026-09-14")).toBe(false);
  });

  it("accepts a complete range", () => {
    expect(hasUsableRange("2026-06-16", "2026-09-14")).toBe(true);
  });

  it("accepts a single-day range", () => {
    expect(hasUsableRange("2026-09-14", "2026-09-14")).toBe(true);
  });
});
