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
    <div className="bg-transparent pt-3" data-testid="home-weekly-horizon">
      <div className="flex items-center justify-between pb-2 text-caption2 text-text-muted">
        <span>周周期进度（{fromStr.slice(5)} ~ {toStr.slice(5)}）</span>
        <span>已完成 {completedDaysCount}/7 天</span>
      </div>

      {/* 7-Day Horizontal Strip: scrollable flex on mobile, 7-col grid on desktop */}
      <div className="mt-3 -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2 scroll-smooth snap-x snap-proximity overscroll-x-contain sm:grid sm:grid-cols-7 sm:overflow-visible sm:pb-0">
        {days.map((day) => {
          return (
            <div
              key={day.dateStr}
              className={`relative flex shrink-0 min-h-[112px] w-[82px] snap-start sm:w-auto flex-col justify-between rounded-xl p-2.5 transition-all duration-150 active:scale-95 border ${
                day.isToday
                  ? "border-sky-500 bg-sky-500/10 shadow-sm ring-1 ring-sky-500 dark:bg-sky-500/15"
                  : day.isCompleted
                  ? "border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/15"
                  : "border-border/60 bg-muted/20 hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between gap-1 border-b border-border/20 pb-1 text-center">
                <span
                  className={`text-caption1 font-semibold ${
                    day.isToday ? "text-sky-600 dark:text-sky-400 font-bold" : "text-muted-foreground"
                  }`}
                >
                  {day.dayLabel}
                </span>
                <span
                  className={`text-xs font-bold tabular-nums font-mono ${
                    day.isToday ? "text-sky-600 dark:text-sky-300" : "text-foreground/80"
                  }`}
                >
                  {day.dayNum}
                </span>
              </div>
              {/* Day Body Content */}
              <div className="my-2 flex flex-col items-center justify-center text-center">
                {day.isCompleted ? (
                  <div className="flex flex-col items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold font-mono tabular-nums text-foreground">
                      {day.totalActualDistanceKm > 0
                        ? `${day.totalActualDistanceKm.toFixed(1)} km`
                        : "已完成"}
                    </span>
                  </div>
                ) : day.isToday ? (
                  <div className="flex flex-col items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-bold text-primary">今日待办</span>
                  </div>
                ) : day.plannedEvent ? (
                  <div className="flex flex-col items-center gap-1">
                    <Activity className="h-3.5 w-3.5 text-sky-500" />
                    <span className="text-xs font-medium text-foreground/80 truncate max-w-[80px]" title={day.plannedEvent.name}>
                      {day.plannedEvent.name || "课表"}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground font-medium">休息日</span>
                )}
              </div>

              {/* Day Bottom TSS / Status */}
              <div className="text-center pt-1 border-t border-border/20">
                {day.isCompleted && day.totalActualTss > 0 ? (
                  <span className="text-caption1 font-semibold tabular-nums font-mono text-amber-600 dark:text-amber-400">
                    {Math.round(day.totalActualTss)} TSS
                  </span>
                ) : day.plannedEvent?.predicted_tss ? (
                  <span className="text-caption1 text-muted-foreground tabular-nums font-mono">
                    ~{Math.round(day.plannedEvent.predicted_tss)} TSS
                  </span>
                ) : (
                  <span className="text-caption1 text-muted-foreground font-mono">-</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Footer Aggregate Progress */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/20 px-3.5 py-2 text-xs text-muted-foreground border border-border/30">
        <div className="flex items-center gap-4">
          <div>
            里程:{" "}
            <span className="font-bold tabular-nums text-foreground">
              {totalActualKm.toFixed(1)} km
            </span>
          </div>
          <div>
            负荷:{" "}
            <span className="font-bold tabular-nums text-foreground">
              {Math.round(totalActualTss)} TSS
            </span>
          </div>
        </div>
        <div>
          打卡:{" "}
          <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {completedDaysCount}
          </span>
          <span className="text-muted-foreground">/7 天</span>
        </div>
      </div>
    </div>
  );
}