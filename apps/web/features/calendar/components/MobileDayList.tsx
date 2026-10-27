"use client";

import { useMemo } from "react";
import { activityLocalDay, useAthleteTimezone } from "@shared/lib/training-day";
import { toISODate } from "@shared/lib/format";
import type { ActivitySummary } from "@shared/types/activity";
import { DayRow } from "./DayRow";
import type { CalendarEventDTO } from "./types";
import type { EventMatch } from "../lib/match";

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

interface DayEntry {
  readonly iso: string;
  readonly date: Date;
  readonly weekday: string;
  readonly dateNum: number;
  readonly isToday: boolean;
  readonly isPast: boolean;
  readonly events: readonly CalendarEventDTO[];
  readonly activities: readonly ActivitySummary[];
}

interface DayGroup {
  readonly key: string;
  readonly label: string | null;
  readonly entries: readonly DayEntry[];
}

export interface MobileDayListProps {
  /** Days to render in order: one week, or every day of a month. */
  readonly days: readonly Date[];
  readonly events: readonly CalendarEventDTO[];
  readonly activities: ReadonlyMap<string, readonly ActivitySummary[]>;
  readonly matches?: Map<string, EventMatch>;
  readonly today: string;
  readonly openIso: string | null;
  readonly onToggleDay: (iso: string) => void;
  readonly onRecord: (iso: string) => void;
}

function mondayOf(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function short(value: Date): string {
  return toISODate(value).slice(5);
}

/**
 * The mobile schedule: consecutive days as rows, grouped by week when the range
 * is longer than one week.
 *
 * A phone cannot show a seven-column grid and a month cannot fit a table, so the
 * schedule is a list of days in reading order. The week label is only printed
 * when the list spans weeks, where it is the only thing telling two Mondays
 * apart.
 */
export function MobileDayList({
  days,
  events,
  activities,
  matches,
  today,
  openIso,
  onToggleDay,
  onRecord,
}: MobileDayListProps) {
  const timezone = useAthleteTimezone();

  const groups = useMemo<readonly DayGroup[]>(() => {
    const eventsByDay = new Map<string, CalendarEventDTO[]>();
    for (const event of events) {
      const key = activityLocalDay(event.start_time, timezone);
      const bucket = eventsByDay.get(key);
      if (bucket) bucket.push(event);
      else eventsByDay.set(key, [event]);
    }

    const entries: DayEntry[] = days.map((date) => {
      const iso = toISODate(date);
      return {
        iso,
        date,
        weekday: WEEKDAY[date.getDay()] ?? "",
        dateNum: date.getDate(),
        isToday: iso === today,
        isPast: iso < today,
        events: eventsByDay.get(iso) ?? [],
        activities: activities.get(iso) ?? [],
      };
    });

    if (entries.length <= 7) return [{ key: "single", label: null, entries }];

    const byWeek = new Map<string, DayEntry[]>();
    for (const entry of entries) {
      const key = toISODate(mondayOf(entry.date));
      const bucket = byWeek.get(key);
      if (bucket) bucket.push(entry);
      else byWeek.set(key, [entry]);
    }
    return Array.from(byWeek.entries()).map(([key, weekEntries]) => {
      const first = weekEntries[0];
      const last = weekEntries[weekEntries.length - 1];
      return {
        key,
        label: first && last ? `${short(first.date)} ~ ${short(last.date)}` : null,
        entries: weekEntries,
      };
    });
  }, [days, events, activities, timezone, today]);

  return (
    <div className="divide-y divide-border-subtle" data-testid="mobile-day-list">
      {groups.map((group) => (
        <div key={group.key} className="py-1 first:pt-0 last:pb-0">
          {group.label ? (
            <p className="px-1 pb-1 pt-2 font-mono text-caption1 text-text-muted">{group.label}</p>
          ) : null}
          <div className="divide-y divide-border-subtle">
            {group.entries.map((entry) => (
              <DayRow
                key={entry.iso}
                iso={entry.iso}
                weekday={entry.weekday}
                dateNum={entry.dateNum}
                isToday={entry.isToday}
                isPast={entry.isPast}
                events={entry.events}
                activities={entry.activities}
                matches={matches}
                open={openIso === entry.iso}
                onToggle={() => onToggleDay(entry.iso)}
                onRecord={() => onRecord(entry.iso)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
