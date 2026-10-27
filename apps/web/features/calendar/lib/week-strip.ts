import { activityLocalDay } from "@shared/lib/training-day";
import { toISODate } from "@shared/lib/format";
import type { WeekStripDay, WeekStripStatus } from "@shared/ui/WeekStrip";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "../components/types";

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

/**
 * The week strip's seven cells.
 *
 * The dot answers one question — did this day happen — so it reads the same way
 * on the calendar as the day rows below it: recorded activity wins, a planned
 * day in the past without one is a miss, a planned day ahead is pending.
 */
export function buildStripDays({
  days,
  events,
  activities,
  today,
  timezone,
}: {
  readonly days: readonly Date[];
  readonly events: readonly CalendarEventDTO[];
  readonly activities: ReadonlyMap<string, readonly ActivitySummary[]>;
  readonly today: string;
  readonly timezone: string;
}): WeekStripDay[] {
  const planned = new Set(events.map((event) => activityLocalDay(event.start_time, timezone)));

  return days.map((date) => {
    const iso = toISODate(date);
    const recorded = (activities.get(iso)?.length ?? 0) > 0;
    const isPlanned = planned.has(iso);
    const status: WeekStripStatus = recorded
      ? "done"
      : isPlanned
        ? iso < today
          ? "missed"
          : "planned"
        : "rest";
    return {
      iso,
      weekday: WEEKDAY[date.getDay()] ?? "",
      dateNum: date.getDate(),
      isToday: iso === today,
      status,
    };
  });
}
