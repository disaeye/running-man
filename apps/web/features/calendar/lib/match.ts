import type { CalendarEventDTO } from "../components/types";
import type { ActivitySummary } from "@shared/types/activity";
import { activityLocalDay, DEFAULT_TIMEZONE } from "@shared/lib/training-day";

/** Client-side planned-vs-actual match status. Mirrors domain/calendar/match.py. */
export type MatchStatus = "completed" | "partial" | "missed";

export interface EventMatch {
  event_id: string;
  status: MatchStatus;
  actual_tss: number | null;
  actual_activity_id: string | null;
}

/** Match a single planned event to nearby activities (±1 day, same sport). */
export function matchEventToActivity(
  event: CalendarEventDTO,
  activities: ActivitySummary[],
  tolerance = 0.2,
  timezone = DEFAULT_TIMEZONE,
): EventMatch {
  const plannedDay = activityLocalDay(event.start_time, timezone);
  const plannedSport = event.sport_type ?? "";
  const plannedTss = event.predicted_tss ?? null;

  const candidate = findBestMatch(plannedDay, plannedSport, activities, timezone);

  if (!candidate) {
    return {
      event_id: event.event_id,
      status: "missed",
      actual_tss: null,
      actual_activity_id: null,
    };
  }

  const actualTss = candidate.tss ?? 0;
  if (plannedTss != null && plannedTss > 0) {
    const ratio = actualTss / plannedTss;
    const withinTolerance = Math.abs(1.0 - ratio) <= tolerance;
    return {
      event_id: event.event_id,
      status: withinTolerance ? "completed" : "partial",
      actual_tss: actualTss,
      actual_activity_id: candidate.activity_id,
    };
  }

  return {
    event_id: event.event_id,
    status: "completed",
    actual_tss: actualTss,
    actual_activity_id: candidate.activity_id,
  };
}

function findBestMatch(
  plannedDay: string,
  plannedSport: string,
  activities: ActivitySummary[],
  timezone: string,
): ActivitySummary | null {
  for (const act of activities) {
    const actDay = activityLocalDay(act.start_time, timezone);
    const dayDiff = Math.abs(daysBetween(plannedDay, actDay));
    if (dayDiff > 1) continue;
    if (!sportMatches(plannedSport, act.sport)) continue;
    return act;
  }
  return null;
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.round((parseDate(a) - parseDate(b)) / msPerDay);
}

function parseDate(iso: string): number {
  return Date.parse(iso);
}

function sportMatches(planned: string, actual: string): boolean {
  if (!planned || !actual) return true;
  const plannedL = planned.toLowerCase();
  const actualL = actual.toLowerCase();
  if (plannedL === actualL) return true;
  const runVariants = new Set(["run", "trailrun", "virtualrun"]);
  const rideVariants = new Set(["ride", "virtualride"]);
  if (runVariants.has(plannedL) && runVariants.has(actualL)) return true;
  if (rideVariants.has(plannedL) && rideVariants.has(actualL)) return true;
  return false;
}

/** Compute match status for a list of events against activities. */
export function computeWeekMatches(
  events: CalendarEventDTO[],
  activities: ActivitySummary[],
  timezone = DEFAULT_TIMEZONE,
): Map<string, EventMatch> {
  const result = new Map<string, EventMatch>();
  const matchedActivityIds = new Set<string>();

  for (const event of events) {
    if (event.training_type === "race") continue;
    const filtered = activities.filter(
      (a) => !matchedActivityIds.has(a.activity_id),
    );
    const match = matchEventToActivity(event, filtered, 0.2, timezone);
    result.set(event.event_id, match);
    if (match.actual_activity_id) matchedActivityIds.add(match.actual_activity_id);
  }
  return result;
}

/** Check if an event is synced from Intervals.icu. */
export function isIntervalsEvent(event: CalendarEventDTO): boolean {
  return !!event.external_id?.startsWith("intervals:");
}

/** Whether an event is a planned workout in the past. */
export function isPastPlanned(event: CalendarEventDTO, todayIso: string): boolean {
  const eventDay = event.start_time.slice(0, 10);
  return eventDay < todayIso && event.predicted_tss != null && event.predicted_tss > 0;
}
