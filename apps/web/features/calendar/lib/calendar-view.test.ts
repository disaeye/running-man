import { describe, expect, it } from "vitest";
import { resolveCalendarView, type CalendarView } from "@features/calendar/lib/calendar-view";

const CASES: readonly [string | null, CalendarView][] = [
  ["week", "week"],
  ["month", "month"],
  // 流水视图与力量工作台已是独立路由，旧值不再被日历识别
  ["list", "week"],
  ["strength", "week"],
  [null, "week"],
  ["hour", "week"],
  ["", "week"],
];

describe("resolveCalendarView", () => {
  it.each(CASES)("%s → %s", (raw, expected) => {
    expect(resolveCalendarView(raw)).toBe(expected);
  });
});
