import { describe, expect, it } from "vitest";
import { filterActivities } from "@features/activity/lib/filter-activities";
import type { ActivityFilterState } from "@features/activity/components/ActivityFilters";
import type { ActivitySummary } from "@shared/types/activity";

/**
 * The GPS filter is the reason this file exists.
 *
 * It used to test `source === "garmin"`. Two things were wrong at once: the
 * source registry has no `garmin` (this deployment syncs from Intervals.icu),
 * and `has_gps` was false for every row because it was derived from a raw
 * payload key that never appears. So the filter had two independent reasons to
 * match nothing, and the UI reported "no matching activities" for a query that
 * could not succeed.
 */

function activity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    activity_id: "a-1",
    start_time: "2026-09-01T06:00:00Z",
    sport: "Run",
    distance_m: 10_000,
    duration_s: 3_600,
    avg_hr: 150,
    max_hr: 175,
    avg_power: null,
    np: null,
    intensity_factor: null,
    tss: 50,
    icu_ctl: null,
    avg_cadence: null,
    avg_speed: null,
    elevation_gain_m: null,
    calories: null,
    external_id: null,
    source: "intervals_icu",
    file_type: null,
    device_name: null,
    ...overrides,
  };
}

const NO_FILTERS: ActivityFilterState = {
  from: "2026-06-01",
  to: "2026-09-30",
  sport: "all",
  intensity: "all",
  gpsOnly: false,
  source: "all",
};

describe("filterActivities gpsOnly", () => {
  it("keeps activities that actually have GPS", () => {
    const rows = [activity({ activity_id: "with", has_gps: true })];

    const result = filterActivities(rows, { ...NO_FILTERS, gpsOnly: true });

    expect(result.map((r) => r.activity_id)).toEqual(["with"]);
  });

  it("drops activities without GPS", () => {
    const rows = [
      activity({ activity_id: "with", has_gps: true }),
      activity({ activity_id: "without", has_gps: false }),
      activity({ activity_id: "unknown" }),
    ];

    const result = filterActivities(rows, { ...NO_FILTERS, gpsOnly: true });

    expect(result.map((r) => r.activity_id)).toEqual(["with"]);
  });

  it("does not key off the source name", () => {
    // The regression: an Intervals.icu activity with real GPS must pass.
    const rows = [activity({ source: "intervals_icu", has_gps: true })];

    const result = filterActivities(rows, { ...NO_FILTERS, gpsOnly: true });

    expect(result).toHaveLength(1);
  });

  it("is a no-op when gpsOnly is off", () => {
    const rows = [activity({ activity_id: "a", has_gps: false })];

    expect(filterActivities(rows, NO_FILTERS)).toHaveLength(1);
  });

  it("treats a missing flag as no GPS rather than including it", () => {
    // Absent means "unknown"; including it would make the filter meaningless.
    const rows = [activity({ activity_id: "a", has_gps: undefined })];

    expect(filterActivities(rows, { ...NO_FILTERS, gpsOnly: true })).toEqual([]);
  });
});
