"use client";

import { useMemo } from "react";
import { Section } from "@shared/ui/Section";
import { WeekStrip } from "@shared/ui/WeekStrip";
import type { ActivitySummary } from "@shared/types/activity";
import { MobileDayList } from "./MobileDayList";
import type { CalendarEventDTO } from "./types";
import type { EventMatch } from "../lib/match";
import { buildStripDays } from "../lib/week-strip";

/**
 * The phone schedule: a week strip for orientation, the days as rows under it.
 *
 * The strip is the selector — one tap opens that day's row and scrolls it into
 * view — so the calendar reads like a phone calendar instead of a page of
 * stacked panels.
 */
export function MobileSchedule({
  days,
  events,
  activities,
  matches,
  today,
  timezone,
  monthView,
  openIso,
  onSelectDay,
  onToggleDay,
  onRecord,
}: {
  readonly days: readonly Date[];
  readonly events: readonly CalendarEventDTO[];
  readonly activities: ReadonlyMap<string, readonly ActivitySummary[]>;
  readonly matches?: Map<string, EventMatch>;
  readonly today: string;
  readonly timezone: string;
  readonly monthView: boolean;
  readonly openIso: string | null;
  readonly onSelectDay: (iso: string) => void;
  readonly onToggleDay: (iso: string) => void;
  readonly onRecord: (iso: string) => void;
}) {
  const stripDays = useMemo(
    () => buildStripDays({ days, events, activities, today, timezone }),
    [days, events, activities, today, timezone],
  );

  return (
    <div className="space-y-4">
      <Section title={monthView ? "本月" : "本周"} testId="calendar-week-strip">
        <div className="p-1.5">
          <WeekStrip days={stripDays} selectedIso={openIso} onSelect={onSelectDay} />
        </div>
      </Section>
      <Section title={monthView ? "本月日程" : "本周日程"} testId="calendar-day-list">
        <MobileDayList
          days={days}
          events={events}
          activities={activities}
          matches={matches}
          today={today}
          openIso={openIso}
          onToggleDay={onToggleDay}
          onRecord={onRecord}
        />
      </Section>
    </div>
  );
}
