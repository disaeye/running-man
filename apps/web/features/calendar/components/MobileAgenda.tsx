"use client";

import Link from "next/link";
import { Badge } from "@shared/ui/Badge";
import { Card } from "@shared/ui/Card";
import { formatDistance, formatDuration } from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO, RiskFlags } from "./types";
import { EventMatchStatus } from "./EventMatchStatus";
import type { EventMatch } from "../lib/match";
import { activityLocalDay, athleteToday, useAthleteTimezone } from "@shared/lib/training-day";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

interface MobileAgendaProps {
  events: CalendarEventDTO[];
  activities: Map<string, ActivitySummary[]>;
  weekStart: Date;
  onSelectDate: (iso: string) => void;
  matches?: Map<string, EventMatch>;
}

function eventRisk(predicted_tss: number | null | undefined): RiskFlags {
  const tss = predicted_tss ?? 0;
  return {
    isOvertrainingRisk: tss > 200,
    isHighLoadRisk: tss > 150,
    isFresh: tss > 0 && tss < 50,
  };
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function AgendaRow({
  iso,
  dayLabel,
  dateNum,
  isToday,
  events,
  activities,
  onSelect,
  matches,
}: {
  iso: string;
  dayLabel: string;
  dateNum: number;
  isToday: boolean;
  events: CalendarEventDTO[];
  activities: ActivitySummary[];
  onSelect: () => void;
  matches?: Map<string, EventMatch>;
}) {
  const hasEvents = events.length > 0;
  const hasActivities = activities.length > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left transition-all duration-150 active:scale-[0.985] active:bg-surface-overlay/80 hover:bg-surface-overlay focus-ring ${
        isToday ? "border-accent bg-accent/5 shadow-xs" : "border-border-default"
      }`}
      data-testid={`agenda-row-${iso}`}
    >
      <div className="flex w-12 shrink-0 flex-col items-center">
        <span className={`text-caption1 font-medium ${isToday ? "text-accent-strong" : "text-text-muted"}`}>
          {dayLabel}
        </span>
        <span className={`mt-0.5 font-mono text-title3 font-semibold tabular-nums ${isToday ? "text-accent-strong" : "text-text-primary"}`}>
          {dateNum}
        </span>
        {isToday && <span className="mt-0.5 text-caption1 text-accent-strong">今天</span>}
      </div>

      <div className="min-w-0 flex-1">
        {hasEvents ? (
          events.map((ev) => {
            const risk = eventRisk(ev.predicted_tss);
            const match = matches?.get(ev.event_id);
            return (
              <div key={ev.event_id} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-subheadline font-medium text-text-primary">
                    {ev.name ?? "训练"}
                  </span>
                  {ev.training_type === "race" && <Badge variant="accent">比赛</Badge>}
                  {match && ev.training_type !== "race" && <EventMatchStatus status={match.status} />}
                </div>
                <div className="flex items-center gap-2 text-caption2 text-text-secondary">
                  {ev.predicted_tss != null && ev.predicted_tss > 0 && (
                    <span className="font-mono tabular-nums">{Math.round(ev.predicted_tss)} TSS</span>
                  )}
                  {ev.done ? (
                    <Badge variant="success">完成</Badge>
                  ) : risk.isHighLoadRisk ? (
                    <span className="text-warning">高强度</span>
                  ) : null}
                  {risk.isFresh && <span className="text-success">状态良好</span>}
                </div>
              </div>
            );
          })
        ) : (
          <span className="text-subheadline text-text-muted">未安排</span>
        )}

        {hasActivities && (
          <div className="mt-2 space-y-1 border-t border-border-subtle pt-2">
            {activities.slice(0, 2).map((a) => (
              <Link
                key={a.activity_id}
                href={`/activities/${a.activity_id}`}
                className="flex items-center justify-between rounded-md px-2 py-1 text-caption2 transition-colors hover:bg-surface-overlay"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="truncate font-medium text-text-primary">{getSportConfig(a.sport).label}</span>
                <span className="ml-2 shrink-0 font-mono text-text-secondary">
                  {a.distance_m ? formatDistance(a.distance_m) : formatDuration(a.duration_s)}
                </span>
              </Link>
            ))}
            {activities.length > 2 && (
              <p className="px-2 text-caption1 text-text-muted">还有 {activities.length - 2} 条训练</p>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
export function MobileAgenda({
  events,
  activities,
  weekStart,
  onSelectDate,
  matches,
}: MobileAgendaProps) {
  const timezone = useAthleteTimezone();
  const today = athleteToday(timezone);

  const eventsByDate = new Map<string, CalendarEventDTO[]>();
  for (const ev of events) {
    const key = activityLocalDay(ev.start_time, timezone);
    const bucket = eventsByDate.get(key);
    if (bucket) bucket.push(ev);
    else eventsByDate.set(key, [ev]);
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <Card padding="sm" data-testid="mobile-agenda">
      <div className="divide-y divide-border-subtle">
        {days.map((day, i) => {
          const iso = toISODate(day);
          const dayEvents = eventsByDate.get(iso) ?? [];
          const dayActivities = activities.get(iso) ?? [];
          return (
            <AgendaRow
              key={iso}
              iso={iso}
              dayLabel={DAY_NAMES[i] ?? ""}
              dateNum={day.getDate()}
              isToday={iso === today}
              events={dayEvents}
              activities={dayActivities}
              onSelect={() => onSelectDate(iso)}
              matches={matches}
            />
          );
        })}
      </div>
    </Card>
  );
}
