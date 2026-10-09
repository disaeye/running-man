"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/Badge";
import { WarningBadge } from "@features/calendar/components/WarningBadge";
import { EventMatchStatus } from "@features/calendar/components/EventMatchStatus";
import { computeWeekMatches } from "@features/calendar/lib/match";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { ActivitySummary } from "@shared/types/activity";
import { toISODate, formatDistance } from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";
import { riskFlags } from "@features/calendar/components/types";
import { tssBg } from "@features/plan/lib/tss-bg";
import { activityLocalDay, athleteToday, useAthleteTimezone } from "@shared/lib/training-day";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

interface PlanWeekViewProps {
  events: CalendarEventDTO[];
  weekStart: Date;
  onNavWeek: (delta: number) => void;
  onSelectDate: (iso: string) => void;
  completedActivities?: Map<string, ActivitySummary[]>;
}

function parseSegs(xml?: string): { segment_type: string }[] {
  try { const p = JSON.parse(xml ?? ""); return Array.isArray(p) ? p : []; }
  catch { return []; }
}

function dayIndex(day: Date): number {
  return day.getDay() === 0 ? 6 : day.getDay() - 1;
}

function TssCompare({ planned, actual }: { planned: number; actual: number | null }) {
  if (planned <= 0 && (actual == null || actual <= 0)) return null;
  return (
    <div className="flex items-center gap-1.5 text-caption2 font-mono">
      {planned > 0 && (
        <span className="inline-flex items-center gap-0.5 text-accent-strong">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          {Math.round(planned)}
        </span>
      )}
      {actual != null && actual > 0 && (
        <span className="inline-flex items-center gap-0.5 text-text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
          {Math.round(actual)}
        </span>
      )}
    </div>
  );
}

export function PlanWeekView({
  events,
  weekStart,
  onNavWeek,
  onSelectDate,
  completedActivities,
}: PlanWeekViewProps) {
  const timezone = useAthleteTimezone();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const eventsByDate = new Map<string, CalendarEventDTO[]>();
  for (const ev of events) {
    const key = activityLocalDay(ev.start_time, timezone);
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key)!.push(ev);
  }
  const allActivities: ActivitySummary[] = [];
  if (completedActivities) {
    for (const acts of completedActivities.values()) {
      allActivities.push(...acts);
    }
  }
  const matches = computeWeekMatches(events, allActivities, timezone);

  const today = athleteToday(timezone);

  return (
    <Card padding="sm">
      <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
        <Button variant="ghost" onClick={() => onNavWeek(-1)} aria-label="上周，上一周">
          <ChevronLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">上周</span>
        </Button>
        <span className="text-subheadline font-semibold tabular-nums text-text-primary">
          <span className="hidden sm:inline">{toISODate(weekStart)} — {toISODate(days[6]!)}</span>
          <span className="sm:hidden">{weekStart.getMonth() + 1}/{weekStart.getDate()} — {days[6]!.getMonth() + 1}/{days[6]!.getDate()}</span>
        </span>
        <Button variant="ghost" onClick={() => onNavWeek(1)} aria-label="下周，下一周">
          <span className="hidden sm:inline">下周</span>
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[480px] grid-cols-7 gap-2 p-3" data-testid="plan-week-grid">
        {days.map((day) => {
          const iso = toISODate(day);
          const isToday = iso === today;
          const isFuture = iso > today;
          const dayEvents = eventsByDate.get(iso) ?? [];
          const dayActivities = completedActivities?.get(iso) ?? [];
          const plannedTss = dayEvents.reduce((s, e) => s + (e.predicted_tss ?? 0), 0);
          const actualTss = dayActivities.reduce((s, a) => s + (a.tss ?? 0), 0);
          const hasActual = dayActivities.length > 0;
          const showAsFuture = isFuture && !hasActual && dayEvents.length > 0;
          const bg = tssBg(Math.max(plannedTss, actualTss), showAsFuture);
          const hasPlanned = dayEvents.length > 0;
          const allDone = hasPlanned && dayEvents.every((e) => e.done);
          const complianceDot = (allDone || (hasPlanned && hasActual));

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(iso)}
              aria-label={`${DAY_NAMES[dayIndex(day)]} ${day.getDate()}日${hasPlanned ? ` 计划 ${Math.round(plannedTss)} TSS` : ""}${hasActual ? ` 实际 ${Math.round(actualTss)} TSS` : ""}${complianceDot ? " 已按计划完成" : ""}`}
              className={`focus-ring relative flex flex-col gap-1 rounded-lg border bg-surface-card p-2 text-left transition-colors hover:bg-surface-overlay ${bg} ${
                isToday ? "border-accent" : hasPlanned ? "border-accent/40" : "border-border-default"
              }`}
              data-testid={`plan-week-day-${iso}`}
              data-compliance={complianceDot ? "done" : undefined}
            >
              <div className="flex items-center justify-between">
                <span className="text-caption1 text-text-secondary">{DAY_NAMES[dayIndex(day)]}</span>
                <span className={`text-caption1 font-semibold tabular-nums ${isToday ? "text-accent-strong" : "text-text-secondary"}`}>
                  {day.getDate()}
                </span>
                {complianceDot && (
                  <span
                    className="absolute right-1.5 top-1.5 inline-flex h-2 w-2 rounded-full bg-success ring-2 ring-surface-card"
                    aria-hidden
                  />
                )}
              </div>

              <TssCompare planned={plannedTss} actual={hasActual ? actualTss : null} />

              {hasActual && (
                <div className="flex flex-col gap-0.5">
                  {dayActivities.slice(0, 2).map((activity) => (
                    <div key={activity.activity_id} className="flex flex-col gap-0.5">
                      <span className="truncate text-caption1 font-semibold text-text-primary">
                        {getSportConfig(activity.sport).label}
                      </span>
                      <span className="truncate font-mono text-caption2 text-text-secondary">
                        {formatDistance(activity.distance_m)}
                      </span>
                    </div>
                  ))}
                  {dayActivities.length > 2 && (
                    <span className="text-caption2 text-text-muted">+{dayActivities.length - 2}</span>
                  )}
                </div>
              )}

              {hasPlanned ? (
                <div className="flex flex-col gap-0.5">
                  {dayEvents.map((ev) => {
                    const segCount = parseSegs(ev.workout_xml).length;
                    const risk = riskFlags(ev.predicted_tss ?? 0);
                    return (
                      <div key={ev.event_id} className="flex flex-col gap-0.5">
                        <span className="line-clamp-2 text-caption1 text-text-primary">{ev.name ?? "训练"}</span>
                        <div className="flex items-center gap-1">
                          {ev.training_type === "race" && <Badge variant="accent">比赛</Badge>}
                          {ev.done
                            ? <Badge variant="success"><Check className="size-3" aria-hidden /> 完成</Badge>
                            : segCount > 0
                              ? <Badge variant="neutral">计划中</Badge>
                              : null}
                          {ev.training_type !== "race" && matches.has(ev.event_id) && (
                            <EventMatchStatus status={matches.get(ev.event_id)!.status} />
                          )}
                        </div>
                        {ev.predicted_tss != null && ev.predicted_tss > 0 && (
                          <WarningBadge
                            isOvertrainingRisk={risk.isOvertrainingRisk}
                            isHighLoadRisk={risk.isHighLoadRisk}
                            isFresh={risk.isFresh}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : !hasActual ? (
                <span className="text-caption1 text-text-secondary">未安排</span>
              ) : null}
            </button>
          );
        })}
        </div>
      </div>
    </Card>
  );
}
