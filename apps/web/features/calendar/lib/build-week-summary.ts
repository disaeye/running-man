import { toISODate } from "@shared/lib/format";
import { DEFAULT_TIMEZONE, activityLocalDay } from "@shared/lib/training-day";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";

export interface WeekSummary {
  completed: number;
  total: number;
  plannedTss: number;
  actualTss: number;
}

export interface BuildWeekSummaryArgs {
  events: CalendarEventDTO[];
  activityMap: Map<string, ActivitySummary[]>;
  weekStart: Date;
  /** Athlete's IANA zone; day matching must use it, not the payload's UTC date. */
  timezone?: string;
}

function dayTss(activities: ActivitySummary[] | undefined): number {
  if (!activities) return 0;
  return activities.reduce((sum, a) => sum + (a.tss ?? 0), 0);
}

/** Roll up the current week's planned vs actual load + completion ratio.
 *  A planned event counts as completed when it has a matching activity on the
 *  same day; unplanned activities inflate both sides so the ratio stays honest. */
export function buildWeekSummary(args: BuildWeekSummaryArgs): WeekSummary {
  const { events, activityMap, weekStart, timezone = DEFAULT_TIMEZONE } = args;
  const isoStart = toISODate(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const isoEnd = toISODate(end);

  const activityDays = new Set<string>();
  for (const day of activityMap.keys()) {
    if (day >= isoStart && day <= isoEnd) activityDays.add(day);
  }

  let plannedTss = 0;
  let total = 0;
  let completed = 0;
  for (const ev of events) {
    if (ev.training_type === "race") continue;
    const day = activityLocalDay(ev.start_time, timezone);
    if (day < isoStart || day > isoEnd) continue;
    total += 1;
    plannedTss += ev.predicted_tss ?? 0;
    if (ev.done || activityDays.has(day)) completed += 1;
  }
  // Unplanned activities still count as completed sessions for the week.
  for (const day of activityDays) {
    const hasPlanned = events.some(
      (ev) => ev.training_type !== "race" && activityLocalDay(ev.start_time, timezone) === day,
    );
    if (!hasPlanned) {
      const count = activityMap.get(day)?.length ?? 1;
      completed += count;
      total += count;
    }
  }

  const actualTss = [...activityDays].reduce(
    (sum, day) => sum + dayTss(activityMap.get(day)),
    0,
  );

  return { completed, total, plannedTss, actualTss };
}

/**
 * ISO-8601 week number and week-year for a date.
 *
 * ISO weeks start on Monday and week 1 is the one containing the first Thursday
 * of the year. Computing it by dividing the day-of-year by 7 (a common shortcut)
 * is wrong at year boundaries and disagrees with the week grid the athlete sees,
 * so the Thursday rule is applied directly.
 */
export function isoWeek(date: Date): { week: number; year: number } {
  const thursday = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  // Shift to the Thursday of this ISO week.
  const dayOfWeek = (thursday.getUTCDay() + 6) % 7; // Monday = 0
  thursday.setUTCDate(thursday.getUTCDate() - dayOfWeek + 3);

  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayOfWeek = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayOfWeek + 3);

  const week =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return { week, year: isoYear };
}
