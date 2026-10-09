"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { ActivitySummary } from "@shared/types/activity";
import { toISODate, formatDistance } from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";
import { tssBg } from "@features/plan/lib/tss-bg";
import { activityLocalDay, athleteToday, useAthleteTimezone } from "@shared/lib/training-day";

export { tssBg } from "@features/plan/lib/tss-bg";

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

function getMonthlyTss(eventsByDate: Map<string, CalendarEventDTO[]>, iso: string): number {
  return (eventsByDate.get(iso) ?? []).reduce(
    (sum, ev) => sum + (ev.predicted_tss ?? 0),
    0,
  );
}

interface MonthLegendEntry {
  readonly label: string;
  readonly bgClass: string;
}

const TSS_LEGEND: readonly MonthLegendEntry[] = [
  { label: "低", bgClass: "bg-accent/10" },
  { label: "中", bgClass: "bg-accent/40" },
  { label: "高", bgClass: "bg-accent/80" },
];

function buildWeeks(year: number, month: number): (Date | null)[][] {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (Date | null)[][] = [Array<Date | null>(firstDow).fill(null)];
  for (let d = 1; d <= daysInMonth; d++) {
    if (weeks[weeks.length - 1]!.length === 7) { weeks.push([]); }
    weeks[weeks.length - 1]!.push(new Date(year, month, d));
  }
  const last = weeks[weeks.length - 1]!;
  while (last.length < 7) last.push(null);
  return weeks;
}

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
  const weeks = buildWeeks(year, month);
  const today = athleteToday(timezone);

  const eventsByDate = new Map<string, CalendarEventDTO[]>();
  for (const ev of events) {
    const key = activityLocalDay(ev.start_time, timezone);
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key)!.push(ev);
  }

  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default px-3 py-2">
        <Button variant="ghost" onClick={() => onNavMonth(-1)} aria-label="上个月">
          <ChevronLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">上月</span>
        </Button>
        <span className="text-subheadline font-semibold tabular-nums text-text-primary">{MONTH_NAMES[month]} {year}</span>
        <div className="flex flex-wrap items-center gap-1.5 text-caption2 text-text-muted" aria-label="TSS 密度图例">
          <span>TSS</span>
          {TSS_LEGEND.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1">
              <span className={`h-2.5 w-4 rounded-sm ${item.bgClass}`} aria-hidden />
              {item.label}
            </span>
          ))}
          <span className="ms-1 inline-flex items-center gap-1">
            <span className="inline-flex h-2 w-2 rounded-full bg-success" aria-hidden />
            已按计划完成
          </span>
        </div>
        <Button variant="ghost" onClick={() => onNavMonth(1)} aria-label="下个月">
          <span className="hidden sm:inline">下月</span>
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[480px] grid-cols-7 gap-1 p-3" data-testid="plan-month-grid">
        {DAY_HEADER.map((d) => (
          <div key={d} className="py-1 text-center text-caption1 font-medium text-text-muted">
            {d}
          </div>
        ))}
        {weeks.flat().map((day, i) => {
          if (!day) return <div key={`e${i}`} className="rounded-lg bg-surface-base/50" />;
          const iso = toISODate(day);
          const plannedTss = getMonthlyTss(eventsByDate, iso);
          const dayEvts = eventsByDate.get(iso) ?? [];
          const allDone = dayEvts.length > 0 && dayEvts.every((e) => e.done);
          const dayActivities = completedActivities?.get(iso) ?? [];
          const activityTss = dayActivities.reduce((s, a) => s + (a.tss ?? 0), 0);
          const hasActual = dayActivities.length > 0;
          const primaryActivity = dayActivities[0];
          const hasPlanned = dayEvts.length > 0;
          const isFuture = iso > today;
          const complianceDot = allDone || (hasPlanned && hasActual);
          const bg = tssBg(Math.max(plannedTss, activityTss), isFuture && hasPlanned && !hasActual);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(iso)}
              aria-label={
                `${day.getDate()}日${
                  hasPlanned ? ` 计划 ${Math.round(plannedTss)} TSS` : ""
                }${
                  activityTss != null ? ` 实际 ${Math.round(activityTss)} TSS` : ""
                }${
                  complianceDot ? " 已按计划完成" : ""
                }`
              }
              className={`focus-ring relative flex flex-col gap-0.5 rounded-lg border bg-surface-card p-1.5 text-left transition-colors hover:bg-surface-overlay ${bg} ${
                iso === today ? "border-accent" : hasPlanned ? "border-accent/40" : "border-border-default"
              }`}
              data-testid={`plan-month-day-${iso}`}
              data-compliance={complianceDot ? "done" : undefined}
            >
              <div className="flex items-center justify-between">
                <span className={`text-caption1 tabular-nums ${iso === today ? "font-bold text-accent-strong" : "text-text-secondary"}`}>
                  {day.getDate()}
                </span>
                {complianceDot && (
                  <span
                    className="inline-flex h-2 w-2 rounded-full bg-success ring-2 ring-surface-card"
                    aria-hidden
                  />
                )}
              </div>

              {activityTss > 0 && plannedTss > 0 ? (
                <div className="flex items-center gap-1.5 text-caption2 font-mono">
                  <span className="inline-flex items-center gap-0.5 text-accent-strong">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                    {Math.round(plannedTss)}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                    {Math.round(activityTss)}
                  </span>
                </div>
              ) : activityTss > 0 ? (
                <span className="font-mono text-caption2 tabular-nums text-success">{Math.round(activityTss)} TSS</span>
              ) : plannedTss > 0 ? (
                <span className="font-mono text-caption2 tabular-nums text-accent-strong">{Math.round(plannedTss)} TSS</span>
              ) : null}

              {primaryActivity && (
                <div className="flex flex-col gap-px">
                  <span className="truncate text-caption2 font-semibold text-text-primary">
                    {getSportConfig(primaryActivity.sport).label}
                    {dayActivities.length > 1 ? ` ·${dayActivities.length}` : ""}
                  </span>
                  <span className="truncate font-mono tabular-nums text-caption2 text-text-secondary">
                    {formatDistance(primaryActivity.distance_m)}
                  </span>
                </div>
              )}

              {dayEvts.some((event) => event.training_type === "race") && (
                <span className="truncate text-caption1 font-semibold text-accent-strong">比赛日</span>
              )}
              {!hasPlanned && !hasActual && (
                <span className="text-caption1 text-text-secondary">未安排</span>
              )}
            </button>
          );
        })}
        </div>
      </div>
    </Card>
  );
}
