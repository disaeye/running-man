"use client";

import { useMemo } from "react";
import { CheckCircle2, Activity } from "lucide-react";
import { useCalendarEvents } from "@features/calendar/hooks/useCalendarEvents";
import { useActivities } from "@features/activity/hooks/useActivities";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { ActivitySummary } from "@shared/types/activity";
import { useHasMounted } from "@shared/lib/client-date";
import { WeekGridSkeleton } from "./WeekGridSkeleton";

interface DaySlot {
  dateStr: string; // YYYY-MM-DD
  dayLabel: string; // 周一, 周二...
  dayNum: number; // 1-31
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  plannedEvent: CalendarEventDTO | null;
  activities: ActivitySummary[];
  totalActualDistanceKm: number;
  totalActualTss: number;
  isCompleted: boolean;
  isRest: boolean;
}

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function WeeklyHorizonMatrix() {
  // The grid is anchored to today and renders client-only, so the build day
  // never reaches the HTML. See `useHasMounted`.
  if (!useHasMounted()) return <WeekGridSkeleton />;
  return <WeekGrid />;
}

function WeekGrid() {
  const now = useMemo(() => new Date(), []);
  const monday = useMemo(() => getMondayOfWeek(now), [now]);
  const sunday = useMemo(() => {
    const d = new Date(monday);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [monday]);

  const fromStr = useMemo(() => formatDateISO(monday), [monday]);
  const toStr = useMemo(() => formatDateISO(sunday), [sunday]);
  const todayStr = useMemo(() => formatDateISO(now), [now]);

  const { events } = useCalendarEvents(fromStr, toStr);
  const { data: activities } = useActivities(fromStr, toStr);

  const days: DaySlot[] = useMemo(() => {
    const slots: DaySlot[] = [];

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(monday);
      dayDate.setDate(dayDate.getDate() + i);
      const dateStr = formatDateISO(dayDate);
      const dayLabel = DAY_NAMES[i] ?? "";
      const isToday = dateStr === todayStr;
      const isPast = dateStr < todayStr;
      const isFuture = dateStr > todayStr;

      // Find events on this day
      const dayEvent =
        events.find((e) => {
          const eDate = e.start_time ? e.start_time.split("T")[0] : "";
          return eDate === dateStr;
        }) || null;

      // Find activities on this day
      const dayActs = activities.filter((a) => {
        const aDate = a.start_time ? a.start_time.split("T")[0] : "";
        return aDate === dateStr;
      });

      const totalActualDistanceKm = dayActs.reduce(
        (sum, a) => sum + (a.distance_m || 0) / 1000,
        0
      );
      const totalActualTss = dayActs.reduce((sum, a) => sum + (a.tss || 0), 0);
      const isCompleted = dayActs.length > 0;
      const isRest = !isCompleted && !dayEvent;

      slots.push({
        dateStr,
        dayLabel,
        dayNum: dayDate.getDate(),
        isToday,
        isPast,
        isFuture,
        plannedEvent: dayEvent,
        activities: dayActs,
        totalActualDistanceKm,
        totalActualTss,
        isCompleted,
        isRest,
      });
    }

    return slots;
  }, [monday, todayStr, events, activities]);

  // Aggregate stats
  const completedDaysCount = days.filter((d) => d.isCompleted).length;
  const totalActualKm = days.reduce(
    (acc, d) => acc + d.totalActualDistanceKm,
    0
  );
  const totalActualTss = days.reduce((acc, d) => acc + d.totalActualTss, 0);

  return (
    <div data-testid="home-weekly-horizon">
      <p className="text-caption1 text-text-muted">
        {fromStr.slice(5)} ~ {toStr.slice(5)}
      </p>

      <div className="mt-2.5 grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((day) => (
          <div
            key={day.dateStr}
            data-today={day.isToday ? "true" : undefined}
            className={`flex h-24 min-w-0 flex-col rounded-lg border border-t-2 p-1 transition-colors sm:h-32 sm:p-2 ${
              day.isToday
                ? "border-border-subtle border-t-calendar-today"
                : day.isCompleted
                  ? "border-recovery-good/30 border-t-recovery-good/40"
                  : "border-border-subtle border-t-border-subtle"
            } ${day.isCompleted ? "bg-recovery-good/5" : "bg-surface-sunken"}`}
          >
            <div className="flex h-5 items-baseline justify-between gap-0.5 border-b border-border-subtle pb-0.5 sm:h-6 sm:gap-1 sm:pb-1">
              <span
                className={`truncate text-caption1 ${
                  day.isToday ? "font-semibold text-calendar-today" : "text-text-muted"
                }`}
              >
                {day.dayLabel.slice(1)}
              </span>
              <span
                className={`font-mono text-caption1 tabular-nums ${
                  day.isToday ? "font-semibold text-calendar-today" : "text-text-secondary"
                }`}
              >
                {day.dayNum}
              </span>
            </div>

            {/* Fixed middle: one icon and one line of text, whatever the state. */}
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-0.5 overflow-hidden text-center sm:gap-1">
              {day.isCompleted ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
              ) : day.plannedEvent ? (
                <>
                  <Activity className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                  <span
                    className="w-full truncate text-caption1 text-text-secondary"
                    title={day.plannedEvent.name ?? undefined}
                  >
                    {day.plannedEvent.name || "课表"}
                  </span>
                </>
              ) : (
                <span className="text-caption1 text-text-muted">休</span>
              )}
            </div>

            <div className="flex h-4 items-center justify-center border-t border-border-subtle pt-0.5 text-center sm:h-5 sm:pt-1">
              {day.isCompleted && day.totalActualTss > 0 ? (
                <span className="truncate font-mono text-caption1 font-semibold tabular-nums text-text-primary">
                  {Math.round(day.totalActualTss)}
                </span>
              ) : day.plannedEvent?.predicted_tss ? (
                <span className="truncate font-mono text-caption1 tabular-nums text-text-muted">
                  ~{Math.round(day.plannedEvent.predicted_tss)}
                </span>
              ) : (
                <span className="font-mono text-caption1 text-text-muted">-</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border-subtle pt-2 text-caption1 text-text-muted">
        <span>
          里程 <span className="font-mono font-semibold tabular-nums text-text-primary">{totalActualKm.toFixed(1)} km</span>
        </span>
        <span>
          负荷 <span className="font-mono font-semibold tabular-nums text-text-primary">{Math.round(totalActualTss)} TSS</span>
        </span>
        <span>
          打卡 <span className="font-mono font-semibold tabular-nums text-text-primary">{completedDaysCount}</span>/7 天
        </span>
      </div>
    </div>
  );
}