import { describe, expect, it } from "vitest";
import { isoWeek } from "@features/calendar/lib/build-week-summary";

/**
 * The calendar header used to read a hard-coded "WEEK 35", so it was wrong for
 * most of the year. These pin the ISO-8601 rule the week grid actually uses:
 * weeks start Monday and week 1 is the one containing the first Thursday.
 *
 * The naive alternatives — dividing the day-of-year by seven, or using
 * `getWeek()` from a date library without specifying ISO semantics — disagree
 * at year boundaries, which is exactly when a wrong label is most confusing.
 */

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe("isoWeek", () => {
  it("numbers a mid-year date", () => {
    // 2026-09-01 is a Tuesday in ISO week 36.
    expect(isoWeek(utc(2026, 9, 1))).toEqual({ week: 36, year: 2026 });
  });

  it("puts the first days of January in week 1 when they belong there", () => {
    // 2026-01-01 is a Thursday, so its week is week 1.
    expect(isoWeek(utc(2026, 1, 1))).toEqual({ week: 1, year: 2026 });
  });

  it("assigns early January to the previous ISO year when the week started then", () => {
    // 2027-01-01 is a Friday, so it belongs to week 53 of 2026.
    expect(isoWeek(utc(2027, 1, 1))).toEqual({ week: 53, year: 2026 });
  });

  it("keeps late December in its own week when that week belongs to the old year", () => {
    // 2026-12-31 is a Thursday, so it closes week 53 of 2026 rather than
    // opening 2027. Verified against Python's date.isocalendar().
    expect(isoWeek(utc(2026, 12, 31))).toEqual({ week: 53, year: 2026 });
  });

  it("assigns a January date to the previous year when its week began there", () => {
    // ISO weeks start Monday, so 2027-01-01 (Friday) still belongs to 2026's
    // last week. Cross-checked against date.isocalendar().
    expect(isoWeek(utc(2027, 1, 1))).toEqual({ week: 53, year: 2026 });
  });

  it("treats Monday as the first day of the week", () => {
    // 2026-09-07 is a Monday; Sunday 2026-09-13 closes the same week.
    const monday = isoWeek(utc(2026, 9, 7));
    const sunday = isoWeek(utc(2026, 9, 13));
    expect(monday).toEqual(sunday);
  });

  it("rolls over on the following Monday", () => {
    const week = isoWeek(utc(2026, 9, 7));
    const next = isoWeek(utc(2026, 9, 14));
    expect(next.week).toBe(week.week + 1);
  });

  it("returns a week number in the valid range for every day of a year", () => {
    for (let day = 0; day < 365; day += 1) {
      const { week } = isoWeek(new Date(Date.UTC(2026, 0, 1 + day)));
      expect(week).toBeGreaterThanOrEqual(1);
      expect(week).toBeLessThanOrEqual(53);
    }
  });
});
