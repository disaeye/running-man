import { describe, expect, it } from "vitest";
import { resolveCalendarView, type CalendarView } from "@features/calendar/lib/calendar-view";

const CASES: readonly [string | null, CalendarView][] = [
  ["week", "week"],
  ["month", "month"],
  ["list", "list"],
  [null, "week"],
  ["hour", "week"],
  ["", "week"],
];

describe("resolveCalendarView", () => {
  it.each(CASES)("%s → %s", (raw, expected) => {
    expect(resolveCalendarView(raw)).toBe(expected);
  });
});
