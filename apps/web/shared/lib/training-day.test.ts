import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEZONE,
  activityLocalDay,
  athleteRange,
  athleteToday,
  athleteWeekRange,
  isoDayInZone,
  rangeEndingOn,
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

describe("rangeEndingOn", () => {
  it("counts back from the supplied key, not from today", () => {
    // A preset button rebuilds its window around the range's own end. Anchoring
    // on "today" here would silently jump the window when the user has paged
    // away from the present.
    expect(rangeEndingOn("2026-09-11", 7)).toEqual({
      from: "2026-09-05",
      to: "2026-09-11",
    });
  });

  it("returns the single key for days <= 1", () => {
    expect(rangeEndingOn("2026-09-11", 1)).toEqual({
      from: "2026-09-11",
      to: "2026-09-11",
    });
  });

  it("matches athleteRange when the key is the athlete's today", () => {
    const now = new Date("2026-09-11T12:00:00Z");
    const key = athleteToday(SHANGHAI, now);
    expect(rangeEndingOn(key, 30)).toEqual(athleteRange(30, SHANGHAI, now));
  });

  it("crosses a month boundary", () => {
    expect(rangeEndingOn("2026-09-03", 7).from).toBe("2026-08-28");
  });
});

describe("athleteWeekRange", () => {
  it("runs Monday through today", () => {
    // 2026-09-11 is a Friday.
    const now = new Date("2026-09-11T12:00:00Z");
    expect(athleteWeekRange("UTC", now)).toEqual({
      from: "2026-09-07",
      to: "2026-09-11",
    });
  });

  it("treats Sunday as the end of the week, not the start", () => {
    // 2026-09-13 is a Sunday; the ISO week began on the 7th.
    const now = new Date("2026-09-13T12:00:00Z");
    expect(athleteWeekRange("UTC", now)).toEqual({
      from: "2026-09-07",
      to: "2026-09-13",
    });
  });

  it("starts Monday on exactly the Monday when today is Monday", () => {
    const now = new Date("2026-09-07T12:00:00Z");
    expect(athleteWeekRange("UTC", now)).toEqual({
      from: "2026-09-07",
      to: "2026-09-07",
    });
  });

  /**
   * Monday anchoring is why this one is worth pinning: when the athlete and the
   * host disagree about the date, the two answers differ by a whole week, not by
   * a day. The host's week below is the 8th–14th; the athlete is already on the
   * 7th–13th.
   */
  it("rolls the week over when the host is still on the previous Sunday", () => {
    // 16:00Z on Sunday the 13th is already Monday the 14th in Shanghai (UTC+8).
    // The athlete's week is therefore the 14th alone, while a host-local week
    // would still be showing 7th–13th — the two disagree about which week every
    // planned session belongs to, not merely about its last day.
    const now = new Date("2026-09-13T16:00:00Z");
    expect(athleteWeekRange(SHANGHAI, now)).toEqual({
      from: "2026-09-14",
      to: "2026-09-14",
    });
  });

  it("keeps the athlete's week when the host is a day behind", () => {
    // 03:00Z on Monday the 14th is still Sunday the 13th in New York (UTC-4),
    // and that Sunday closes the week that began on the 7th. Anchoring on the
    // host would instead open a brand new week starting on the 14th.
    const now = new Date("2026-09-14T03:00:00Z");
    expect(athleteWeekRange(NEW_YORK, now)).toEqual({
      from: "2026-09-07",
      to: "2026-09-13",
    });
  });

  it("keeps the athlete's week when the athlete is on Sunday but the host is not", () => {
    // 17:00Z on Sunday the 13th is still the 13th in New York (Sunday, UTC-4),
    // while Shanghai has already rolled into Monday the 14th. Monday anchoring
    // on the host would start the week on the 14th and silently drop the 13th.
    const now = new Date("2026-09-13T17:00:00Z");
    expect(athleteWeekRange(NEW_YORK, now)).toEqual({
      from: "2026-09-07",
      to: "2026-09-13",
    });
  });

  it("crosses a month boundary", () => {
    // 2026-10-01 is a Thursday; that week began on the 28th of September.
    const now = new Date("2026-10-01T12:00:00Z");
    expect(athleteWeekRange("UTC", now)).toEqual({
      from: "2026-09-28",
      to: "2026-10-01",
    });
  });

  it("crosses a year boundary", () => {
    // 2027-01-01 is a Friday; that week began on 2026-12-28.
    const now = new Date("2027-01-01T12:00:00Z");
    expect(athleteWeekRange("UTC", now)).toEqual({
      from: "2026-12-28",
      to: "2027-01-01",
    });
  });
});
