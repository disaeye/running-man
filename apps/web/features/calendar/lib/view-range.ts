import { dayKeyOffset, weekdayIndex } from "@shared/lib/training-day";
import type { CalendarView } from "./calendar-view";

export interface ViewRange {
  from: string;
  to: string;
}

/** 完整一周的周一至周日；`anchor` 是周内任意一天。 */
export function weekRangeOf(anchor: string): ViewRange {
  const monday = dayKeyOffset(anchor, -weekdayIndex(anchor));
  return { from: monday, to: dayKeyOffset(monday, 6) };
}

/** 月历网格覆盖的 42 天，含前后月份的补白日期。 */
export function monthGridRangeOf(monthKey: string): ViewRange {
  const firstOfMonth = `${monthKey}-01`;
  const from = dayKeyOffset(firstOfMonth, -weekdayIndex(firstOfMonth));
  return { from, to: dayKeyOffset(from, 41) };
}

export function yearRangeOf(year: number): ViewRange {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** 流水视图的时间窗口，结束于今天。 */
export function trailingRangeOf(today: string, days: number): ViewRange {
  return { from: dayKeyOffset(today, -(days - 1)), to: today };
}

/** 月视图负荷档位的参考窗口：最近 56 天，跨月不漂移。 */
export function monthScaleRangeOf(today: string): ViewRange {
  return trailingRangeOf(today, 56);
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number) as [number, number];
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return shifted.toISOString().slice(0, 7);
}

export function currentWeekAnchor(today: string, offset: number): string {
  return dayKeyOffset(today, offset * 7);
}

/**
 * 每个视图只请求自己需要的区间：周视图一周、月视图一个月历网格、流水最近 N 天。
 * 切换月份或翻周时区间随之变化，SWR 按区间缓存。
 */
export function viewRange(
  view: CalendarView,
  today: string,
  weekOffset: number,
  monthKey: string,
  listDays: number,
): ViewRange {
  if (view === "week") return weekRangeOf(currentWeekAnchor(today, weekOffset));
  if (view === "month") return monthGridRangeOf(monthKey);
  return trailingRangeOf(today, listDays);
}

/** 按运动员时区把 YYYY-MM-DD 转为当天 06:00 的 UTC ISO 时间戳。 */
export function athleteDayStartIso(day: string, timezone: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return new Date(`${day}T06:00:00Z`).toISOString();
  const localAsUtc = Date.UTC(year, month - 1, date, 6, 0, 0);
  let instant = localAsUtc;
  for (let i = 0; i < 4; i += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const vals = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
    if (vals.year === undefined) break;
    const actualAsUtc = Date.UTC(vals.year, (vals.month ?? 1) - 1, vals.day ?? 1, vals.hour ?? 0, vals.minute ?? 0);
    const diff = localAsUtc - actualAsUtc;
    instant += diff;
    if (diff === 0) break;
  }
  return new Date(instant).toISOString();
}
