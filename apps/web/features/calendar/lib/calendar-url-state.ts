import type { SportFamily } from "@shared/config/sport-config";
import { activityLocalDay } from "@shared/lib/training-day";
import type { CalendarView } from "./calendar-view";

export type CalendarSportFamily = Extract<SportFamily, "running" | "strength"> | "all";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseSportFamilyParam(raw: string | null): CalendarSportFamily {
  if (raw === "run" || raw === "running") return "running";
  return raw === "strength" ? "strength" : "all";
}

/**
 * `?date=` 是周历或月历的锚点日：周历显示包含它的一周，月历显示它所在的月份。
 * 格式或日期非法时返回 null，页面回到今天所在的周或月。
 */
export function parseCalendarDateParam(raw: string | null): string | null {
  if (!raw || !ISO_DAY.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number) as [number, number, number];
  if (month < 1 || month > 12 || day < 1) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.toISOString().slice(0, 10) === raw ? raw : null;
}

export function buildCalendarUrl(
  searchParams: URLSearchParams,
  patch: {
    readonly view?: CalendarView;
    readonly family?: CalendarSportFamily;
    /** `null` 清除锚点，回到今天所在的周或月。 */
    readonly date?: string | null;
  },
): string {
  const next = new URLSearchParams(searchParams.toString());
  if (patch.view !== undefined) {
    if (patch.view === "week") next.delete("view");
    else next.set("view", patch.view);
  }
  if (patch.family !== undefined) {
    if (patch.family === "all") next.delete("sport");
    else next.set("sport", patch.family === "running" ? "run" : patch.family);
  }
  if (patch.date !== undefined) {
    if (patch.date === null) next.delete("date");
    else next.set("date", patch.date);
  }
  const query = next.toString();
  return query ? `/calendar?${query}` : "/calendar";
}

export function dailyTss(
  activities: readonly { readonly start_time: string; readonly tss?: number | null }[],
  timezone: string,
): number[] {
  const byDay = new Map<string, number>();
  for (const activity of activities) {
    const day = activityLocalDay(activity.start_time, timezone);
    byDay.set(day, (byDay.get(day) ?? 0) + (activity.tss ?? 0));
  }
  return [...byDay.values()];
}
