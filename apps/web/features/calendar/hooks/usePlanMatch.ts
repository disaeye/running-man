"use client";

import { useMemo } from "react";
import { useActivities } from "@features/activity/hooks/useActivities";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { computeWeekMatches, type EventMatch } from "../lib/match";
import { useAthleteTimezone } from "@shared/lib/training-day";

interface UsePlanMatchResult {
  matches: Map<string, EventMatch>;
  completed: number;
  total: number;
  loading: boolean;
  error: string | null;
}

/**
 * Compute planned-vs-actual match status using the athlete's local training day.
 * Fetches actual activities for the range and matches them against planned events.
 */
export function usePlanMatch(
  from: string,
  to: string,
  events: CalendarEventDTO[],
): UsePlanMatchResult {
  const timezone = useAthleteTimezone();
  const { data: activities, loading, error } = useActivities(from, to);

  const matches = useMemo(
    () => computeWeekMatches(events, activities, timezone),
    [events, activities, timezone],
  );

  const { completed, total } = useMemo(() => {
    let done = 0;
    let count = 0;
    for (const [eventId, match] of matches) {
      const ev = events.find((e) => e.event_id === eventId);
      if (!ev || ev.predicted_tss == null || ev.predicted_tss <= 0) continue;
      count++;
      if (match.status === "completed") done++;
    }
    return { completed: done, total: count };
  }, [matches, events]);

  return { matches, completed, total, loading, error };
}
