import type { CalendarEventDTO } from "../components/types";
import type { ActivitySummary } from "@shared/types/activity";
import { activityLocalDay, DEFAULT_TIMEZONE } from "@shared/lib/training-day";

/** 按实际时长与处方时长比较计划完成状态。 */
export type MatchStatus = "completed" | "partial" | "missed";

export interface EventMatch {
  event_id: string;
  status: MatchStatus;
  actual_activity_id: string | null;
}

/** 将计划活动与前后一天内、运动类型相同的实际活动匹配。 */
export function matchEventToActivity(
  event: CalendarEventDTO,
  activities: ActivitySummary[],
  tolerance = 0.2,
  timezone = DEFAULT_TIMEZONE,
): EventMatch {
  const plannedDay = activityLocalDay(event.start_time, timezone);
  const plannedSport = event.sport_type ?? "";
  const candidate = findBestMatch(plannedDay, plannedSport, activities, timezone);

  if (!candidate) {
    return {
      event_id: event.event_id,
      status: "missed",
      actual_activity_id: null,
    };
  }

  const durationRatio = event.workout_prescription?.duration_min != null && candidate.duration_s != null
    ? candidate.duration_s / 60 / event.workout_prescription.duration_min
    : null;
  const withinTolerance = durationRatio == null || Math.abs(1 - durationRatio) <= tolerance;
  return {
    event_id: event.event_id,
    status: withinTolerance ? "completed" : "partial",
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
  if (runVariants.has(plannedL) && runVariants.has(actualL)) return true;
  return false;
}

/** 计算一组计划活动与实际活动的匹配状态。 */
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

/** 判断计划活动是否来自 Intervals.icu。 */
export function isIntervalsEvent(event: CalendarEventDTO): boolean {
  return !!event.external_id?.startsWith("intervals:");
}

/** 判断计划活动是否已经过期。 */
export function isPastPlanned(event: CalendarEventDTO, todayIso: string): boolean {
  const eventDay = event.start_time.slice(0, 10);
  return eventDay < todayIso && event.workout_prescription != null;
}
