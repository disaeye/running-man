"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { formatDistance, formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "./types";
import type { EventMatch } from "../lib/match";

export interface DayRowProps {
  readonly iso: string;
  readonly weekday: string;
  readonly dateNum: number;
  readonly isToday: boolean;
  readonly isPast: boolean;
  readonly events: readonly CalendarEventDTO[];
  readonly activities: readonly ActivitySummary[];
  readonly matches?: Map<string, EventMatch>;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onRecord: () => void;
}

const MATCH_LABEL: Record<string, string> = {
  completed: "完成",
  partial: "部分完成",
  missed: "未完成",
};

const MATCH_TONE: Record<string, string> = {
  completed: "text-success",
  partial: "text-warning",
  missed: "text-text-muted",
};

/**
 * One day of the mobile calendar.
 *
 * Collapsed it is a single line — weekday, plan and the number that decides it —
 * so seven days stay scannable. Tapping opens the day in place: the prescribed
 * session, what was actually logged, and the entry point for recording. iOS
 * Reminders and Google Calendar both open the row rather than a sheet for this
 * exact reason: the surrounding days stay visible while you read one.
 */
export function DayRow({
  iso,
  weekday,
  dateNum,
  isToday,
  isPast,
  events,
  activities,
  matches,
  open,
  onToggle,
  onRecord,
}: DayRowProps) {
  const primary = events[0] ?? null;
  const match = primary ? matches?.get(primary.event_id) : undefined;
  const status = primary ? (match?.status ?? (isPast ? "missed" : null)) : null;
  const plannedTss = events.reduce((sum, event) => sum + (event.predicted_tss ?? 0), 0);
  const actualTss = activities.reduce((sum, activity) => sum + (activity.tss ?? 0), 0);
  const prescription = primary?.workout_prescription ?? null;
  const prescriptionPace =
    prescription?.pace_min_s_km != null && prescription?.pace_max_s_km != null
      ? `${formatPaceFromSeconds(prescription.pace_min_s_km)}–${formatPaceFromSeconds(prescription.pace_max_s_km)}/km`
      : null;

  const title = primary
    ? `${primary.name ?? "训练"}${events.length > 1 ? ` +${events.length - 1}` : ""}`
    : activities.length > 0
      ? [...new Set(activities.map((activity) => getSportConfig(activity.sport).label))].join("、")
      : "未安排";

  const meta = primary
    ? [
        plannedTss > 0 ? `预计 ${Math.round(plannedTss)} TSS` : null,
        prescription ? `${prescription.duration_min} 分钟` : null,
        activities.length > 0 ? `实际 ${actualTss > 0 ? `${Math.round(actualTss)} TSS` : "已记录"}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : activities.length > 0
      ? `${activities.length} 次 · ${formatDistance(
          activities.reduce((sum, activity) => sum + (activity.distance_m ?? 0), 0),
        )}`
      : events.length === 0 && isPast
        ? "休息"
        : "";

  return (
    <div className="border-b border-border-subtle last:border-b-0" data-testid={`day-row-${iso}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${weekday} ${dateNum}日 ${title}`}
        className={`row-press focus-ring flex min-h-14 w-full items-center gap-3 px-5 py-2 text-left hover:bg-surface-overlay ${
          isToday ? "bg-accent/5" : ""
        }`}
      >
        <span className="flex w-9 shrink-0 flex-col items-center">
          <span
            className={`text-caption1 ${
              isToday ? "font-semibold text-accent-strong" : "text-text-muted"
            }`}
          >
            {weekday}
          </span>
          <span
            className={`font-mono text-title3 tabular-nums ${
              isToday ? "text-accent-strong" : "text-text-primary"
            }`}
          >
            {dateNum}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-subheadline text-text-primary">{title}</span>
            {status && MATCH_LABEL[status] ? (
              <span className={`shrink-0 text-caption1 ${MATCH_TONE[status]}`}>
                {MATCH_LABEL[status]}
              </span>
            ) : null}
          </span>
          {meta ? (
            <span className="mt-0.5 block truncate font-mono text-caption1 tabular-nums text-text-muted">
              {meta}
            </span>
          ) : null}
        </span>
        {open ? (
          <ChevronUp className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="space-y-3 px-1 pb-4 pl-[3.25rem]">
          {events.map((event) => {
            const eventMatch = matches?.get(event.event_id);
            return (
              <div key={event.event_id} className="space-y-0.5">
                <p className="text-subheadline text-text-primary">{event.name ?? "训练"}</p>
                <p className="text-caption1 text-text-muted">
                  {[
                    event.workout_prescription?.type,
                    event.predicted_tss != null ? `${Math.round(event.predicted_tss)} TSS` : null,
                    event.workout_prescription
                      ? `${event.workout_prescription.duration_min} 分钟`
                      : null,
                    prescriptionPace,
                    eventMatch ? MATCH_LABEL[eventMatch.status] : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            );
          })}

          {activities.length > 0 && (
            <div className="space-y-2">
              {activities.map((activity) => (
                <Link
                  key={activity.activity_id}
                  href={`/activities/${activity.activity_id}`}
                  className="focus-ring flex min-h-11 items-center justify-between gap-2 rounded-lg bg-surface-overlay/60 px-3 text-caption1 transition-colors hover:bg-surface-overlay"
                >
                  <span className="truncate text-text-primary">
                    {getSportConfig(activity.sport).label}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-text-secondary">
                    {activity.distance_m
                      ? formatDistance(activity.distance_m)
                      : formatDuration(activity.duration_s)}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onRecord}
            className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-subtle px-3 text-caption1 text-text-secondary transition-colors hover:text-text-primary"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {activities.length > 0 ? "补录训练" : "记录训练"}
          </button>
        </div>
      )}
    </div>
  );
}
