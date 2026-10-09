import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEZONE,
  activityLocalDay,
  athleteRange,
  athleteToday,
  isoDayInZone,
} from "@shared/lib/training-day";

/**
 * The frontend had three day-key conventions in use at once:
 *
 *   `iso.slice(0, 10)`              — the payload's UTC date
 *   `new Date(iso).toISOString()…`  — convert to UTC, then truncate
 *   `toISODate(new Date())`         — the *browser's* local zone
 *
 * They disagree for part of every day, so the same activity could appear on
 * different days in different views — a run at 23:48 UTC is the 12th for an
 * athlete in Asia/Shanghai and the 11th by UTC. These pin the one rule the
 * backend already follows (domain/time/__init__.py: the athlete's local day is
 * canonical and UTC bucketing is a bug).
 */

const SHANGHAI = "Asia/Shanghai";
const NEW_YORK = "America/New_York";

describe("activityLocalDay", () => {
  it("uses the athlete's zone, not the payload's UTC date", () => {
    // 23:48 UTC on the 11th is the morning of the 12th in Shanghai.
    expect(activityLocalDay("2026-09-11T23:48:00Z", SHANGHAI)).toBe("2026-09-12");
    expect(activityLocalDay("2026-09-11T23:48:00Z", DEFAULT_TIMEZONE)).toBe("2026-09-11");
  });

  it("agrees with slice(0,10) only when the athlete is on UTC", () => {
    // 17:00 UTC is 01:00 the next day in Shanghai, so the two conventions
    // diverge. (Earlier in the UTC day they happen to match; that is exactly
    // why the bug survived — it is invisible for part of every day.)
    const iso = "2026-09-11T17:00:00Z";
    expect(activityLocalDay(iso, "UTC")).toBe(iso.slice(0, 10));
    expect(activityLocalDay(iso, SHANGHAI)).toBe("2026-09-12");
    expect(activityLocalDay(iso, SHANGHAI)).not.toBe(iso.slice(0, 10));
  });

  it("handles an instant already carrying an offset", () => {
    expect(activityLocalDay("2026-09-12T07:48:00+08:00", SHANGHAI)).toBe("2026-09-12");
  });

  it("falls back to UTC for an unknown zone rather than throwing", () => {
    // Matches the API, which treats an unparseable profile zone as UTC.
    expect(activityLocalDay("2026-09-11T23:48:00Z", "Not/AZone")).toBe("2026-09-11");
  });

  it("returns an empty key for an unparseable timestamp", () => {
    // Callers group by this; an empty key is visibly ungrouped rather than
    // silently landing on today.
    expect(activityLocalDay("not-a-date", SHANGHAI)).toBe("");
  });

  it("respects daylight saving rather than a fixed offset", () => {
    // New York is UTC-4 in July and UTC-5 in January.
    expect(activityLocalDay("2026-07-01T03:00:00Z", NEW_YORK)).toBe("2026-06-30");
    expect(activityLocalDay("2026-01-01T05:30:00Z", NEW_YORK)).toBe("2026-01-01");
  });
});

describe("isoDayInZone", () => {
  it("formats a Date in the given zone", () => {
    const instant = new Date("2026-09-11T23:48:00Z");
    expect(isoDayInZone(instant, SHANGHAI)).toBe("2026-09-12");
    expect(isoDayInZone(instant, "UTC")).toBe("2026-09-11");
  });
});

describe("athleteToday", () => {
  it("uses the athlete's zone, not the browser's", () => {
    // 2026-09-11T23:48Z — still the 11th in UTC, already the 12th in Shanghai.
    const now = new Date("2026-09-11T23:48:00Z");
    expect(athleteToday(SHANGHAI, now)).toBe("2026-09-12");
    expect(athleteToday("UTC", now)).toBe("2026-09-11");
  });
});

describe("athleteRange", () => {
  it("counts back inclusively", () => {
    const now = new Date("2026-09-11T12:00:00Z");
    expect(athleteRange(7, "UTC", now)).toEqual({
      from: "2026-09-05",
      to: "2026-09-11",
    });
  });

  it("returns a single day for days <= 1", () => {
    const now = new Date("2026-09-11T12:00:00Z");
    expect(athleteRange(1, "UTC", now)).toEqual({
      from: "2026-09-11",
      to: "2026-09-11",
    });
  });

  it("crosses a month boundary", () => {
    const now = new Date("2026-09-03T12:00:00Z");
    expect(athleteRange(7, "UTC", now).from).toBe("2026-08-28");
  });

  it("crosses a year boundary", () => {
    const now = new Date("2027-01-03T12:00:00Z");
    expect(athleteRange(7, "UTC", now).from).toBe("2026-12-28");
  });

  it("shifts by whole local days even across a DST transition", () => {
    // US DST starts 2026-03-08. Counting back from the 10th must land on the
    // 4th; offset arithmetic would be off by an hour and could skip a day.
    const now = new Date("2026-03-10T12:00:00Z");
    expect(athleteRange(7, NEW_YORK, now)).toEqual({
      from: "2026-03-04",
      to: "2026-03-10",
    });
  });
});
