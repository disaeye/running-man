"use client";

import { Card } from "@shared/ui/Card";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { activityLocalDay, useAthleteTimezone } from "@shared/lib/training-day";

/**
 * 本周快览条（参考稿的周条）。
 *
 * 一周七天横排，每格是那天的训练：星期几与日期、一个类型点、里程。
 *
 * 选中的那天整格高亮。格子里写的是计划里程或实际里程——两者都有时写实际的，
 * 因为实际发生的事才是那天的样子。
 */

interface Props {
  readonly days: readonly { readonly iso: string; readonly dayLabel: string }[];
  readonly events: readonly CalendarEventDTO[];
  readonly activities: ReadonlyMap<string, readonly ActivitySummary[]>;
  readonly selectedDate: string | null;
  readonly onSelectDate: (iso: string) => void;
  readonly testId?: string;
  readonly dayTestIdPrefix?: string;
}

export function DemoWeekStrip({
  days,
  events,
  activities,
  selectedDate,
  onSelectDate,
  testId,
  dayTestIdPrefix = "demo-week-day",
}: Props) {
  const timezone = useAthleteTimezone();

  return (
    <Card padding="sm" data-testid={testId ?? "demo-week-strip"}>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((day) => {
          const dayEvents = events.filter(
            (event) => activityLocalDay(event.start_time, timezone) === day.iso,
          );
          const dayActivities = activities.get(day.iso) ?? [];
          const actualKm = dayActivities.reduce((sum, a) => sum + (a.distance_m ?? 0), 0) / 1000;
          const plannedKm = dayEvents.reduce(
            (sum, e) => sum + (e.predicted_distance_m ?? 0),
            0,
          ) / 1000;
          const selected = day.iso === selectedDate;
          const hasTraining = dayEvents.length > 0 || dayActivities.length > 0;

          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => onSelectDate(day.iso)}
              data-testid={`${dayTestIdPrefix}-${day.iso}`}
              aria-current={selected ? "date" : undefined}
              className={`flex min-w-[70px] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 transition-colors ${
                selected
                  ? "bg-accent/20 accent-glow-soft"
                  : "bg-surface-overlay hover:bg-surface-active"
              }`}
            >
              <span
                className={`text-caption1 ${
                  selected ? "font-bold text-accent" : "text-text-muted"
                }`}
              >
                {day.dayLabel}
              </span>
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${
                  hasTraining ? "bg-accent" : "bg-surface-active"
                }`}
              />
              <span
                className={`font-mono text-caption1 tabular-nums ${
                  selected ? "font-bold text-accent" : "text-text-muted"
                }`}
              >
                {actualKm > 0
                  ? `${actualKm.toFixed(1)}k`
                  : plannedKm > 0
                    ? `${plannedKm.toFixed(1)}k`
                    : hasTraining
                      ? NO_VALUE
                      : "休"}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
