"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import { Button } from "@shared/ui/button";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { ActivitySummary } from "@shared/types/activity";
import { toISODate } from "@shared/lib/format";
import { buildMonthWeeks } from "@features/plan/lib/month-grid";
import { MonthDayCell } from "@features/plan/components/MonthDayCell";
import { activityLocalDay, athleteToday, useAthleteTimezone } from "@shared/lib/training-day";

interface PlanMonthViewProps {
  events: CalendarEventDTO[];
  monthDate: Date;
  onNavMonth: (delta: number) => void;
  onSelectDate: (iso: string) => void;
  completedActivities?: Map<string, ActivitySummary[]>;
}

const DAY_HEADER = ["一", "二", "三", "四", "五", "六", "日"];
const MONTH_NAMES = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];



export function PlanMonthView({
  events,
  monthDate,
  onNavMonth,
  onSelectDate,
  completedActivities,
}: PlanMonthViewProps) {
  const timezone = useAthleteTimezone();
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const weeks = buildMonthWeeks(year, month);
  const today = athleteToday(timezone);

  const eventsByDate = new Map<string, CalendarEventDTO[]>();
  for (const ev of events) {
    const key = activityLocalDay(ev.start_time, timezone);
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key)!.push(ev);
  }

  return (
    <Card padding="sm">
      <CardHeader
        title={`${MONTH_NAMES[month]} ${year}`}
        trailing={
          <>
            <Button variant="ghost" onClick={() => onNavMonth(-1)} aria-label="上个月">
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button variant="ghost" onClick={() => onNavMonth(1)} aria-label="下个月">
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-7 gap-1" data-testid="plan-month-grid">
        {DAY_HEADER.map((d) => (
          <div key={d} className="py-1 text-center text-caption1 font-medium text-text-muted">
            {d}
          </div>
        ))}
        {weeks.flat().map(({ date, inMonth }) => {
          const iso = toISODate(date);
          if (!inMonth) {
            // 非本月的日子只做填充，压一档灰，不承接点击。
            return (
              <div key={`pad-${iso}`} aria-hidden className="min-h-16 rounded-lg p-1">
                <span className="font-mono text-caption1 tabular-nums text-text-muted/70">
                  {date.getDate()}
                </span>
              </div>
            );
          }
          const dayEvents = eventsByDate.get(iso) ?? [];
          const dayActivities = completedActivities?.get(iso) ?? [];
          const plannedMinutes = dayEvents.reduce((sum, event) => sum + (event.workout_prescription?.duration_min ?? 0), 0);
          const actualMinutes = dayActivities.reduce((sum, activity) => sum + (activity.duration_s ?? 0), 0) / 60;
          const isCompleted = dayActivities.length > 0 || (dayEvents.length > 0 && dayEvents.every((e) => e.done));
          return (
            <MonthDayCell
              key={iso}
              day={date.getDate()}
              iso={iso}
              isToday={iso === today}
              isRace={dayEvents.some((event) => event.training_type === "race")}
              isCompleted={isCompleted}
              hasPlanned={dayEvents.length > 0}
              durationMinutes={Math.round(Math.max(plannedMinutes, actualMinutes))}
              onSelect={onSelectDate}
            />
          );
        })}
      </div>
    </Card>
  );
}
