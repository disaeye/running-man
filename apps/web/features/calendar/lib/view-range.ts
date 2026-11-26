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

export function monthRangeOf(monthKey: string): ViewRange {
  return { from: `${monthKey}-01`, to: dayKeyOffset(`${shiftMonth(monthKey, 1)}-01`, -1) };
}

/** 月历网格覆盖的 42 天，含前后月份的补白日期。 */
export function monthGridRangeOf(monthKey: string): ViewRange {
  const firstOfMonth = `${monthKey}-01`;
  const from = dayKeyOffset(firstOfMonth, -weekdayIndex(firstOfMonth));
  return { from, to: dayKeyOffset(from, 41) };
}

/** 结束于 `today` 的最近 `days` 天窗口。 */
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

/** 锚点日在相邻几周的同一天；负数向前翻。 */
export function shiftAnchorWeek(anchor: string, deltaWeeks: number): string {
  return dayKeyOffset(anchor, deltaWeeks * 7);
}

/** 锚点日在相邻月份的同一天；目标月份没有这一天（如 31 日）时取该月月末。 */
export function shiftAnchorMonth(anchor: string, deltaMonths: number): string {
  const [year, month, day] = anchor.split("-").map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(year, month + deltaMonths, 0)).getUTCDate();
  const clamped = Math.min(day, lastDay);
  return `${shiftMonth(anchor.slice(0, 7), deltaMonths)}-${String(clamped).padStart(2, "0")}`;
}

/**
 * 每个视图只请求自己需要的区间：周视图包含锚点的一周，月视图锚点所在的月历网格。
 * 翻周或翻月时锚点随之变化，SWR 按区间缓存。
 */
export function viewRange(view: CalendarView, anchor: string): ViewRange {
  return view === "week" ? weekRangeOf(anchor) : monthGridRangeOf(anchor.slice(0, 7));
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
