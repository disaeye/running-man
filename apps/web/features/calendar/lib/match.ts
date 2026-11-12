import type { CalendarEventDTO } from "../components/types";
import type { ActivitySummary } from "@shared/types/activity";
import { getSportConfig } from "@shared/config/sport-config";
import { activityLocalDay, DEFAULT_TIMEZONE } from "@shared/lib/training-day";

/** 按实际时长与处方时长比较计划完成状态。 */
export type MatchStatus = "completed" | "partial" | "missed";
export type DayEventStatus = "completed" | "partial" | "upcoming" | "missed";

export interface EventMatch {
  event_id: string;
  status: MatchStatus;
  actual_activity_id: string | null;
}

export interface DayEventMatch {
  readonly eventId: string;
  readonly status: DayEventStatus;
  readonly activityId: string | null;
  /** 当天有多条同类活动或多节课竞争同一条活动时，需要人工确认归属。 */
  readonly ambiguous: boolean;
}

export function sportMatches(planned: string, actual: string): boolean {
  if (!planned || !actual) return true;
  const plannedL = planned.toLowerCase();
  const actualL = actual.toLowerCase();
  if (plannedL === actualL) return true;
  const plannedFamily = getSportConfig(planned).family;
  const actualFamily = getSportConfig(actual).family;
  if (plannedFamily !== "unknown" && actualFamily !== "unknown") {
    return plannedFamily === actualFamily;
  }
  return false;
}

function resolveDurationStatus(
  event: CalendarEventDTO,
  candidate: ActivitySummary,
  tolerance: number,
): "completed" | "partial" {
  const plannedMin = event.workout_prescription?.duration_min;
  const durationRatio =
    plannedMin != null && plannedMin > 0 && candidate.duration_s != null
      ? candidate.duration_s / 60 / plannedMin
      : null;
  const withinTolerance =
    durationRatio == null || Math.abs(1 - durationRatio) <= tolerance;
  return withinTolerance ? "completed" : "partial";
}

/** 将计划活动与关联活动或前后一天内、运动类型相同的实际活动匹配。 */
export function matchEventToActivity(
  event: CalendarEventDTO,
  activities: ActivitySummary[],
  tolerance = 0.2,
  timezone = DEFAULT_TIMEZONE,
): EventMatch {
  const candidate = event.linked_activity_id
    ? activities.find((a) => a.activity_id === event.linked_activity_id) ?? null
    : findBestMatch(
        activityLocalDay(event.start_time, timezone),
        event.sport_type ?? "",
        activities,
        timezone,
      );

  if (!candidate) {
    return {
      event_id: event.event_id,
      status: event.done ? "completed" : "missed",
      actual_activity_id: event.linked_activity_id ?? null,
    };
  }

  return {
    event_id: event.event_id,
    status: resolveDurationStatus(event, candidate, tolerance),
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

/** 单日内逐课匹配：优先绑定 linked_activity_id，再用当天空闲的同运动族活动。 */
export function matchDayEvents(
  day: string,
  today: string,
  events: readonly CalendarEventDTO[],
  activities: readonly ActivitySummary[],
  tolerance = 0.2,
): ReadonlyMap<string, DayEventMatch> {
  const result = new Map<string, DayEventMatch>();
  const usedActivityIds = new Set<string>();
  const activeEvents = events.filter((e) => e.status !== "deleted");

  // 第一轮：先匹配明确绑定了 linked_activity_id 的课表，避免被未绑定课表抢占。
  for (const event of activeEvents) {
    if (!event.linked_activity_id) continue;
    const linked = activities.find(
      (a) =>
        a.activity_id === event.linked_activity_id &&
        !usedActivityIds.has(a.activity_id),
    );
    if (linked) {
      usedActivityIds.add(linked.activity_id);
      result.set(event.event_id, {
        eventId: event.event_id,
        status: resolveDurationStatus(event, linked, tolerance),
        activityId: linked.activity_id,
        ambiguous: false,
      });
    } else if (event.done) {
      result.set(event.event_id, {
        eventId: event.event_id,
        status: "completed",
        activityId: event.linked_activity_id,
        ambiguous: false,
      });
    }
  }

  // 第二轮：对其余未匹配的课表，用当天同运动族空闲活动匹配；
  // 候选多于一条或后续课表争抢同一批活动时标记待确认，交给关联操作解决归属。
  for (const event of activeEvents) {
    if (result.has(event.event_id)) continue;
    if (event.done) {
      result.set(event.event_id, {
        eventId: event.event_id,
        status: "completed",
        activityId: event.linked_activity_id ?? null,
        ambiguous: false,
      });
      continue;
    }
    const candidates = activities.filter(
      (a) =>
        !usedActivityIds.has(a.activity_id) &&
        sportMatches(event.sport_type ?? "", a.sport),
    );
    const candidate = candidates[0] ?? null;
    const contested =
      candidates.length > 1 ||
      _contendedByLaterEvent(activeEvents, event, activities, usedActivityIds);
    if (candidate) {
      usedActivityIds.add(candidate.activity_id);
      result.set(event.event_id, {
        eventId: event.event_id,
        status: resolveDurationStatus(event, candidate, tolerance),
        activityId: candidate.activity_id,
        ambiguous: contested,
      });
    } else {
      result.set(event.event_id, {
        eventId: event.event_id,
        status: day < today ? "missed" : "upcoming",
        activityId: null,
        ambiguous: false,
      });
    }
  }
  return result;
}

/** 后面还有未匹配的同族课表会争抢同一批活动时，当前归属不确定。 */
function _contendedByLaterEvent(
  events: readonly CalendarEventDTO[],
  current: CalendarEventDTO,
  activities: readonly ActivitySummary[],
  usedActivityIds: ReadonlySet<string>,
): boolean {
  const rest = events.filter(
    (event) =>
      event.event_id !== current.event_id &&
      !event.done &&
      !event.linked_activity_id,
  );
  if (rest.length === 0) return false;
  const free = activities.filter((a) => !usedActivityIds.has(a.activity_id));
  if (free.length === 0) return false;
  return rest.some((event) => free.some((a) => sportMatches(event.sport_type ?? "", a.sport)));
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
